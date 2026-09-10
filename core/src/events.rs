use wasm_bindgen::prelude::*;
use js_sys::{Array, Function};
use crate::error::RustyleafError;

pub struct EventSystem {
    pub move_callbacks: Vec<Function>,
    pub zoom_callbacks: Vec<Function>,
    pub click_callbacks: Vec<Function>,
    pub hover_callbacks: Vec<Function>,
    pub mousedown_callbacks: Vec<Function>,
    pub mouseup_callbacks: Vec<Function>,
    pub contextmenu_callbacks: Vec<Function>,
    pub keydown_callbacks: Vec<Function>,
    pub keyup_callbacks: Vec<Function>,
    pub dragend_callbacks: Vec<Function>,
}

impl EventSystem {
    pub fn new() -> Self {
        Self {
            move_callbacks: Vec::new(),
            zoom_callbacks: Vec::new(),
            click_callbacks: Vec::new(),
            hover_callbacks: Vec::new(),
            mousedown_callbacks: Vec::new(),
            mouseup_callbacks: Vec::new(),
            contextmenu_callbacks: Vec::new(),
            keydown_callbacks: Vec::new(),
            keyup_callbacks: Vec::new(),
            dragend_callbacks: Vec::new(),
        }
    }

    pub fn on_move(&mut self, callback: &Function) {
        self.move_callbacks.push(callback.clone());
    }

    pub fn on_zoom(&mut self, callback: &Function) {
        self.zoom_callbacks.push(callback.clone());
    }

    pub fn on_click(&mut self, callback: &Function) {
        self.click_callbacks.push(callback.clone());
    }

    pub fn on_hover(&mut self, callback: &Function) {
        self.hover_callbacks.push(callback.clone());
    }

    pub fn on_mousedown(&mut self, callback: &Function) {
        self.mousedown_callbacks.push(callback.clone());
    }

    pub fn on_mouseup(&mut self, callback: &Function) {
        self.mouseup_callbacks.push(callback.clone());
    }

    pub fn on_contextmenu(&mut self, callback: &Function) {
        self.contextmenu_callbacks.push(callback.clone());
    }

    pub fn on_keydown(&mut self, callback: &Function) {
        self.keydown_callbacks.push(callback.clone());
    }

    pub fn on_keyup(&mut self, callback: &Function) {
        self.keyup_callbacks.push(callback.clone());
    }

    pub fn on_dragend(&mut self, callback: &Function) {
        self.dragend_callbacks.push(callback.clone());
    }

    pub fn off_move(&mut self, callback: &Function) {
        self.move_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_zoom(&mut self, callback: &Function) {
        self.zoom_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_click(&mut self, callback: &Function) {
        self.click_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_hover(&mut self, callback: &Function) {
        self.hover_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_mousedown(&mut self, callback: &Function) {
        self.mousedown_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_mouseup(&mut self, callback: &Function) {
        self.mouseup_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_contextmenu(&mut self, callback: &Function) {
        self.contextmenu_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_keydown(&mut self, callback: &Function) {
        self.keydown_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_keyup(&mut self, callback: &Function) {
        self.keyup_callbacks.retain(|cb| cb != callback);
    }

    pub fn off_dragend(&mut self, callback: &Function) {
        self.dragend_callbacks.retain(|cb| cb != callback);
    }
}

/// Invoke every registered callback with the given event object.
///
/// Iterates a SNAPSHOT so listeners that (de)register during dispatch cannot
/// abort the loop, and isolates failures: a throwing listener is reported on
/// the console but never prevents the remaining listeners from running.
/// (Calling any wasm method from inside a listener trips wasm-bindgen's
/// re-entrancy guard — that throw must not take down the whole event.)
pub fn trigger_event(callbacks: &[Function], event_obj: &JsValue) {
    let snapshot: Vec<Function> = callbacks.to_vec();
    for callback in snapshot {
        if let Err(e) = callback.call1(&JsValue::null(), event_obj) {
            web_sys::console::error_1(&e);
        }
    }
}

/// Set a property on an event object, mapping reflection failures to a
/// static error (no formatted payloads — keeps float/Debug formatting out
/// of the binary).
fn reflect_set(obj: &js_sys::Object, key: &str, value: &JsValue) -> Result<(), JsValue> {
    js_sys::Reflect::set(obj, &JsValue::from_str(key), value)
        .map_err(|_| RustyleafError::EventConstruction("Reflect::set failed".into()))?;
    Ok(())
}

pub fn create_map_event(event_type: &str, center: &Array, zoom: f64, bounds: &Array) -> Result<JsValue, JsValue> {
    let obj = js_sys::Object::new();
    reflect_set(&obj, "type", &JsValue::from_str(event_type))?;
    reflect_set(&obj, "target", &JsValue::null())?;
    reflect_set(&obj, "sourceTarget", &JsValue::null())?;
    reflect_set(&obj, "propagatedFrom", &JsValue::null())?;
    reflect_set(&obj, "originalEvent", &JsValue::null())?;
    reflect_set(&obj, "center", center)?;
    reflect_set(&obj, "zoom", &JsValue::from_f64(zoom))?;
    reflect_set(&obj, "bounds", bounds)?;

    Ok(obj.into())
}

pub fn create_click_event(lat: f64, lng: f64, container_point: &Array, layer_point: &Array, original_event: Option<&JsValue>) -> Result<JsValue, JsValue> {
    let obj = js_sys::Object::new();
    reflect_set(&obj, "type", &JsValue::from_str("click"))?;
    reflect_set(&obj, "target", &JsValue::null())?;
    reflect_set(&obj, "sourceTarget", &JsValue::null())?;
    reflect_set(&obj, "propagatedFrom", &JsValue::null())?;

    let latlng = Array::new();
    latlng.push(&JsValue::from_f64(lat));
    latlng.push(&JsValue::from_f64(lng));
    reflect_set(&obj, "latlng", &latlng)?;
    reflect_set(&obj, "containerPoint", container_point)?;
    reflect_set(&obj, "layerPoint", layer_point)?;

    let original_js = match original_event {
        Some(ev) => ev.clone(),
        None => JsValue::NULL,
    };
    reflect_set(&obj, "originalEvent", &original_js)?;

    Ok(obj.into())
}
