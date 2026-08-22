# Events

Rustyleaf uses a Leaflet-style event system. `map.on(event, callback)` registers
a handler; `map.off(event, callback)` removes it. `click` and `hover` events
carry a hit-tested `feature` payload when a feature is under the cursor.

## Event categories

**Core (dispatched from wasm):** `move`, `zoom`, `click`, `hover`, `mousedown`,
`mouseup`, `contextmenu`, `keydown`, `keyup`, `dragend`.

**Derived / JS-level:** `movestart`, `moveend`, `zoomstart`, `zoomend`,
`dragstart`, `drag`, `layeradd`, `layerremove`, `popupopen`, `popupclose`,
`tooltipopen`, `tooltipclose`, `boxzoomend`, `resize`, `load`,
`locationfound`, `locationerror`.

## Basic usage

```js
map.on('click', (e) => {
  if (e.feature) console.log('feature', e.feature)
  else console.log('coordinate', e.latlng) // [lat, lng]
})

map.on('moveend', () => console.log('center now', map.getCenter()))
map.on('zoomend', () => console.log('zoom now', map.getZoom()))
```

## Hit-tested feature events

`click` / `hover` on data layers and the map carry the feature's `meta`:

```js
points.on('click', (e) => console.log(e.feature))       // PointLayer/LineLayer/PolygonLayer
marker.on('click', () => console.log('marker'))
circle.on('hover', (e) => console.log(e.feature))       // shapes
geojson.on('click', (e) => console.log(e.feature))      // GeoJSON layer-level
handle.on('click', () => ...)                            // GeoJSON onEachFeature handle
```

## Layer & popup events

```js
map.on('layeradd', (e) => console.log('added', e))
map.on('popupopen', (e) => console.log('popup', e))
map.on('tooltipopen', (e) => console.log('tooltip', e))
map.on('boxzoomend', (e) => console.log('box zoom', e))
```

## Map lifecycle & input

```js
map.on('load', () => console.log('ready'))
map.on('resize', () => console.log('resized'))

// Keyboard / raw input
map.on('keydown', (e) => console.log(e))
map.on('contextmenu', () => console.log('right-click'))

// Geolocation
map.on('locationfound', (e) => console.log('you are at', e.latlng))
map.on('locationerror', (e) => console.log('geolocation failed', e.message))
```

## Re-entrancy caveat

Calling map methods **synchronously** inside a raw wasm event callback
(`move`, `zoom`, `click`, …) throws a re-entrancy error — defer with
`queueMicrotask`:

```js
map.on('click', (e) => {
  queueMicrotask(() => map.flyTo(e.latlng))
})
```

The built-in layers (popups, overlays, feature popups) already defer internally.
