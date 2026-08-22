# Vector Shapes

Rustyleaf ships three vector shapes: `Circle`, `CircleMarker`, and `Rectangle`.
All support click/hover hit-testing, styling, and `addTo`/`remove`.

## `Circle` — geodesic radius

A `Circle` is drawn with a real-world **radius in meters**, tessellated into a
polygon (so it looks correct on the Mercator projection at any zoom).

```js
import { Circle } from 'rustyleaf'

const circle = new Circle([48.8584, 2.2945], {
  radius: 500, // meters
  color: '#3388ff',
  fillColor: '#3388ff80',
}).addTo(map)

circle.on('click', (e) => console.log('clicked circle', e.feature))
```

| Method | Description |
| --- | --- |
| `getLatLng()` / `setLatLng([lat, lng])` | Center |
| `getRadius()` / `setRadius(meters)` | Radius in meters |
| `getBounds()` | `LatLngBounds` of the circle |
| `redraw()` | Re-render after a change |

## `CircleMarker` — fixed pixel radius

A `CircleMarker` has a **radius in pixels** and is drawn as a GPU point, so it
stays the same screen size regardless of zoom.

```js
import { CircleMarker } from 'rustyleaf'

const marker = new CircleMarker([48.8566, 2.3522], {
  radius: 8, // pixels
  color: '#e0393e',
  fillColor: '#e0393e80',
}).addTo(map)
```

Same method surface as `Circle` (`setRadius` here is in pixels).

## `Rectangle` — from bounds

```js
import { Rectangle } from 'rustyleaf'

const rect = new Rectangle(
  [
    [48.85, 2.35], // south-west
    [48.86, 2.36], // north-east
  ],
  { color: '#21a179', fillColor: '#21a17980' }
).addTo(map)

rect.setBounds([
  [48.84, 2.34],
  [48.87, 2.37],
])
```

## Common options

```ts
interface ShapeOptions {
  color?: string      // stroke color
  fillColor?: string  // fill color (with alpha)
  meta?: any          // payload returned on hit-test
}
```

All three shapes emit `click` / `hover` events carrying the `meta` payload.
