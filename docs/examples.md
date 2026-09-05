# Examples

The repository ships live demo pages under [`demo/`](https://github.com/mehdilhy/rustyleaf/tree/main/demo)
and runnable examples under [`examples/`](https://github.com/mehdilhy/rustyleaf/tree/main/examples).
Open them in a browser after building (`npm run build`) — they import the
compiled bundle from `dist/`.

## Live demos

| Demo | What it shows |
| --- | --- |
| [`index.html`](https://github.com/mehdilhy/rustyleaf/blob/main/demo/index.html) | Point-cloud performance — switch between 10k / 100k / 500k / 1M points with a live FPS meter |
| [`markers.html`](https://github.com/mehdilhy/rustyleaf/blob/main/demo/markers.html) | GPU sprite markers, icons, div-icons, drag |
| [`shapes.html`](https://github.com/mehdilhy/rustyleaf/blob/main/demo/shapes.html) | `Circle` / `CircleMarker` / `Rectangle` |
| [`interactions.html`](https://github.com/mehdilhy/rustyleaf/blob/main/demo/interactions.html) | Events, `onEachFeature` popups/tooltips, `flyTo`, `locate`, box zoom, keyboard |
| [`overlays.html`](https://github.com/mehdilhy/rustyleaf/blob/main/demo/overlays.html) | `ImageOverlay` / `VideoOverlay` / `SVGOverlay` pinned to bounds |

## A clickable, popups-on-hover GeoJSON map

Adapted from the Interactions demo — the canonical "real app" example:

```js
import { Map, TileLayer, GeoJSONLayer, ZoomControl } from 'rustyleaf'

const map = new Map('map', { center: [48.8566, 2.3522], zoom: 13 })

new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map)
new ZoomControl().addTo(map)

const monuments = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [2.2945, 48.8584] }, properties: { name: 'Eiffel Tower', year: 1889 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [2.3499, 48.8530] }, properties: { name: 'Notre-Dame', year: 1345 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [2.3376, 48.8606] }, properties: { name: 'Louvre', year: 1793 } },
  ],
}

new GeoJSONLayer(monuments, {
  pointColor: '#e0393e',
  pointSize: 14,
  filter: (f) => f.properties.year > 0,
  onEachFeature: (f, handle) => {
    handle.bindPopup(`<strong>${f.properties.name}</strong><br>since ${f.properties.year}`)
    handle.bindTooltip(f.properties.name)
    handle.on('click', () => console.log('clicked', f.properties.name))
  },
}).addTo(map)

map.on('click', (e) => {
  if (e.feature) console.log('feature', e.feature)
  else console.log('coord', e.latlng)
})
```

## 1,000,000 points with an FPS budget

From the Points demo — generates a clustered point cloud and swaps the GPU data
in place (there's no `setData()` in the public API yet, so it calls the
internal `add_points` to replace points without stacking layers):

```js
import { Map, TileLayer, PointLayer } from 'rustyleaf'

const map = new Map('map', { center: [48.8566, 2.3522], zoom: 11 })
new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

const layer = new PointLayer()
layer.addTo(map)

function setCount(n) {
  const pts = Array.from({ length: n }, () => ({
    lat: 48.8566 + (Math.random() - 0.5) * 0.4,
    lng: 2.3522 + (Math.random() - 0.5) * 0.6,
    size: 3 + Math.random() * 3,
    color: ['#e0393e', '#2a6fdb', '#21a179'][Math.floor(Math.random() * 3)],
    meta: { id: Math.random() },
  }))
  layer.clear()
  layer.add(pts)
}
setCount(1_000_000)
```

> Even at 1M points, zoomed out to a world view, the fragment-work budget keeps
> the frame at 60fps. See [Performance](./performance).

## Watching every event

```js
for (const evt of ['load', 'movestart', 'moveend', 'zoomstart', 'zoomend',
  'dragstart', 'dragend', 'boxzoomend', 'layeradd', 'layerremove',
  'popupopen', 'popupclose', 'tooltipopen', 'tooltipclose', 'resize',
  'locationfound', 'locationerror']) {
  map.on(evt, (e) => console.log(evt, e))
}
```

## Building and running locally

```bash
npm install
npm run build          # wasm-pack + webpack -> dist/
# Then open demo/index.html via any static server, e.g.:
npx serve .
```
