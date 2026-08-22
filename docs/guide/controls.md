# Controls

UI controls are built on a `Control` base class and added via `map.addControl(...)`
or `control.addTo(map)`. All controls accept a `position` option:
`'topleft' | 'topright' | 'bottomleft' | 'bottomright'`.

## `ZoomControl`

Zoom in/out buttons.

```js
import { ZoomControl } from 'rustyleaf'

new ZoomControl().addTo(map)
// or: map.addControl(new ZoomControl({ position: 'topright' }))
```

## `AttributionControl`

Shows attribution text. It appears automatically when a `TileLayer` passes an
`attribution` option, but you can manage it directly.

```js
import { AttributionControl } from 'rustyleaf'

const attr = new AttributionControl({ prefix: 'Rustyleaf' }).addTo(map)
attr.addAttribution('© OpenStreetMap contributors')
attr.setPrefix('Rustyleaf')
attr.getAttributions() // string[]
attr.getPrefix()
```

## `ScaleControl`

Metric/imperial scale bar.

```js
import { ScaleControl } from 'rustyleaf'

new ScaleControl({ maxWidth: 100, metric: true, imperial: true }).addTo(map)
```

## `LayersControl`

Checkbox overlays + radio base layers, like Leaflet.

```js
import { LayersControl, TileLayer, PointLayer } from 'rustyleaf'

const osm = new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png')
const points = new PointLayer()

const layers = new LayersControl(
  { OpenStreetMap: osm },            // base layers (radio)
  { '1M points': points },           // overlays (checkbox)
).addTo(map)

// Or add incrementally:
layers.addBaseLayer(otherTiles, 'Carto')
layers.addOverlay(otherPoints, 'More points')
layers.removeLayer(points)
```

Toggling a checkbox calls `addTo`/`remove` on the underlying layer, so the
GPU data is shown/hidden rather than re-uploaded.

## Custom controls

Subclass `Control` and implement `onAdd`/`onRemove` (the same pattern as
Leaflet). The base class provides `getPosition()`, `setPosition()`,
`getContainer()`, `addTo(map)`, and `remove()`.

```js
import { Control } from 'rustyleaf'

class MyControl extends Control {
  onAdd(map) {
    const el = document.createElement('div')
    el.textContent = 'Hello'
    return el
  }
  onRemove(map) {
    /* cleanup */
  }
}
```
