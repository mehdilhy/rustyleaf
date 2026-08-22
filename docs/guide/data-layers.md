# Point, Line & Polygon Layers

These three layers are the workhorses for raw geometry. They share an identical
shape: construct, `add(...)` features, `addTo(map)`, listen for `click`/`hover`,
and `clear()`/`remove()` when done.

## `PointLayer`

GPU-resident point rendering — the headline feature. Points are uploaded once
and projected in the vertex shader, so point layers hold **60fps at 1,000,000
points**.

```js
import { PointLayer } from 'rustyleaf'

const points = new PointLayer()
points.add(
  Array.from({ length: 1_000_000 }, () => ({
    lat: 48.8 + Math.random() * 0.2,
    lng: 2.2 + Math.random() * 0.3,
    size: 3 + Math.random() * 3,
    color: '#e0393e',
    meta: { id: Math.random() },
  }))
)
points.addTo(map)

points.on('click', (e) => console.log('hit', e.feature))
points.on('hover', (e) => console.log('hover', e.feature))
```

`PointFeature`:

```ts
interface PointFeature {
  lat: number
  lng: number
  size?: number
  color?: string
  meta?: any
}
```

> **Fragment-work budget:** when a layer's on-screen footprint collapses (zoomed
> far enough out that the whole dataset is a few pixels), only a bounded,
> deterministically-shuffled *sample* of the vertex buffer is drawn — a fair
> subset, not a truncation. At full-viewport coverage the budget exceeds the
> point count and every point draws. This keeps zoomed-out views at 60fps too.

## `LineLayer`

Polylines. **Line width is honored** — segments are expanded into screen-space
quads on the GPU. (GeoJSON-styled lines still render 1px — see
[GeoJSON](./geojson).)

```js
import { LineLayer } from 'rustyleaf'

const lines = new LineLayer()
lines.add([
  {
    coords: [
      { lat: 48.85, lng: 2.35 },
      { lat: 48.86, lng: 2.36 },
    ],
    color: '#2a6fdb',
    width: 3,
    meta: { name: 'route-1' },
  },
])
lines.addTo(map)
lines.on('click', (e) => console.log('line', e.feature))
```

`LineFeature`:

```ts
interface LineFeature {
  coords: Array<{ lat: number; lng: number }>
  color?: string
  width?: number
  meta?: any
}
```

## `PolygonLayer`

Filled polygons, triangulated once and cached in GPU buffers.

```js
import { PolygonLayer } from 'rustyleaf'

const polys = new PolygonLayer()
polys.add([
  {
    rings: [
      [
        { lat: 48.85, lng: 2.35 },
        { lat: 48.86, lng: 2.35 },
        { lat: 48.86, lng: 2.36 },
        { lat: 48.85, lng: 2.35 },
      ],
    ],
    color: '#3388ff80',
    meta: { id: 'paris' },
  },
])
polys.addTo(map)
```

`PolygonFeature`:

```ts
interface PolygonFeature {
  rings: Array<Array<{ lat: number; lng: number }>>
  color?: string
  meta?: any
}
```

## Shared methods

| Method | Description |
| --- | --- |
| `add(features)` | Add features (array) to the layer |
| `clear()` | Remove all features |
| `on('click' \| 'hover', cb)` | Hit-tested feature events (carry `feature` = `meta`) |
| `addTo(map)` | Add to a map |
| `remove()` | Remove from the map (frees GPU buffers; re-`addTo` re-uploads and re-shows) |

> **Note:** `remove()` releases the layer's GPU buffers; the JS-side data stays,
> so `addTo()` re-uploads it. See [FAQ & Limitations](/faq).
