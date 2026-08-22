# API Reference

This reference reflects the exact runtime surface in
[`types/rustyleaf.d.ts`](https://github.com/mehdilhy/rustyleaf/blob/main/types/rustyleaf.d.ts).
Everything here exists and is tested. The default export bundles all classes:

```js
import rustyleaf from 'rustyleaf'        // default: { Map, TileLayer, ... }
import { Map, PointLayer } from 'rustyleaf' // named is usually easier
```

## Types

```ts
type LatLng = [number, number]            // [lat, lng]
type LatLngBounds = [LatLng, LatLng]      // [southWest, northEast]

interface MapOptions { center?: LatLng; zoom?: number }

interface LocateOptions {
  setView?: boolean; maxZoom?: number; watch?: boolean
  enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number
}

interface WebGLSupportInfo {
  supported: boolean
  level: 'none' | 'limited' | 'full' | 'unknown'
  webgl2: boolean; webgl1: boolean
  renderer: string; maxTextureSize: number
  extensions: string[]; error: string | null
}

interface PointFeature { lat: number; lng: number; size?: number; color?: string; meta?: any }
interface LineFeature { coords: Array<{ lat: number; lng: number }>; color?: string; width?: number; meta?: any }
interface PolygonFeature { rings: Array<Array<{ lat: number; lng: number }>>; color?: string; meta?: any }
```

## `Map`

```ts
class Map {
  constructor(container: string | HTMLElement, options?: MapOptions)

  setView(latlng: LatLng, zoom: number): this
  panBy(dx: number, dy: number): this
  zoomIn(): this
  zoomOut(): this

  getWebGLSupport(): WebGLSupportInfo
  static checkWebGLSupport(): WebGLSupportInfo

  getCenter(): LatLng
  getZoom(): number
  setMinZoom(minZoom: number): this
  setMaxZoom(maxZoom: number): this
  getBounds(): LatLngBounds
  fitBounds(bounds: LatLngBounds): this
  flyTo(latlng: LatLng, options?: { zoom?: number; duration?: number }): this
  flyToBounds(bounds: LatLngBounds, options?: { duration?: number }): this
  setMaxBounds(bounds: LatLngBounds | null): this
  getMaxBounds(): LatLngBounds | null
  invalidateSize(): this

  locate(options?: LocateOptions): this
  stopLocate(): this

  addLayer(layer: GroupableLayer): this
  removeLayer(layer: GroupableLayer): this
  hasLayer(layer: GroupableLayer): boolean
  addHandler(name: string, HandlerClass: new (map: Map) => Handler): this

  project(latlng: LatLng): [number, number]
  unproject(point: [number, number]): LatLng

  on(event: string, callback: (...args: any[]) => void): this
  off(event: string, callback: (...args: any[]) => void): this

  remove(): this
  destroy(): this
}
```

Events: see [Events](./guide/events).

## `TileLayer` / `WMSTileLayer` / `GridLayer`

```ts
class TileLayer {
  constructor(urlTemplate: string, options?: Record<string, any>)
  addTo(map: Map): this
  remove(): this
}

class WMSTileLayer extends TileLayer {
  constructor(baseUrl: string, options?: {
    layers?: string; styles?: string; format?: string
    transparent?: boolean; version?: string; tileSize?: number; attribution?: string
  })
  wmsParams: Record<string, string | number>
}

class GridLayer {
  constructor(options?: { tileSize?: number; className?: string })
  createTile(coords: { z: number; x: number; y: number }): HTMLElement
  addTo(map: Map): this
  remove(): this
}
```

## `PointLayer` / `LineLayer` / `PolygonLayer`

```ts
class PointLayer {
  constructor()
  add(points: PointFeature[]): this
  clear(): this
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this
  addTo(map: Map): this
  remove(): this
}

class LineLayer {
  constructor()
  add(lines: LineFeature[]): this
  clear(): this
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this
  addTo(map: Map): this
  remove(): this
}

class PolygonLayer {
  constructor()
  add(polygons: PolygonFeature[]): this
  clear(): this
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this
  addTo(map: Map): this
  remove(): this
}
```

## `GeoJSONLayer`

```ts
class GeoJSONLayer {
  constructor(geojson?: any, options?: GeoJSONLayerOptions)

  loadData(geojson: any): this
  loadUrl(url: string): Promise<this>
  loadUrlStreaming(url: string, options?: GeoJSONStreamingOptions): Promise<this>
  loadFile(file: File, options?: GeoJSONStreamingOptions): Promise<this>
  loadFromUrl(url: string, options?: {
    progressCallback?: (p: { loaded: number; total: number; percentage: number }) => void
    completeCallback?: (r: { totalFeatures: number; totalBytes: number }) => void
    errorCallback?: (e: { error: Error; message: string }) => void
    signal?: AbortSignal
  }): Promise<this>

  processChunk(chunk: string, isFinal: boolean): void
  getFeatureCount(): number
  setStyle(style: Partial<GeoJSONLayerOptions>): this
  setStyleFunction(styleFn: (feature: any) => any): this
  updateStyle(): void

  addTo(map: Map): this
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this
  remove(): this

  getBounds(): LatLngBounds | null
  getFeaturesInBounds(bounds: LatLngBounds): any[]
  clear(): this
  addFeature(feature: any): this
  addFeatures(features: any[]): this
}

interface GeoJSONLayerOptions {
  pointColor?: string; pointSize?: number
  lineColor?: string; lineWidth?: number
  polygonColor?: string
  filter?: (feature: any) => boolean
  pointToLayer?: (feature: any, latlng: LatLng) => GroupableLayer | null
  onEachFeature?: (feature: any, layer: GroupableLayer | GeoJSONFeatureHandle) => void
}

interface GeoJSONStreamingOptions {
  chunkSize?: number
  progressCallback?: (p: { loaded: number; total: number; percentage: number; featureCount: number }) => void
  completeCallback?: (r: { totalFeatures: number; totalBytes: number }) => void
  errorCallback?: (error: Error) => void
}

interface GeoJSONFeatureHandle {
  feature: any
  on(event: 'click' | 'hover', cb: (e: any) => void): this
  off(event: string, cb: (e: any) => void): this
  bindPopup(content: string): this
  bindTooltip(content: string): this
}
```

## `Icon` / `DivIcon` / `Marker`

```ts
class Icon {
  constructor(options: IconOptions)
  options: IconOptions
  static Default: typeof Icon
}
class DivIcon extends Icon {
  constructor(options?: DivIconOptions)
}

class Marker {
  constructor(latlng: LatLng, options?: MarkerOptions)

  setLatLng(latlng: LatLng): this; getLatLng(): LatLng
  setIcon(icon: Icon | DivIcon): this; getIcon(): Icon | DivIcon
  setOpacity(opacity: number): this; getOpacity(): number
  setZIndexOffset(offset: number): this; getZIndexOffset(): number
  setDraggable(draggable: boolean): this; isDraggable(): boolean

  on(event: 'click' | 'mouseover' | 'mouseout' | 'dragstart' | 'drag' | 'dragend' | 'add' | 'remove', cb: (...a: any[]) => void): this
  off(event: string, cb: (...a: any[]) => void): this
  fire(event: string, data?: any): this

  addTo(map: Map): this; remove(): this
  getElement(): HTMLElement | null

  bindPopup(content: string | Popup): this; getPopupContent(): string | undefined
  getPopup(): Popup | undefined; openPopup(): this; closePopup(): this; isPopupOpen(): boolean
  bindTooltip(content: string | Popup): this; getTooltipContent(): string | undefined
  openTooltip(): this; closeTooltip(): this; isTooltipOpen(): boolean
}
```

## Vector shapes

```ts
interface ShapeOptions { color?: string; fillColor?: string; meta?: any }

class Circle {
  constructor(latlng: LatLng, options?: ShapeOptions & { radius?: number })
  getLatLng(): LatLng; setLatLng(latlng: LatLng): this
  getRadius(): number; setRadius(radius: number): this   // meters
  getBounds(): LatLngBounds
  on(event: 'click' | 'hover', cb: (...a: any[]) => void): this
  addTo(map: Map): this; remove(): this; redraw(): this
}
class CircleMarker {
  constructor(latlng: LatLng, options?: ShapeOptions & { radius?: number })
  getLatLng(): LatLng; setLatLng(latlng: LatLng): this
  getRadius(): number; setRadius(radius: number): this   // pixels
  on(event: 'click' | 'hover', cb: (...a: any[]) => void): this
  addTo(map: Map): this; remove(): this; redraw(): this
}
class Rectangle {
  constructor(bounds: LatLngBounds, options?: ShapeOptions)
  getBounds(): LatLngBounds; setBounds(bounds: LatLngBounds): this
  on(event: 'click' | 'hover', cb: (...a: any[]) => void): this
  addTo(map: Map): this; remove(): this; redraw(): this
}
```

## `LayerGroup` / `FeatureGroup`

```ts
interface GroupableLayer { addTo(map: Map): any; remove(): any }

class LayerGroup {
  constructor(layers?: GroupableLayer[])
  getLayers(): GroupableLayer[]
  hasLayer(layer: GroupableLayer): boolean
  addLayer(layer: GroupableLayer): this
  removeLayer(layer: GroupableLayer): this
  clearLayers(): this
  eachLayer(fn: (layer: GroupableLayer) => void, context?: any): this
  addTo(map: Map): this; remove(): this
}
class FeatureGroup extends LayerGroup {
  on(event: string, cb: (...a: any[]) => void): this
  getBounds(): LatLngBounds | null
}
```

## `Popup` / `Tooltip`

```ts
class Popup {
  constructor(options?: PopupOptions)
  setLatLng(latlng: LatLng): this
  setContent(content: string | HTMLElement): this
  setSource(layer: any): this
  openOn(map: Map): this; close(): this; toggle(map: Map): this
  update(): this
  isOpenPopup(): boolean
  bringToFront(): this; bringToBack(): this
  bindTo(layer: any, content: string | HTMLElement): this
}
class Tooltip {
  constructor(options?: { content?: string; direction?: string; opacity?: number; className?: string; sticky?: boolean; offset?: [number, number] })
  setContent(content: string | HTMLElement): this
  getTooltipContent(): string
  setLatLng(latlng: LatLng): this; getLatLng(): LatLng | null
  openOn(map: Map): this; close(): this
  isOpen(): boolean; isOpenTooltip(): boolean
  getElement(): HTMLElement | null
}
```

## Controls

```ts
interface ControlOptions { position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright' }

class Control {
  constructor(options?: ControlOptions)
  getPosition(): string; setPosition(position: string): this
  addTo(map: Map): this; remove(): this
  getContainer(): HTMLElement | null
}
class ZoomControl extends Control { constructor(options?: ControlOptions) }
class AttributionControl extends Control {
  constructor(options?: ControlOptions & { prefix?: string })
  addAttribution(text: string): this
  getAttributions(): string[]
  setPrefix(prefix: string): this; getPrefix(): string
}
class ScaleControl extends Control {
  constructor(options?: ControlOptions & { maxWidth?: number; metric?: boolean; imperial?: boolean })
}
class LayersControl extends Control {
  constructor(
    baseLayers?: Record<string, { addTo(map: Map): any; remove(): any }>,
    overlays?: Record<string, { addTo(map: Map): any; remove(): any }>,
    options?: ControlOptions
  )
  addBaseLayer(layer: { addTo(map: Map): any; remove(): any }, name: string): this
  addOverlay(layer: { addTo(map: Map): any; remove(): any }, name: string): this
  removeLayer(layer: any): this
}
```

## Ground overlays

```ts
interface ImageOverlayOptions {
  opacity?: number; alt?: string; className?: string; interactive?: boolean
}
class ImageOverlay {
  constructor(url: string, bounds: LatLngBounds, options?: ImageOverlayOptions)
  getBounds(): LatLngBounds; setBounds(bounds: LatLngBounds): this
  setUrl(url: string): this; setOpacity(opacity: number): this
  getElement(): HTMLElement | null
  addTo(map: Map): this; remove(): this
  bringToFront(): this; bringToBack(): this
}
class VideoOverlay extends ImageOverlay {
  constructor(url: string, bounds: LatLngBounds, options?: ImageOverlayOptions & {
    autoplay?: boolean; loop?: boolean; muted?: boolean
  })
}
class SVGOverlay extends ImageOverlay {
  constructor(svgElement: SVGElement, bounds: LatLngBounds, options?: ImageOverlayOptions)
}
```

## `Handler` / `Util`

```ts
class Handler {
  constructor(map: Map)
  enable(): this; disable(): this; enabled(): boolean
  addHooks(): void; removeHooks(): void
}

const Util: {
  extend<T>(dest: T, ...sources: any[]): T
  stamp(obj: any): number
  throttle<F extends (...args: any[]) => void>(fn: F, time: number, context?: any): F
  wrapNum(x: number, range: [number, number], includeMax?: boolean): number
  falseFn(): false
  formatNum(num: number, digits?: number): number
  setOptions(obj: any, options: Record<string, any>): Record<string, any>
  template(str: string, data: Record<string, any>): string
}
```
