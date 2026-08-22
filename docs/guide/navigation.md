# Map Navigation

Beyond pan and zoom, Rustyleaf offers animated navigation, bounds fitting,
max-bounds clamping, size invalidation, and browser geolocation.

## View & zoom

```js
map.setView([48.8566, 2.3522], 13)
map.getCenter()            // [lat, lng]
map.getZoom()              // number
map.setMinZoom(3)
map.setMaxZoom(18)
map.zoomIn()
map.zoomOut()
map.panBy(100, 50)         // pixels
```

## Fitting bounds

```js
map.fitBounds([
  [48.85, 2.35], // south-west
  [48.86, 2.36], // north-east
])
```

## Animated `flyTo`

Eased, cinematic movement — great for demos and "go to" buttons.

```js
map.flyTo([51.5074, -0.1278], { zoom: 12, duration: 1200 }) // ms
map.flyToBounds([
  [48.85, 2.35],
  [48.86, 2.36],
], { duration: 800 })
```

## Constraining the viewport

```js
// Clamp the center inside bounds on setView
map.setMaxBounds([
  [48.8, 2.2],
  [48.9, 2.5],
])
map.getMaxBounds()
map.setMaxBounds(null) // remove the constraint
```

## Resize handling

If the container changes size (responsive layouts, tab switch), call:

```js
map.invalidateSize()
```

## Geolocation

```js
map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true })

map.on('locationfound', (e) => console.log('found', e.latlng))
map.on('locationerror', (e) => console.log('error', e.message))

map.stopLocate()
```

`locate` accepts `LocateOptions`: `setView`, `maxZoom`, `watch`,
`enableHighAccuracy`, `timeout`, `maximumAge`.

## Coordinate projection

```js
const [x, y] = map.project([48.8566, 2.3522])      // latlng -> screen px
const [lat, lng] = map.unproject([x, y])            // screen px -> latlng
```

## Cleanup

```js
map.destroy() // frees all GPU resources (RAII-wrapped) and detaches listeners
```

> GPU memory is only fully released on `map.destroy()`. `layer.remove()` and
> `map.remove()` hide/detach but keep the GPU data alive until destroy.
