use std::collections::{HashMap, HashSet};
use std::cell::RefCell;
use std::rc::Rc;
use web_sys::{WebGl2RenderingContext, WebGlTexture, HtmlImageElement};
use wasm_bindgen::prelude::*;
use wasm_bindgen::closure::Closure;
use wasm_bindgen::JsCast;

use crate::projection::Viewport;
use crate::error::RustyleafError;
use crate::OwnedTexture;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct TileCoord {
    pub x: i32,
    pub y: i32,
    pub z: u32,
}

#[derive(Clone)]
pub struct Tile {
    #[allow(dead_code)] // tiles are keyed by string today; coord kept for typed cache keys
    pub coord: TileCoord,
    pub texture: Option<WebGlTexture>,
    pub loading: bool,
}

#[derive(Clone)]
pub struct TileLayer {
    pub url_template: String,
    pub subdomains: Vec<String>,
    #[allow(dead_code)] // not yet enforced during tile loading
    pub max_zoom: u32,
    #[allow(dead_code)] // not yet enforced during tile loading
    pub min_zoom: u32,
}

pub struct TileLoader {
    pub textures: Rc<RefCell<HashMap<String, OwnedTexture>>>,
    pub tiles: HashMap<String, Tile>,
    pub requested: HashSet<String>,
    // Keyed by tile key so completed loads can be released in cleanup_old_tiles.
    // The image is kept alongside its closure so handlers can be detached
    // before the closure is dropped — otherwise a still-loading image fires
    // "closure invoked recursively or after being dropped".
    pub closures: HashMap<String, TileLoadHandler>,
}

// An in-flight tile load: the image and the onload/onerror closure bound to it.
pub type TileLoadHandler = (HtmlImageElement, Closure<dyn FnMut()>);

impl TileLoader {
    pub fn new() -> Self {
        Self {
            textures: Rc::new(RefCell::new(HashMap::new())),
            tiles: HashMap::new(),
            requested: HashSet::new(),
            closures: HashMap::new(),
        }
    }

    // Detach handlers before dropping, so in-flight images can never invoke
    // a dropped closure (used on destroy/context-loss).
    pub fn release_all_closures(&mut self) {
        for (_key, (image, _closure)) in self.closures.drain() {
            image.set_onload(None);
            image.set_onerror(None);
        }
    }

    pub fn cleanup_old_tiles(&mut self, viewport: &Viewport) {
        let current_zoom = viewport.zoom.round() as u32;
        let visible_keys = visible_tile_keys(viewport, current_zoom);
        let max_cache_size = (visible_keys.len() * 3).max(20);

        let mut textures = self.textures.borrow_mut();

        // Release onload closures for tiles whose load has definitively completed
        // (texture exists). In-flight loads keep their closure alive. Must run
        // before eviction below so completed-then-evicted tiles are covered.
        let done: Vec<String> = self
            .closures
            .keys()
            .filter(|key| textures.contains_key(*key))
            .cloned()
            .collect();
        for key in done {
            if let Some((image, _closure)) = self.closures.remove(&key) {
                image.set_onload(None);
                image.set_onerror(None);
            }
        }

        let keys_to_remove: Vec<String> = textures
            .iter()
            .filter(|(key, _)| {
                let parts: Vec<&str> = key.split('/').collect();
                if parts.len() == 3 {
                    if let Ok(zoom) = parts[0].parse::<u32>() {
                        zoom != current_zoom
                    } else {
                        true
                    }
                } else {
                    true
                }
            })
            .map(|(key, _)| key.clone())
            .collect();

        // OwnedTexture::Drop deletes the GL texture when removed from the map.
        for key in keys_to_remove {
            textures.remove(&key);
        }

        if textures.len() > max_cache_size {
            let overflow = textures.len() - max_cache_size;
            let to_remove: Vec<String> = textures
                .keys()
                .filter(|k| !visible_keys.contains(*k))
                .take(overflow)
                .cloned()
                .collect();
            for key in to_remove {
                textures.remove(&key);
            }
        }

        if self.requested.len() > 50 {
            self.requested.retain(|key| {
                let parts: Vec<&str> = key.split('/').collect();
                if parts.len() == 3 {
                    if let Ok(zoom) = parts[0].parse::<u32>() {
                        zoom == current_zoom
                    } else {
                        false
                    }
                } else {
                    false
                }
            });
        }
    }

    pub fn load_visible_tiles(
        &mut self,
        viewport: &Viewport,
        tile_layer: &TileLayer,
        context: &WebGl2RenderingContext,
        tile_size: u32,
    ) {
        self.cleanup_old_tiles(viewport);
        let zoom = viewport.zoom.round() as u32;
        let center_pixel =
            viewport.lat_lng_to_pixel(viewport.center_lat, viewport.center_lng, zoom);

        let start_x = center_pixel.0 - (viewport.width as f64 / 2.0);
        let start_y = center_pixel.1 - (viewport.height as f64 / 2.0);

        let start_tile_x = (start_x / tile_size as f64).floor() as i32;
        let start_tile_y = (start_y / tile_size as f64).floor() as i32;

        let tiles_x = (viewport.width as f64 / tile_size as f64).ceil() as i32 + 1;
        let tiles_y = (viewport.height as f64 / tile_size as f64).ceil() as i32 + 1;

        let mut load_count = 0;
        let max_load_per_frame = 3;

        let world_tiles = 1i64 << zoom.min(30);
        for x in start_tile_x..(start_tile_x + tiles_x) {
            for y in start_tile_y..(start_tile_y + tiles_y) {
                // Wrap horizontally (the world repeats); latitude does not wrap.
                let wrapped_x = (((x as i64 % world_tiles) + world_tiles) % world_tiles) as i32;
                if y >= 0 && (y as i64) < world_tiles {
                    let tile_coord = TileCoord { x: wrapped_x, y, z: zoom };
                    let tile_key = format!("{}/{}/{}", zoom, wrapped_x, y);
                    let already_requested = self.requested.contains(&tile_key);
                    let already_cached = self.textures.borrow().contains_key(&tile_key);

                    if !already_requested && !already_cached && load_count < max_load_per_frame {
                        let tile = Tile {
                            coord: tile_coord.clone(),
                            texture: None,
                            loading: false,
                        };
                        self.tiles.insert(tile_key.clone(), tile);
                        self.requested.insert(tile_key.clone());
                        self.load_tile(tile_coord, tile_layer, context);
                        load_count += 1;
                    }
                }
            }
        }
    }

    pub fn load_tile(
        &mut self,
        coord: TileCoord,
        tile_layer: &TileLayer,
        context: &WebGl2RenderingContext,
    ) {
        let tile_key = format!("{}/{}/{}", coord.z, coord.x, coord.y);
        let url = {
            let subdomain = tile_layer
                .subdomains
                .get(((coord.x + coord.y) as usize) % tile_layer.subdomains.len())
                .cloned()
                .unwrap_or_else(|| "a".to_string());
            let mut url = tile_layer
                .url_template
                .replace("{s}", &subdomain)
                .replace("{z}", &coord.z.to_string())
                .replace("{x}", &coord.x.to_string())
                .replace("{y}", &coord.y.to_string());
            // WMS support: substitute the tile's EPSG:3857 bounding box
            // (minx,miny,maxx,maxy in meters), as used by GetMap requests.
            if url.contains("{bbox-epsg-3857}") {
                const HALF_WORLD_M: f64 = 20037508.342789244;
                let tiles_per_axis = (1u64 << coord.z.min(31)) as f64;
                let tile_size_m = (HALF_WORLD_M * 2.0) / tiles_per_axis;
                let min_x = -HALF_WORLD_M + coord.x as f64 * tile_size_m;
                let max_y = HALF_WORLD_M - coord.y as f64 * tile_size_m;
                let bbox = format!("{},{},{},{}", min_x, max_y - tile_size_m, min_x + tile_size_m, max_y);
                url = url.replace("{bbox-epsg-3857}", &bbox);
            }
            url
        };

        if let Some(tile) = self.tiles.get_mut(&tile_key) {
            if tile.loading || tile.texture.is_some() {
                return;
            }
            tile.loading = true;
        }

        // A load for this key is already in flight (closure registered, no
        // texture yet). Starting another would drop the old closure while its
        // image can still fire ("closure invoked after being dropped").
        if self.closures.contains_key(&tile_key) && !self.textures.borrow().contains_key(&tile_key) {
            return;
        }

        let image = match HtmlImageElement::new() {
            Ok(img) => img,
            Err(_) => {
                web_sys::console::error_1(
                    &JsValue::from(RustyleafError::DomError("Failed to create HTMLImageElement".into())),
                );
                return;
            }
        };
        image.set_cross_origin(Some("anonymous"));

        let tile_key_clone = tile_key.clone();
        let img_clone = image.clone();
        let context_clone = context.clone();
        let tile_textures = Rc::clone(&self.textures);

        let onload_closure = Closure::wrap(Box::new(move || {
            let texture = match context_clone.create_texture() {
                Some(tex) => tex,
                None => {
                    web_sys::console::error_1(&JsValue::from(RustyleafError::TextureCreation(format!(
                        "Failed to create texture for tile: {}",
                        tile_key_clone
                    ))));
                    return;
                }
            };
            context_clone.bind_texture(WebGl2RenderingContext::TEXTURE_2D, Some(&texture));

            context_clone.tex_parameteri(
                WebGl2RenderingContext::TEXTURE_2D,
                WebGl2RenderingContext::TEXTURE_WRAP_S,
                WebGl2RenderingContext::CLAMP_TO_EDGE as i32,
            );
            context_clone.tex_parameteri(
                WebGl2RenderingContext::TEXTURE_2D,
                WebGl2RenderingContext::TEXTURE_WRAP_T,
                WebGl2RenderingContext::CLAMP_TO_EDGE as i32,
            );
            context_clone.tex_parameteri(
                WebGl2RenderingContext::TEXTURE_2D,
                WebGl2RenderingContext::TEXTURE_MIN_FILTER,
                WebGl2RenderingContext::LINEAR as i32,
            );
            context_clone.tex_parameteri(
                WebGl2RenderingContext::TEXTURE_2D,
                WebGl2RenderingContext::TEXTURE_MAG_FILTER,
                WebGl2RenderingContext::LINEAR as i32,
            );

            let result = context_clone.tex_image_2d_with_u32_and_u32_and_html_image_element(
                WebGl2RenderingContext::TEXTURE_2D,
                0,
                WebGl2RenderingContext::RGBA as i32,
                WebGl2RenderingContext::RGBA,
                WebGl2RenderingContext::UNSIGNED_BYTE,
                &img_clone,
            );

            if result.is_ok() {
                tile_textures
                    .borrow_mut()
                    .insert(tile_key_clone.clone(), OwnedTexture::new(&context_clone, texture));
            }
        }) as Box<dyn FnMut()>);

        image.set_onload(Some(onload_closure.as_ref().unchecked_ref()));
        image.set_onerror(Some(onload_closure.as_ref().unchecked_ref()));
        self.closures.insert(tile_key, (image.clone(), onload_closure));

        image.set_src(&url);
    }
}

fn visible_tile_keys(viewport: &Viewport, zoom: u32) -> HashSet<String> {
    let center_pixel =
        viewport.lat_lng_to_pixel(viewport.center_lat, viewport.center_lng, zoom);
    let start_x = center_pixel.0 - (viewport.width as f64 / 2.0);
    let start_y = center_pixel.1 - (viewport.height as f64 / 2.0);
    let start_tile_x = (start_x / viewport.tile_size as f64).floor() as i32;
    let start_tile_y = (start_y / viewport.tile_size as f64).floor() as i32;
    let tiles_x = (viewport.width as f64 / viewport.tile_size as f64).ceil() as i32 + 2;
    let tiles_y = (viewport.height as f64 / viewport.tile_size as f64).ceil() as i32 + 2;

    let mut keys = HashSet::new();
    let world_tiles = 1i64 << zoom.min(30);
    for i in 0..tiles_x {
        for j in 0..tiles_y {
            let tile_x = (start_tile_x + i) as i64;
            let tile_y = (start_tile_y + j) as i64;
            if tile_y >= 0 && tile_y < world_tiles {
                let wrapped_x = ((tile_x % world_tiles) + world_tiles) % world_tiles;
                keys.insert(format!("{}/{}/{}", zoom, wrapped_x, tile_y));
            }
        }
    }
    keys
}
