# GeoJSON Layer

`GeoJSONLayer` parses, triangulates, and renders GeoJSON — loading from an
object, a string, a URL, a `File`, or streamed chunks. Geometry is GPU-cached
and styled with Leaflet-style options. Point features support the full
`filter` / `pointToLayer` / `onEachFeature` hook set with per-feature popups and
click/hover handlers.

## Loading

```js
import { GeoJSONLayer } from 'rustyleaf'

// From an object (or null, then load later)
const layer = new GeoJSONLayer(featureCollection, { polygonColor: '#3388ff80' })
layer.addTo(map)

// From a URL (fetch + progress + AbortSignal)
await layer.loadFromUrl('/data/regions.geojson', {
  progressCallback: ({ loaded, total, percentage }) => console.log(percentage),
  completeCallback: ({ totalFeatures, totalBytes }) => console.log(totalFeatures),
  errorCallback: ({ error, message }) => console.error(message),
  signal: abortController.signal,
})

// From a File (drag-and-drop)
await layer.loadFile(fileInput.files[0])

// Streamed URL with chunked progress
await layer.loadUrlStreaming(url, {
  chunkSize: 1 << 16,
  progressCallback: ({ percentage, featureCount }) => {},
  completeCallback: ({ totalFeatures, totalBytes }) => {},
  errorCallback: (err) => {},
})
```

> The old `window.rustyleafGeoJSONData` global + polling path is **gone**.
> `loadFromUrl()` is now a plain `fetch` with progress callbacks and
> `AbortSignal` support.

## Styling

Pass options in the constructor or via `setStyle()` / `setStyleFunction()`.
Styles set after data load are honored (the cache is rebuilt).

```js
const layer = new GeoJSONLayer(null, {
  pointColor: '#e0393e',
  pointSize: 8,
  lineColor: '#2a6fdb',
  lineWidth: 2,
  polygonColor: '#3388ff80',
})

// Re-style later
layer.setStyle({ polygonColor: '#21a17980' })

// Or a per-feature function
layer.setStyleFunction((feature) => ({
  polygonColor: feature.properties.density > 100 ? '#e0393e80' : '#3388ff80',
}))
layer.updateStyle()
```

## `filter`, `pointToLayer`, `onEachFeature`

These work exactly as in Leaflet.

```js
const layer = new GeoJSONLayer(monuments, {
  pointColor: '#e0393e',
  pointSize: 14,

  // Exclude features (applies to load/constructor/url, not streaming)
  filter: (f) => f.properties.year > 0,

  // Render point features as a custom layer
  pointToLayer: (f, latlng) => new CircleMarker(latlng, { radius: 6 }),

  // Per-feature hook — bind popups/tooltips, wire handlers
  onEachFeature: (f, handle) => {
    handle.bindPopup(`<strong>${f.properties.name}</strong>`)
    handle.bindTooltip(f.properties.name)
    handle.on('click', () => console.log('clicked', f.properties.name))
    handle.on('hover', () => console.log('hover', f.properties.name))
  },
})
layer.addTo(map)
```

The `handle` passed to `onEachFeature` is a `GeoJSONFeatureHandle`:

```ts
interface GeoJSONFeatureHandle {
  feature: any
  on(event: 'click' | 'hover', cb: (e: any) => void): this
  off(event: string, cb: (e: any) => void): this
  bindPopup(content: string): this
  bindTooltip(content: string): this
}
```

## Bounds & inspection

```js
layer.getBounds()                  // LatLngBounds | null
layer.getFeatureCount()            // number of features
layer.getFeaturesInBounds(bounds)  // features intersecting bounds
layer.clear()                      // remove all features
```

## Gotchas

- **Polygon interiors aren't hit-testable yet** — only the outline is (via the
  cached outline line). `PointLayer`/`LineLayer`/`PolygonLayer` (non-GeoJSON)
  hit-test normally.
- The streaming parser is regex-assisted and can misbehave on exotic input.
- `filter` is ignored for streaming loads.
