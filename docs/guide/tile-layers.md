# Tile Layers

Tile layers are the base of almost every map. Rustyleaf supports XYZ raster
tiles, WMS layers, and a fully programmable grid layer.

## `TileLayer` (XYZ raster)

Standard OpenStreetMap-compatible URL templates with subdomain rotation and a
tile cache with eviction.

```js
import { TileLayer } from 'rustyleaf'

const base = new TileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    // optional: maxZoom, subdomains, etc. (any extra option is passed through)
  }
)
base.addTo(map)
```

- `{s}` rotates through `a`/`b`/`c` subdomains.
- Tiles **wrap horizontally at the antimeridian** (the world repeats,
  Leaflet-style) instead of showing empty gray past ±180°.

## `WMSTileLayer`

Wraps a WMS base URL. The Rust tile loader substitutes a per-tile
`EPSG:3857` bounding box via the `{bbox-epsg-3857}` placeholder.

```js
import { WMSTileLayer } from 'rustyleaf'

const wms = new WMSTileLayer('https://ows.terrestris.de/osm/service', {
  layers: 'OSM-WMS',
  format: 'image/png',
  transparent: false,
  version: '1.3.0',
  attribution: '© Terrestris',
})
wms.addTo(map)
```

Access the resolved request parameters via `wms.wmsParams`.

## `GridLayer` (programmable DOM tiles)

Subclass `GridLayer` and override `createTile(coords)` to draw your own tiles as
DOM elements (heatmaps, canvas tiles, etc.).

```js
import { GridLayer } from 'rustyleaf'

class MyGrid extends GridLayer {
  createTile(coords) {
    const div = document.createElement('div')
    div.textContent = `${coords.z}/${coords.x}/${coords.y}`
    div.style.background = '#eef'
    div.style.width = div.style.height = '100%'
    return div
  }
}

new MyGrid({ tileSize: 256 }).addTo(map)
```

## Removing a tile layer

All tile layers expose `addTo(map)` and `remove()`:

```js
base.remove()      // hide and detach
base.addTo(map)    // re-show (no GPU re-upload needed)
```

## Tile usage policy

If you use OpenStreetMap tiles, follow their
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
Heavy production use requires your own tile provider.
