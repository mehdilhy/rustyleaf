# Quick Start

This page takes you from zero to an interactive million-point map in a few
minutes.

## 1. Create the map

```js
import { Map, TileLayer } from 'rustyleaf'

const map = new Map('map', {
  center: [48.8566, 2.3522], // [lat, lng]
  zoom: 12,
})
```

`Map` accepts either a container **id** (string) or an **`HTMLElement`**. The
WASM core loads asynchronously on construction; the returned object is ready to
use immediately (subsequent calls queue until the core is up).

Always include attribution for any tiles you use — OpenStreetMap's tile usage
policy requires it:

```js
new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map)
```

The `{s}` placeholder rotates through subdomains (`a`, `b`, `c`) automatically.

## 2. Add a point layer

```js
import { PointLayer } from 'rustyleaf'

const points = new PointLayer()
points.add(
  Array.from({ length: 100_000 }, () => ({
    lat: 48.8 + Math.random() * 0.2,
    lng: 2.2 + Math.random() * 0.3,
    size: 4,
    color: '#e0393e',
  }))
)
points.addTo(map)
```

A `PointFeature` accepts `lat`, `lng`, optional `size`, optional `color`, and an
optional `meta` payload that comes back on hit-testing:

```ts
interface PointFeature {
  lat: number
  lng: number
  size?: number
  color?: string
  meta?: any
}
```

## 3. Load GeoJSON

```js
import { GeoJSONLayer } from 'rustyleaf'

const geojson = new GeoJSONLayer(null, { polygonColor: '#3388ff80' })
geojson.addTo(map)
await geojson.loadFromUrl('/data/regions.geojson')
```

You can also load from an object, a `File`, or a streamed URL:

```js
geojson.loadData(featureCollection)              // object
geojson.loadFile(fileInput.files[0])             // File (streamed)
geojson.loadUrlStreaming(url, {                  // streamed, with progress
  progressCallback: ({ percentage }) => console.log(percentage),
})
```

## 4. React to clicks

`click` and `hover` events carry a hit-tested `feature` payload (the `meta` you
supplied) when the cursor is over a feature:

```js
points.on('click', (e) => {
  console.log('clicked feature', e.feature) // e.feature === the point's `meta`
})

map.on('click', (e) => {
  if (e.feature) console.log('feature', e.feature)
  else console.log('coordinate', e.latlng)
})
```

## 5. Add a marker, popup, and control

```js
import { Marker, Popup, ZoomControl } from 'rustyleaf'

// Plain Icon creates the standard GPU sprite. Bitmap icons (iconUrl) are not
// rendered yet — use DivIcon for custom icon content (see the markers guide).
const marker = new Marker([48.8584, 2.2945], {
  draggable: true,
}).addTo(map)

marker.bindPopup('<strong>Eiffel Tower</strong>').openPopup()
new ZoomControl().addTo(map)
```

## Full example

```js
import {
  Map, TileLayer, PointLayer, GeoJSONLayer,
} from 'rustyleaf'

const map = new Map('map', { center: [48.8566, 2.3522], zoom: 12 })

new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map)

const points = new PointLayer()
points.add(
  Array.from({ length: 100_000 }, () => ({
    lat: 48.8 + Math.random() * 0.2,
    lng: 2.2 + Math.random() * 0.3,
    size: 4,
    color: '#e0393e',
  }))
)
points.addTo(map)

const geojson = new GeoJSONLayer(null, { polygonColor: '#3388ff80' })
geojson.addTo(map)
await geojson.loadFromUrl('/data/regions.geojson')

map.on('click', (e) => console.log('clicked', e.latlng))
```

Next: explore the individual layers in the rest of this guide.
