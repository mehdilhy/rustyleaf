/**
 * Rustyleaf TypeScript Definitions
 * API surface exactly matching the runtime exports from src/rustyleaf-api.js
 */

// Core types
export type LatLng = [number, number];
export type LatLngBounds = [LatLng, LatLng];

// Map options (only what the constructor actually reads)
export interface MapOptions {
  center?: LatLng;
  zoom?: number;
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
  off(event: string, callback: (e: any) => void): this;
  bindPopup(content: string): this;
  bindTooltip(content: string): this;
}

export interface GeoJSONLayerOptions {
  pointColor?: string;
  pointSize?: number;
  lineColor?: string;
  lineWidth?: number;
  polygonColor?: string;
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
  constructor(latlng: LatLng, options?: MarkerOptions);

  setLatLng(latlng: LatLng): this;
  getLatLng(): LatLng;
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
  bindPopup(content: string | Popup): this;
  getPopupContent(): string | undefined;
  getPopup(): Popup | undefined;
  openPopup(): this;
  closePopup(): this;
  isPopupOpen(): boolean;
  bindTooltip(content: string | Popup): this;
  getTooltipContent(): string | undefined;
  openTooltip(): this;
  closeTooltip(): this;
  isTooltipOpen(): boolean;
}

// ==================== Map ====================

export declare class Map {
  constructor(container: string | HTMLElement, options?: MapOptions);

  setView(latlng: LatLng, zoom: number): this;
  panBy(dx: number, dy: number): this;
  zoomIn(): this;
  zoomOut(): this;
  getWebGLSupport(): WebGLSupportInfo;
  getCenter(): LatLng;
  getZoom(): number;
  setMinZoom(minZoom: number): this;
  setMaxZoom(maxZoom: number): this;
  getBounds(): LatLngBounds;
  fitBounds(bounds: LatLngBounds): this;
  flyTo(latlng: LatLng, options?: { zoom?: number; duration?: number }): this;
  flyToBounds(bounds: LatLngBounds, options?: { duration?: number }): this;
  setMaxBounds(bounds: LatLngBounds | null): this;
  getMaxBounds(): LatLngBounds | null;
  invalidateSize(): this;
  locate(options?: LocateOptions): this;
  stopLocate(): this;
  addLayer(layer: GroupableLayer): this;
  removeLayer(layer: GroupableLayer): this;
  hasLayer(layer: GroupableLayer): boolean;
  addHandler(name: string, HandlerClass: new (map: Map) => Handler): this;
  project(latlng: LatLng): [number, number];
  unproject(point: [number, number]): LatLng;
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
  constructor();

  add(points: PointFeature[]): this;
  clear(): this;
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this;
  addTo(map: Map): this;
  remove(): this;
}

// ==================== LineLayer ====================

export declare class LineLayer {
  constructor();

  add(lines: LineFeature[]): this;
  clear(): this;
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this;
  addTo(map: Map): this;
  remove(): this;
}

// ==================== PolygonLayer ====================

export declare class PolygonLayer {
  constructor();

  add(polygons: PolygonFeature[]): this;
  clear(): this;
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this;
  addTo(map: Map): this;
  remove(): this;
}

// ==================== Vector shapes ====================

export interface ShapeOptions {
  color?: string;
  fillColor?: string;
  meta?: any;
}

// Geodesic circle; radius in meters, tessellated into a polygon.
export declare class Circle {
  constructor(latlng: LatLng, options?: ShapeOptions & { radius?: number });
  getLatLng(): LatLng;
  setLatLng(latlng: LatLng): this;
  getRadius(): number;
  setRadius(radius: number): this;
  getBounds(): LatLngBounds;
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this;
  addTo(map: Map): this;
  remove(): this;
  redraw(): this;
}

// Fixed screen-radius circle; radius in pixels, rendered as a GPU point.
export declare class CircleMarker {
  constructor(latlng: LatLng, options?: ShapeOptions & { radius?: number });
  getLatLng(): LatLng;
  setLatLng(latlng: LatLng): this;
  getRadius(): number;
  setRadius(radius: number): this;
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this;
  addTo(map: Map): this;
  remove(): this;
  redraw(): this;
}

export declare class Rectangle {
  constructor(bounds: LatLngBounds, options?: ShapeOptions);
  getBounds(): LatLngBounds;
  setBounds(bounds: LatLngBounds): this;
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this;
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
  addTo(map: Map): this;
  remove(): this;
}

export declare class FeatureGroup extends LayerGroup {
  on(event: string, callback: (...args: any[]) => void): this;
  getBounds(): LatLngBounds | null;
}

// ==================== GeoJSONLayer ====================

export declare class GeoJSONLayer {
  constructor(geojson?: any, options?: GeoJSONLayerOptions);

  loadData(geojson: any): this;
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
  setStyle(style: Partial<GeoJSONLayerOptions>): this;
  setStyleFunction(styleFn: (feature: any) => any): this;
  updateStyle(): void;
  addTo(map: Map): this;
  on(event: 'click' | 'hover', callback: (...args: any[]) => void): this;
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
  constructor(url: string, bounds: LatLngBounds, options?: ImageOverlayOptions);
  getBounds(): LatLngBounds;
  setBounds(bounds: LatLngBounds): this;
  setUrl(url: string): this;
  setOpacity(opacity: number): this;
  getElement(): HTMLElement | null;
  addTo(map: Map): this;
  remove(): this;
  bringToFront(): this;
  bringToBack(): this;
}

export declare class VideoOverlay extends ImageOverlay {
  constructor(url: string, bounds: LatLngBounds, options?: ImageOverlayOptions & {
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
  });
}

export declare class SVGOverlay extends ImageOverlay {
  constructor(svgElement: SVGElement, bounds: LatLngBounds, options?: ImageOverlayOptions);
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

// ==================== Default export ====================

declare const _default: {
  configureRustyleaf: typeof configureRustyleaf;
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
};
export default _default;
