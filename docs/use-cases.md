# 20 Leaflet use cases

Rustyleaf keeps the familiar Leaflet composition model — create a map, add
layers, listen for events — while moving geometry and hit testing into Rust and
WebAssembly. The examples below are deliberately small and composable. Later
snippets build on `mapInstance` and layers created earlier on this page. They
are also the scenarios covered by the public parity suite in
`tests/LeafletParity.test.ts`.

## 1. Create a map

```js
import { map } from 'rustyleaf'

const mapInstance = map('map', { center: [48.8566, 2.3522], zoom: 12 })
```

`new Map(container, options)` remains available when a class is clearer.

## 2. Add an XYZ base layer

```js
import { tileLayer } from 'rustyleaf'

const baseLayer = tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(mapInstance)
```

Templates support `{z}`, `{x}`, `{y}`, `{s}`, `{r}`, and custom option tokens.

## 3. Switch tile URLs or WMS parameters

```js
import { WMSTileLayer } from 'rustyleaf'

baseLayer.setUrl('https://tiles.example/{z}/{x}/{y}.png')
const weather = new WMSTileLayer('https://example.test/wms', {
  layers: 'weather', format: 'image/png', transparent: true,
})
weather.addTo(mapInstance).setParams({ time: 'latest' })
```

`setOpacity`, `setZIndex`, `bringToFront`, and `bringToBack` are chainable.

## 4. Render a marker

```js
import { marker } from 'rustyleaf'

marker([48.8566, 2.3522], { title: 'Paris' })
  .addTo(mapInstance)
  .on('click', (event) => console.log(event.latlng))
```

Plain icons are GPU sprites, so a marker layer does not create one DOM node per
feature.

## 5. Render custom HTML with `DivIcon`

```js
import { divIcon, marker } from 'rustyleaf'

marker([48.86, 2.35], {
  icon: divIcon({ html: '<strong>PIN</strong>', className: 'pin' }),
}).addTo(mapInstance)
```

`DivIcon` is useful for a small number of branded or interactive HTML pins.

## 6. Bind a popup

```js
import { marker } from 'rustyleaf'

const pin = marker([48.8566, 2.3522])
  .bindPopup('<strong>Notre-Dame</strong>')
  .addTo(mapInstance)

pin.openPopup()
```

Popup content may be a string, an element, a `Popup` instance, or a callback.

## 7. Bind a tooltip

```js
pin.bindTooltip('Hover for details')
pin.openTooltip()
```

Tooltips track movement and zoom and are removed with their source layer.

## 8. Plot a moderate point dataset

```js
import { PointLayer } from 'rustyleaf'

const points = new PointLayer()
points.add(records.map((record) => ({
  lat: record.latitude,
  lng: record.longitude,
  size: 5,
  color: '#e76f51',
  meta: record,
})))
points.addTo(mapInstance)
```

`getBounds()` and `getLatLngs()` make the layer inspectable before mounting.

## 9. Stream a million points

```js
// `points` is the mounted PointLayer from the previous example.

points.reservePacked(totalPoints)
for await (const batch of batches) {
  points.appendPacked(batch) // Float32Array rows: lat,lng,size,r,g,b,a
}
```

Packed append avoids rebuilding all previous GPU data for every batch.

## 10. Draw a line and edit it

```js
import { LineLayer } from 'rustyleaf'

const route = new LineLayer({ color: '#264653', weight: 4 })
route.setLatLngs([[48.85, 2.30], [48.86, 2.35], [48.87, 2.40]])
route.addTo(mapInstance)
route.setStyle({ color: '#2a9d8f', weight: 6 })
```

`getBounds`, `getLatLngs`, `bindPopup`, and `bindTooltip` work on line layers.

## 11. Draw a polygon with a hole

```js
import { PolygonLayer } from 'rustyleaf'

const area = new PolygonLayer({ fillColor: '#457b9d80' })
area.add([{
  rings: [outerRing, innerHole],
  meta: { name: 'district' },
}]).addTo(mapInstance)
```

Polygon geometry is cached in GPU buffers and can be restyled without rebuilding
the JavaScript object.

## 12. Use vector shapes

```js
import { circle, circleMarker, rectangle } from 'rustyleaf'

circle([48.8566, 2.3522], { radius: 500, fillColor: '#f4a26180' }).addTo(mapInstance)
circleMarker([48.86, 2.34], { radius: 8 }).addTo(mapInstance)
rectangle([[48.84, 2.30], [48.88, 2.40]]).addTo(mapInstance)
```

Circle radius is meters; circle-marker radius is pixels. All shapes expose
`getBounds`, style setters, and popup/tooltip binding.

## 13. Load GeoJSON from an object or URL

```js
import { geoJSON } from 'rustyleaf'

const regions = geoJSON(null, { polygonColor: '#3388ff80' }).addTo(mapInstance)
regions.addData(featureCollection)
await regions.loadUrl('/data/regions.geojson')
mapInstance.fitBounds(regions.getBounds())
```

`getBounds`, `getFeaturesInBounds`, `toGeoJSON`, `clear`, and `addData` support
inspection and live updates.

## 14. Filter and customize GeoJSON features

```js
import { circleMarker, geoJSON } from 'rustyleaf'

geoJSON(data, {
  filter: (feature) => feature.properties.visible,
  pointToLayer: (feature, latlng) => circleMarker(latlng, { radius: 6 }),
  onEachFeature: (feature, layer) => {
    layer.bindPopup(feature.properties.name)
  },
}).addTo(mapInstance)
```

Feature handles support `on`, `off`, `setStyle`, `resetStyle`, and bounds.

## 15. Stream a large GeoJSON response

```js
await regions.loadUrlStreaming('/data/large.geojson', {
  progressCallback: ({ percentage }) => progress.value = percentage,
  completeCallback: ({ totalFeatures }) => console.log(totalFeatures),
})
```

The quote-aware buffer keeps incomplete objects until the next chunk and parses
the final tail once the stream closes.

## 16. Compose layer groups

```js
import { featureGroup } from 'rustyleaf'

const group = featureGroup([pin, route])
  .bindPopup('Shared detail')
  .addTo(mapInstance)

mapInstance.fitBounds(group.getBounds())
```

`LayerGroup` offers `eachLayer`, `invoke`, `clearLayers`, and late child adds.

## 17. Pin an image, video, or SVG to bounds

```js
import { imageOverlay } from 'rustyleaf'

imageOverlay('/floorplan.png', [[48.84, 2.30], [48.88, 2.40]], { opacity: 0.8 })
  .addTo(mapInstance)
```

`VideoOverlay` and `SVGOverlay` share the same bounds, z-order, and lifecycle
methods and update on map movement.

## 18. Add controls and a layer switcher

```js
import { LayersControl, ScaleControl, ZoomControl } from 'rustyleaf'

mapInstance
  .addControl(new ZoomControl())
  .addControl(new ScaleControl({ imperial: false }))
  .addControl(new LayersControl({ Streets: baseLayer }, { Weather: weather }))
```

Controls are regular objects with `addTo`, `remove`, position setters, and DOM
containers for plugin styling.

## 19. Navigate, constrain, and locate

```js
// `mapInstance` is the map created in use case 1.

mapInstance
  .setMaxBounds([[48.7, 2.0], [49.0, 2.7]])
  .flyTo([48.86, 2.35], { zoom: 14, duration: 0.6 })
  .locate({ setView: true, maxZoom: 15 })
```

The map also exposes `fitBounds`, `flyToBounds`, `invalidateSize`, pixel/LatLng
converters, and `wrapLatLng` helpers.

## 20. Extend the map with plugins and CRS helpers

```js
import { CRS, Handler } from 'rustyleaf'

class HoverHandler extends Handler {
  addHooks() { this._map.on('hover', this.handleHover = () => {}) }
  removeHooks() { this._map.off('hover', this.handleHover) }
}

mapInstance.addHandler('hoverHandler', HoverHandler)
const projected = CRS.EPSG3857.project([48.8566, 2.3522])
```

The exported `L` namespace, factories, `DomUtil`, `DomEvent`, `Util`, `CRS`,
and `Projection` cover the common plugin integration points. Features that
need a different rendering model — vector tiles, Canvas2D fallback, and full
Leaflet plugin DOM assumptions — remain explicit limitations in the FAQ.
