/**
 * Rustyleaf TypeScript Definitions
 * API surface exactly matching the runtime exports from src/rustyleaf-api.js
 */

// Core coordinate types. Tuple input remains valid; constructors/factories
// return array-compatible objects with Leaflet's `.lat`/`.lng` helpers.
export interface LatLngValue extends Array<number> {
  lat: number;
  lng: number;
  alt?: number;
  equals(other: LatLngLike, maxMargin?: number): boolean;
  toArray(): number[];
  toBounds(size?: number): LatLngBoundsValue;
  distanceTo(other: LatLngLike): number;
  wrap(): LatLngValue;
}
export type LatLng = [number, number] | LatLngValue;
export type LatLngLike = LatLng | { lat: number; lng: number; alt?: number };
export interface LatLngBoundsValue extends Array<number[] | LatLngValue> {
  _southWest: LatLngValue | null;
  _northEast: LatLngValue | null;
  isValid(): boolean;
  getCenter(): LatLngValue | null;
  getSouthWest(): LatLngValue | null;
  getNorthEast(): LatLngValue | null;
  getNorthWest(): LatLngValue | null;
  getSouthEast(): LatLngValue | null;
  getWest(): number | undefined;
  getSouth(): number | undefined;
  getEast(): number | undefined;
  getNorth(): number | undefined;
  contains(value: LatLngLike | LatLngBoundsLike): boolean;
  intersects(value: LatLngBoundsLike): boolean;
  overlaps(value: LatLngBoundsLike): boolean;
  pad(bufferRatio: number): LatLngBoundsValue;
  equals(value: LatLngBoundsLike, maxMargin?: number): boolean;
  toBBox(): string;
  toArray(): number[][];
}
export type LatLngBounds = [[number, number], [number, number]] | LatLngBoundsValue;
export type LatLngBoundsLike = LatLngBounds | [LatLngLike, LatLngLike] | LatLngLike[];

export interface PointValue extends Array<number> {
  x: number;
  y: number;
  clone(): PointValue;
  add(other: PointLike): PointValue;
  subtract(other: PointLike): PointValue;
  divideBy(value: number, round?: boolean): PointValue;
  multiplyBy(value: number): PointValue;
  scaleBy(scale: PointLike): PointValue;
  unscaleBy(scale: PointLike): PointValue;
  round(): PointValue;
  floor(): PointValue;
  ceil(): PointValue;
  distanceTo(other: PointLike): number;
  equals(other: PointLike): boolean;
  contains(other: PointLike): boolean;
  toArray(): number[];
}
export type PointLike = [number, number] | PointValue | { x: number; y: number };
export interface BoundsValue extends Array<number[][] | PointValue[]> {
  min: PointValue | null;
  max: PointValue | null;
  isValid(): boolean;
  getCenter(round?: boolean): PointValue | null;
  getSize(): PointValue;
  contains(value: PointLike | BoundsLike): boolean;
  intersects(value: BoundsLike): boolean;
  overlaps(value: BoundsLike): boolean;
  pad(bufferRatio: number): BoundsValue;
  equals(value: BoundsLike): boolean;
  toArray(): number[][];
}
export type BoundsLike = BoundsValue | [PointLike, PointLike] | PointLike[];

export declare const LatLng: {
  new (lat: number, lng: number, alt?: number): LatLngValue;
};
export declare const LatLngBounds: {
  new (southWest?: LatLngLike | LatLngBoundsLike, northEast?: LatLngLike): LatLngBoundsValue;
};
export declare const Point: {
  new (x?: number, y?: number, round?: boolean): PointValue;
};
export declare const Bounds: {
  new (a?: PointLike | BoundsLike, b?: PointLike): BoundsValue;
};
export declare class Transformation {
  constructor(a: number, b: number, c: number, d: number);
  transform(point: PointLike, scale?: number): PointValue;
  untransform(point: PointLike, scale?: number): PointValue;
}
export declare function latLng(lat: number, lng: number, alt?: number): LatLngValue;
export declare function latLng(value: LatLngLike): LatLngValue;
export declare function latLngBounds(southWest?: LatLngBoundsLike, northEast?: LatLngLike): LatLngBoundsValue;
export declare function point(x: number, y: number, round?: boolean): PointValue;
export declare function point(value: PointLike): PointValue;
export declare function bounds(a?: PointLike | BoundsLike, b?: PointLike): BoundsValue;
export declare function wrapNum(value: number, range: [number, number], includeMax?: boolean): number;

export interface CRSLike {
  code?: string;
  wrapLng?: [number, number];
  wrapLat?: [number, number];
  distance?(a: LatLngLike, b: LatLngLike): number;
  scale?(zoom: number): number;
  zoom?(scale: number): number;
  project?(latlng: LatLngLike): PointValue;
  unproject?(point: PointLike): LatLngValue;
  transformation?: Transformation;
}
export declare const CRS: {
  Earth: CRSLike;
  EPSG3857: CRSLike;
  EPSG4326: CRSLike;
  Simple: CRSLike;
};
export declare const Projection: Record<string, CRSLike>;
export declare const Browser: Record<string, boolean>;
export declare const DomUtil: Record<string, (...args: any[]) => any>;
export declare const DomEvent: Record<string, (...args: any[]) => any>;

// Map options (only what the constructor actually reads)
export interface MapOptions {
  center?: LatLngLike;
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  maxBounds?: LatLngBoundsLike | null;
  zoomDelta?: number;
  zoomSnap?: number;
  crs?: CRSLike;
  layers?: GroupableLayer[];
}

// Options for Map.locate (browser geolocation)
export interface LocateOptions {
  setView?: boolean;
  maxZoom?: number;
  watch?: boolean;
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

// WebGL support info returned by Map.checkWebGLSupport / map.getWebGLSupport()
export interface WebGLSupportInfo {
  supported: boolean;
  level: 'none' | 'limited' | 'full' | 'unknown';
  webgl2: boolean;
  webgl1: boolean;
  renderer: string;
  maxTextureSize: number;
  extensions: string[];
  error: string | null;
}

// Point feature
export interface PointFeature {
  lat: number;
  lng: number;
  size?: number;
  color?: string;
  meta?: any;
}

// Line feature
export interface LineFeature {
  coords: Array<{ lat: number; lng: number }>;
  color?: string;
  width?: number;
  meta?: any;
}

// Polygon feature
export interface PolygonFeature {
  rings: Array<Array<{ lat: number; lng: number }>>;
  color?: string;
  meta?: any;
}

// GeoJSON layer options
export interface GeoJSONFeatureHandle {
  feature: any;
  on(event: 'click' | 'hover', callback: (e: any) => void): this;
  off(event: string, callback?: (e: any) => void): this;
  bindPopup(content: string | HTMLElement | ((feature: any) => any)): this;
  bindTooltip(content: string | HTMLElement | ((feature: any) => any)): this;
  setStyle(style: Record<string, any>): this;
  resetStyle(): this;
  getStyle(): Record<string, any>;
  getBounds(): LatLngBoundsValue | null;
}

export interface GeoJSONLayerOptions {
  pointColor?: string;
  pointSize?: number;
  lineColor?: string;
  lineWidth?: number;
  polygonColor?: string;
  style?: Record<string, any> | ((feature: any) => Record<string, any>);
  /** Exclude features (applies to loadData/constructor/loadUrl, not streaming). */
  filter?: (feature: any) => boolean;
  /** Render point features via the returned layer (Marker/CircleMarker/...). */
  pointToLayer?: (feature: any, latlng: LatLng) => GroupableLayer | null;
  /** Per-feature hook; receives the pointToLayer layer or a feature handle. */
  onEachFeature?: (feature: any, layer: GroupableLayer | GeoJSONFeatureHandle) => void;
}

// GeoJSON streaming options
export interface GeoJSONStreamingOptions {
  chunkSize?: number;
  progressCallback?: (progress: {
    loaded: number;
    total: number;
    percentage: number;
    featureCount: number;
  }) => void;
  completeCallback?: (result: {
    totalFeatures: number;
    totalBytes: number;
  }) => void;
  errorCallback?: (error: Error) => void;
}

// Popup options
export interface PopupOptions {
  maxWidth?: number;
  minWidth?: number;
  maxHeight?: number | null;
  autoPan?: boolean;
  autoPanPaddingTopLeft?: [number, number];
  autoPanPaddingBottomRight?: [number, number];
  autoPanPadding?: [number, number];
  keepInView?: boolean;
  closeButton?: boolean;
  autoClose?: boolean;
  className?: string;
}

// Icon options
export interface IconOptions {
  iconUrl: string;
  iconRetinaUrl?: string;
  iconSize?: [number, number];
  iconAnchor?: [number, number];
  popupAnchor?: [number, number];
  shadowUrl?: string;
  shadowRetinaUrl?: string;
  shadowSize?: [number, number];
  shadowAnchor?: [number, number];
  className?: string;
}

// DivIcon options
export interface DivIconOptions {
  html?: string;
  className?: string;
  iconSize?: [number, number];
  iconAnchor?: [number, number];
  bgPos?: [number, number];
}

// Marker options
export interface MarkerOptions {
  icon?: Icon | DivIcon;
  draggable?: boolean;
  title?: string;
  alt?: string;
  opacity?: number;
  zIndexOffset?: number;
  autoPan?: boolean;
  keyboard?: boolean;
  /** Sprite color for GPU-rendered markers (plain Icon only). */
  color?: string;
  /** Sprite size in px for GPU-rendered markers (plain Icon only). */
  size?: number;
}

// ==================== Icon ====================

export declare class Icon {
  constructor(options: IconOptions);
  options: IconOptions;
  static Default: typeof Icon;
}

export declare class DivIcon extends Icon {
  constructor(options?: DivIconOptions);
  options: DivIconOptions;
}

// ==================== Marker ====================

export declare class Marker {
  constructor(latlng: LatLngLike, options?: MarkerOptions);

  setLatLng(latlng: LatLngLike): this;
  getLatLng(): LatLngValue;
  setIcon(icon: Icon | DivIcon): this;
  getIcon(): Icon | DivIcon;
  setOpacity(opacity: number): this;
  getOpacity(): number;
  setZIndexOffset(offset: number): this;
  getZIndexOffset(): number;
  setDraggable(draggable: boolean): this;
  isDraggable(): boolean;
  on(event: 'click' | 'mouseover' | 'mouseout' | 'dragstart' | 'drag' | 'dragend' | 'add' | 'remove', callback: (...args: any[]) => void): this;
  off(event: string, callback: (...args: any[]) => void): this;
  fire(event: string, data?: any): this;
  addTo(map: Map): this;
  remove(): this;
  getElement(): HTMLElement | null;
  bindPopup(content: string | HTMLElement | Popup | ((marker: Marker, latlng: LatLngValue) => any)): this;
  getPopupContent(): any;
  getPopup(): Popup | undefined;
  openPopup(): this;
  closePopup(): this;
  isPopupOpen(): boolean;
  bindTooltip(content: string | HTMLElement | Popup | ((marker: Marker, latlng: LatLngValue) => any)): this;
  getTooltipContent(): any;
  openTooltip(): this;
  closeTooltip(): this;
  isTooltipOpen(): boolean;
}

// ==================== Map ====================

export declare class Map {
  constructor(container: string | HTMLElement, options?: MapOptions);

  setView(latlng: LatLngLike, zoom: number): this;
  panBy(dx: number, dy: number): this;
  panBy(offset: PointLike): this;
  zoomIn(delta?: number): this;
  zoomOut(delta?: number): this;
  getWebGLSupport(): WebGLSupportInfo;
  getCenter(): LatLngValue;
  getZoom(): number;
  setMinZoom(minZoom: number): this;
  setMaxZoom(maxZoom: number): this;
  getMinZoom(): number;
  getMaxZoom(): number;
  getBounds(): LatLngBoundsValue;
  fitBounds(bounds: LatLngBoundsLike, options?: { maxZoom?: number }): this;
  flyTo(latlng: LatLngLike, zoom?: number, options?: { duration?: number }): this;
  flyTo(latlng: LatLngLike, options?: { zoom?: number; duration?: number }): this;
  flyToBounds(bounds: LatLngBoundsLike, options?: { maxZoom?: number; duration?: number }): this;
  setMaxBounds(bounds: LatLngBoundsLike | null): this;
  getMaxBounds(): LatLngBoundsValue | null;
  invalidateSize(): this;
  locate(options?: LocateOptions): this;
  stopLocate(): this;
  addLayer(layer: GroupableLayer): this;
  removeLayer(layer: GroupableLayer): this;
  hasLayer(layer: GroupableLayer): boolean;
  addHandler(name: string, HandlerClass: new (map: Map) => Handler): this;
  distance(a: LatLngLike, b: LatLngLike): number;
  containerPointToLatLng(point: PointLike): LatLngValue;
  latLngToContainerPoint(latlng: LatLngLike): PointValue;
  mouseEventToContainerPoint(event: MouseEvent): PointValue;
  mouseEventToLayerPoint(event: MouseEvent): PointValue;
  mouseEventToLatLng(event: MouseEvent): LatLngValue;
  project(latlng: LatLngLike): PointValue;
  unproject(point: PointLike): LatLngValue;
  getSize(): PointValue;
  getPixelOrigin(): PointValue;
  getPixelBounds(): BoundsValue;
  getPixelWorldBounds(zoom?: number): BoundsValue;
  getZoomScale(toZoom: number, fromZoom?: number): number;
  getScaleZoom(scale: number, fromZoom?: number): number;
  getBoundsZoom(bounds: LatLngBoundsLike, inside?: boolean, padding?: PointLike): number;
  wrapLatLng(latlng: LatLngLike): LatLngValue;
  wrapLatLngBounds(bounds: LatLngBoundsLike): LatLngBoundsValue;
  getPane(name?: string): HTMLElement;
  createPane(name: string, containerPane?: string | HTMLElement): HTMLElement;
  getPanes(): Record<string, HTMLElement>;
  /**
   * Core events (wasm): move, zoom, click, hover, mousedown, mouseup,
   * contextmenu, keydown, keyup, dragend. Derived/JS events: movestart,
   * moveend, zoomstart, zoomend, dragstart, drag, layeradd, layerremove,
   * popupopen, popupclose, tooltipopen, tooltipclose, boxzoomend, resize,
   * load, locationfound, locationerror. click/hover events carry `feature`
   * (hit-tested meta) when a feature is under the cursor.
   */
  on(event: string, callback: (...args: any[]) => void): this;
  off(event: string, callback: (...args: any[]) => void): this;
  remove(): this;
  destroy(): this;

  static checkWebGLSupport(): WebGLSupportInfo;
}

// ==================== TileLayer ====================

export declare class TileLayer {
  constructor(urlTemplate: string, options?: Record<string, any>);

  addTo(map: Map): this;
  remove(): this;
  getTileSize(): PointValue;
  getTileUrl(coords: { x: number; y: number; z: number; [key: string]: any }): string;
  setUrl(url: string, noRedraw?: boolean): this;
  setOpacity(opacity: number): this;
  getOpacity(): number;
  setZIndex(zIndex: number): this;
  bringToFront(): this;
  bringToBack(): this;
  getContainer(): HTMLElement | HTMLCanvasElement | null;
  getAttribution(): string | undefined;
  isLoading(): boolean;
  redraw(): this;
}

export declare class WMSTileLayer extends TileLayer {
  constructor(baseUrl: string, options?: {
    layers?: string;
    styles?: string;
    format?: string;
    transparent?: boolean;
    version?: string;
    tileSize?: number;
    attribution?: string;
  });
  wmsParams: Record<string, string | number>;
}

// Programmable DOM tiles: subclass and override createTile(coords).
export declare class GridLayer {
  constructor(options?: { tileSize?: number; className?: string });
  createTile(coords: { z: number; x: number; y: number }): HTMLElement;
  addTo(map: Map): this;
  remove(): this;
}

// ==================== PointLayer ====================

export declare class PointLayer {
  constructor(options?: Record<string, any>);

  add(points: PointFeature[]): this;
  /** Append packed [lat, lng, size, r, g, b, a] float tuples. The layer must
   * already be attached to a map. Intended for very large datasets. */
  addPacked(points: Float32Array): this;
  /** Streaming append: like addPacked, but appends to the existing GPU buffer
   * (O(new points) per batch) instead of re-uploading all accumulated points.
   * Keeps continuous streams smooth without O(n²) re-uploads. */
  appendPacked(points: Float32Array): this;
  /** Pre-allocate the GPU buffer for a known-size streaming burst before
   * appendPacked, avoiding growth reallocations. */
  reservePacked(totalPoints: number): this;
  clear(): this;
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this;
  addTo(map: Map): this;
  remove(): this;
  getBounds(): LatLngBoundsValue | null;
  getLatLngs(): LatLngValue[];
}

// ==================== LineLayer ====================

export declare class LineLayer {
  constructor(options?: Record<string, any>);

  add(lines: LineFeature[]): this;
  clear(): this;
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this;
  addTo(map: Map): this;
  remove(): this;
  getLatLngs(): LatLngValue[][];
  setLatLngs(latlngs: LatLngLike[] | LatLngLike[][]): this;
  getBounds(): LatLngBoundsValue | null;
  setStyle(style?: Record<string, any>): this;
  getStyle(): Record<string, any>;
  bringToFront(): this;
  bringToBack(): this;
  bindPopup(content: any): this;
  bindTooltip(content: any): this;
}

// ==================== PolygonLayer ====================

export declare class PolygonLayer {
  constructor(options?: Record<string, any>);

  add(polygons: PolygonFeature[]): this;
  clear(): this;
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this;
  addTo(map: Map): this;
  remove(): this;
  getLatLngs(): LatLngValue[][][];
  setLatLngs(latlngs: LatLngLike[] | LatLngLike[][] | LatLngLike[][][]): this;
  getBounds(): LatLngBoundsValue | null;
  setStyle(style?: Record<string, any>): this;
  getStyle(): Record<string, any>;
  bringToFront(): this;
  bringToBack(): this;
  bindPopup(content: any): this;
  bindTooltip(content: any): this;
}

// ==================== Vector shapes ====================

export interface ShapeOptions {
  color?: string;
  fillColor?: string;
  meta?: any;
  weight?: number;
  opacity?: number;
  fillOpacity?: number;
}

// Geodesic circle; radius in meters, tessellated into a polygon.
export declare class Circle {
  constructor(latlng: LatLngLike, options?: ShapeOptions & { radius?: number });
  getLatLng(): LatLngValue;
  setLatLng(latlng: LatLngLike): this;
  getRadius(): number;
  setRadius(radius: number): this;
  getBounds(): LatLngBounds;
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this;
  setStyle(style: Record<string, any>): this;
  getStyle(): Record<string, any>;
  bindPopup(content: any): this;
  bindTooltip(content: any): this;
  addTo(map: Map): this;
  remove(): this;
  redraw(): this;
}

// Fixed screen-radius circle; radius in pixels, rendered as a GPU point.
export declare class CircleMarker {
  constructor(latlng: LatLngLike, options?: ShapeOptions & { radius?: number });
  getLatLng(): LatLngValue;
  setLatLng(latlng: LatLngLike): this;
  getRadius(): number;
  setRadius(radius: number): this;
  getBounds(): LatLngBoundsValue;
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this;
  setStyle(style: Record<string, any>): this;
  getStyle(): Record<string, any>;
  bindPopup(content: any): this;
  bindTooltip(content: any): this;
  addTo(map: Map): this;
  remove(): this;
  redraw(): this;
}

export declare class Rectangle {
  constructor(bounds: LatLngBoundsLike, options?: ShapeOptions);
  getBounds(): LatLngBoundsValue;
  setBounds(bounds: LatLngBoundsLike): this;
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this;
  setStyle(style: Record<string, any>): this;
  getStyle(): Record<string, any>;
  bindPopup(content: any): this;
  bindTooltip(content: any): this;
  addTo(map: Map): this;
  remove(): this;
  redraw(): this;
}

// ==================== Layer grouping ====================

export interface GroupableLayer {
  addTo(map: Map): any;
  remove(): any;
}

export declare class LayerGroup {
  constructor(layers?: GroupableLayer[]);
  getLayers(): GroupableLayer[];
  hasLayer(layer: GroupableLayer): boolean;
  addLayer(layer: GroupableLayer): this;
  removeLayer(layer: GroupableLayer): this;
  clearLayers(): this;
  eachLayer(fn: (layer: GroupableLayer) => void, context?: any): this;
  invoke(methodName: string, ...args: any[]): this;
  bindPopup(content: any): this;
  bindTooltip(content: any): this;
  addTo(map: Map): this;
  remove(): this;
}

export declare class FeatureGroup extends LayerGroup {
  on(event: string, callback: (...args: any[]) => void): this;
  off(event: string, callback?: (...args: any[]) => void): this;
  getBounds(): LatLngBounds | null;
  setStyle(style: Record<string, any>): this;
  bringToFront(): this;
  bringToBack(): this;
}

// ==================== GeoJSONLayer ====================

export declare class GeoJSONLayer {
  constructor(geojson?: any, options?: GeoJSONLayerOptions);

  loadData(geojson: any): this;
  addData(geojson: any): this;
  loadUrl(url: string): Promise<this>;
  loadUrlStreaming(url: string, options?: GeoJSONStreamingOptions): Promise<this>;
  loadFile(file: File, options?: GeoJSONStreamingOptions): Promise<this>;
  loadFromUrl(url: string, options?: {
    progressCallback?: (p: { loaded: number; total: number; percentage: number }) => void;
    completeCallback?: (r: { totalFeatures: number; totalBytes: number }) => void;
    errorCallback?: (e: { error: Error; message: string }) => void;
    signal?: AbortSignal;
  }): Promise<this>;
  processChunk(chunk: string, isFinal: boolean): void;
  getFeatureCount(): number;
  setStyle(style: Partial<GeoJSONLayerOptions> | ((feature: any) => Record<string, any>)): this;
  setStyleFunction(styleFn: (feature: any) => any): this;
  updateStyle(): void;
  addTo(map: Map): this;
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this;
  off(event: string, callback?: (...args: any[]) => void): this;
  getLayers(): Array<GroupableLayer | GeoJSONFeatureHandle>;
  eachLayer(fn: (layer: GroupableLayer | GeoJSONFeatureHandle) => void, context?: any): this;
  bindPopup(content: any): this;
  bindTooltip(content: any): this;
  resetStyle(layer?: GeoJSONFeatureHandle | GroupableLayer): this;
  toGeoJSON(): any;
  remove(): this;
  getBounds(): LatLngBounds | null;
  getFeaturesInBounds(bounds: LatLngBounds): any[];
  clear(): this;
  addFeature(feature: any): this;
  addFeatures(features: any[]): this;
}

// ==================== Popup ====================

export declare class Popup {
  constructor(options?: PopupOptions);

  setLatLng(latlng: LatLng): this;
  setContent(content: string | HTMLElement): this;
  setSource(layer: any): this;
  openOn(map: Map): this;
  close(): this;
  toggle(map: Map): this;
  update(): this;
  isOpenPopup(): boolean;
  bringToFront(): this;
  bringToBack(): this;
  bindTo(layer: any, content: string | HTMLElement): this;
}

// ==================== Tooltip ====================

export declare class Tooltip {
  constructor(options?: { content?: string; direction?: string; opacity?: number; className?: string; sticky?: boolean; offset?: [number, number] });

  setContent(content: string | HTMLElement): this;
  getTooltipContent(): string;
  setLatLng(latlng: LatLng): this;
  getLatLng(): LatLng | null;
  openOn(map: Map): this;
  close(): this;
  isOpen(): boolean;
  isOpenTooltip(): boolean;
  getElement(): HTMLElement | null;
}

// ==================== Controls ====================

export interface ControlOptions {
  position?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright';
}

export declare class Control {
  constructor(options?: ControlOptions);
  getPosition(): string;
  setPosition(position: string): this;
  addTo(map: Map): this;
  remove(): this;
  getContainer(): HTMLElement | null;
}

export declare class ZoomControl extends Control {
  constructor(options?: ControlOptions);
}

export declare class AttributionControl extends Control {
  constructor(options?: ControlOptions & { prefix?: string });
  addAttribution(text: string): this;
  getAttributions(): string[];
  setPrefix(prefix: string): this;
  getPrefix(): string;
}

export declare class ScaleControl extends Control {
  constructor(options?: ControlOptions & { maxWidth?: number; metric?: boolean; imperial?: boolean });
}

export declare class LayersControl extends Control {
  constructor(
    baseLayers?: Record<string, { addTo(map: Map): any; remove(): any }>,
    overlays?: Record<string, { addTo(map: Map): any; remove(): any }>,
    options?: ControlOptions
  );
  addBaseLayer(layer: { addTo(map: Map): any; remove(): any }, name: string): this;
  addOverlay(layer: { addTo(map: Map): any; remove(): any }, name: string): this;
  removeLayer(layer: any): this;
}

// ==================== Ground overlays ====================

export interface ImageOverlayOptions {
  opacity?: number;
  alt?: string;
  className?: string;
  interactive?: boolean;
}

export declare class ImageOverlay {
  constructor(url: string, bounds: LatLngBoundsLike, options?: ImageOverlayOptions);
  getBounds(): LatLngBoundsValue;
  getCenter(): LatLngValue;
  setBounds(bounds: LatLngBoundsLike): this;
  setUrl(url: string): this;
  setOpacity(opacity: number): this;
  setZIndex(zIndex: number): this;
  getElement(): HTMLElement | null;
  addTo(map: Map): this;
  remove(): this;
  bringToFront(): this;
  bringToBack(): this;
}

export declare class VideoOverlay extends ImageOverlay {
  constructor(url: string, bounds: LatLngBoundsLike, options?: ImageOverlayOptions & {
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
  });
}

export declare class SVGOverlay extends ImageOverlay {
  constructor(svgElement: SVGElement, bounds: LatLngBoundsLike, options?: ImageOverlayOptions);
}

// ==================== Plugin surface ====================

export declare class Handler {
  constructor(map: Map);
  enable(): this;
  disable(): this;
  enabled(): boolean;
  addHooks(): void;
  removeHooks(): void;
}

export declare const Util: {
  extend<T>(dest: T, ...sources: any[]): T;
  stamp(obj: any): number;
  throttle<F extends (...args: any[]) => void>(fn: F, time: number, context?: any): F;
  wrapNum(x: number, range: [number, number], includeMax?: boolean): number;
  falseFn(): false;
  formatNum(num: number, digits?: number): number;
  setOptions(obj: any, options: Record<string, any>): Record<string, any>;
  template(str: string, data: Record<string, any>): string;
  isArray(value: any): boolean;
  trim(value: any): string;
  splitWords(value: any): string[];
  getParamString(obj: Record<string, any>, existingUrl?: string, uppercase?: boolean): string;
  requestAnimFrame(callback: (...args: any[]) => void, context?: any, immediate?: boolean): number | undefined;
  cancelAnimFrame(id: number): void;
  emptyImageUrl: string;
};

// ==================== WASM bootstrap ====================

export interface RustyleafConfig {
  /** Absolute URL to rustyleaf_core_bg.wasm. Required when the bundler does
   * not emit the .wasm as a fetchable asset (e.g. Turbopack/Next.js).
   *
   * Note: the wasm fetch starts during module evaluation, so prefer setting
   * `globalThis.__rustyleafWasmUrl` BEFORE importing rustyleaf. This function
   * is a fallback for callers that can reach the module before use. */
  wasmUrl?: string;
}

export declare function configureRustyleaf(config: RustyleafConfig): void;
export declare function checkWebGLSupport(): WebGLSupportInfo;

// Leaflet-style factories and namespace export.
export declare function map(container: string | HTMLElement, options?: MapOptions): Map;
export declare function tileLayer(urlTemplate: string, options?: Record<string, any>): TileLayer;
export declare function pointLayer(options?: Record<string, any>): PointLayer;
export declare function lineLayer(options?: Record<string, any>): LineLayer;
export declare function polygonLayer(options?: Record<string, any>): PolygonLayer;
export declare function geoJSON(data?: any, options?: GeoJSONLayerOptions): GeoJSONLayer;
export declare function marker(latlng: LatLngLike, options?: MarkerOptions): Marker;
export declare function icon(options: IconOptions): Icon;
export declare function divIcon(options?: DivIconOptions): DivIcon;
export declare function popup(options?: PopupOptions, source?: any): Popup;
export declare function tooltip(options?: { content?: any; direction?: string; opacity?: number; className?: string; sticky?: boolean; offset?: [number, number] }): Tooltip;
export declare function circle(latlng: LatLngLike, options?: ShapeOptions & { radius?: number }): Circle;
export declare function circleMarker(latlng: LatLngLike, options?: ShapeOptions & { radius?: number }): CircleMarker;
export declare function rectangle(bounds: LatLngBoundsLike, options?: ShapeOptions): Rectangle;
export declare function layerGroup(layers?: GroupableLayer[]): LayerGroup;
export declare function featureGroup(layers?: GroupableLayer[]): FeatureGroup;
export declare function imageOverlay(url: string, bounds: LatLngBoundsLike, options?: ImageOverlayOptions): ImageOverlay;
export declare function videoOverlay(url: string, bounds: LatLngBoundsLike, options?: ImageOverlayOptions & { autoplay?: boolean; loop?: boolean; muted?: boolean }): VideoOverlay;
export declare function svgOverlay(element: SVGElement, bounds: LatLngBoundsLike, options?: ImageOverlayOptions): SVGOverlay;
export declare function gridLayer(options?: { tileSize?: number; className?: string }): GridLayer;
export declare function wmsTileLayer(baseUrl: string, options?: Record<string, any>): WMSTileLayer;
export declare function control(options?: ControlOptions): Control;
export declare function zoomControl(options?: ControlOptions): ZoomControl;
export declare function attributionControl(options?: ControlOptions & { prefix?: string }): AttributionControl;
export declare function scaleControl(options?: ControlOptions & { maxWidth?: number; metric?: boolean; imperial?: boolean }): ScaleControl;
export declare function layersControl(baseLayers?: Record<string, GroupableLayer>, overlays?: Record<string, GroupableLayer>, options?: ControlOptions): LayersControl;

// ==================== Default export ====================

declare const _default: {
  version: string;
  configureRustyleaf: typeof configureRustyleaf;
  checkWebGLSupport: typeof checkWebGLSupport;
  Map: typeof Map;
  TileLayer: typeof TileLayer;
  PointLayer: typeof PointLayer;
  LineLayer: typeof LineLayer;
  PolygonLayer: typeof PolygonLayer;
  GeoJSONLayer: typeof GeoJSONLayer;
  Popup: typeof Popup;
  Marker: typeof Marker;
  Icon: typeof Icon;
  DivIcon: typeof DivIcon;
  Tooltip: typeof Tooltip;
  Control: typeof Control;
  ZoomControl: typeof ZoomControl;
  AttributionControl: typeof AttributionControl;
  ScaleControl: typeof ScaleControl;
  LayersControl: typeof LayersControl;
  Circle: typeof Circle;
  CircleMarker: typeof CircleMarker;
  Rectangle: typeof Rectangle;
  LayerGroup: typeof LayerGroup;
  FeatureGroup: typeof FeatureGroup;
  ImageOverlay: typeof ImageOverlay;
  VideoOverlay: typeof VideoOverlay;
  SVGOverlay: typeof SVGOverlay;
  WMSTileLayer: typeof WMSTileLayer;
  GridLayer: typeof GridLayer;
  Handler: typeof Handler;
  Util: typeof Util;
  Point: typeof Point;
  Bounds: typeof Bounds;
  LatLng: typeof LatLng;
  LatLngBounds: typeof LatLngBounds;
  Transformation: typeof Transformation;
  CRS: typeof CRS;
  Projection: typeof Projection;
  Browser: typeof Browser;
  DomUtil: typeof DomUtil;
  DomEvent: typeof DomEvent;
  map: typeof map;
  tileLayer: typeof tileLayer;
  pointLayer: typeof pointLayer;
  lineLayer: typeof lineLayer;
  polygonLayer: typeof polygonLayer;
  geoJSON: typeof geoJSON;
  marker: typeof marker;
  icon: typeof icon;
  divIcon: typeof divIcon;
  popup: typeof popup;
  tooltip: typeof tooltip;
  circle: typeof circle;
  circleMarker: typeof circleMarker;
  rectangle: typeof rectangle;
  layerGroup: typeof layerGroup;
  featureGroup: typeof featureGroup;
  imageOverlay: typeof imageOverlay;
  videoOverlay: typeof videoOverlay;
  svgOverlay: typeof svgOverlay;
  gridLayer: typeof gridLayer;
  wmsTileLayer: typeof wmsTileLayer;
  control: typeof control;
  zoomControl: typeof zoomControl;
  attributionControl: typeof attributionControl;
  scaleControl: typeof scaleControl;
  layersControl: typeof layersControl;
  latLng: typeof latLng;
  latLngBounds: typeof latLngBounds;
  point: typeof point;
  bounds: typeof bounds;
};
export default _default;
