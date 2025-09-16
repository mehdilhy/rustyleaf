/**
 * Rustyleaf TypeScript Definitions
 * Complete API surface type definitions for the Rustyleaf map visualization engine
 */

// Core types
export type LatLng = [number, number];
export type LatLngBounds = [LatLng, LatLng];
export type Point = { x: number; y: number };

// Map options
export interface MapOptions {
  center?: LatLng;
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  zoomControl?: boolean;
  attributionControl?: boolean;
  doubleClickZoom?: boolean;
  scrollWheelZoom?: boolean;
  dragging?: boolean;
  touchZoom?: boolean;
  keyboard?: boolean;
}

// Map event types
export interface MapEvent {
  type: string;
  target: Map;
  latlng?: LatLng;
  originalEvent?: Event;
}

export interface MoveEvent extends MapEvent {
  type: 'move';
  center: LatLng;
  zoom: number;
}

export interface ZoomEvent extends MapEvent {
  type: 'zoom';
  zoom: number;
  center: LatLng;
}

export interface ClickEvent extends MapEvent {
  type: 'click';
  latlng: LatLng;
}

export interface MouseEvent extends MapEvent {
  type: 'mousedown' | 'mouseup' | 'mousemove' | 'mouseover' | 'mouseout' | 'contextmenu';
  latlng: LatLng;
  containerPoint: Point;
  originalEvent: MouseEvent;
}

export interface KeyboardEvent extends MapEvent {
  type: 'keydown' | 'keyup';
  originalEvent: KeyboardEvent;
  key: string;
}

// Tile layer options
export interface TileLayerOptions {
  maxZoom?: number;
  minZoom?: number;
  subdomains?: string | string[];
  errorTileUrl?: string;
  attribution?: string;
  zoomOffset?: number;
  tileSize?: number;
  opacity?: number;
  zIndex?: number;
  unloadInvisibleTiles?: boolean;
  updateWhenIdle?: boolean;
  detectRetina?: boolean;
  crossOrigin?: boolean;
}

// Point feature
export interface PointFeature {
  lat: number;
  lng: number;
  size?: number;
  color?: string;
  opacity?: number;
  properties?: Record<string, any>;
}

// Point layer options
export interface PointLayerOptions {
  pointSize?: number;
  pointColor?: string;
  pointOpacity?: number;
  visible?: boolean;
  zIndex?: number;
}

// Line feature
export interface LineFeature {
  coordinates: LatLng[];
  width?: number;
  color?: string;
  opacity?: number;
  properties?: Record<string, any>;
}

// Line layer options
export interface LineLayerOptions {
  lineWidth?: number;
  lineColor?: string;
  lineOpacity?: number;
  visible?: boolean;
  zIndex?: number;
}

// Polygon feature
export interface PolygonFeature {
  coordinates: LatLng[][];
  color?: string;
  opacity?: number;
  properties?: Record<string, any>;
}

// Polygon layer options
export interface PolygonLayerOptions {
  polygonColor?: string;
  polygonOpacity?: number;
  visible?: boolean;
  zIndex?: number;
}

// GeoJSON layer options
export interface GeoJSONLayerOptions {
  pointColor?: string;
  pointSize?: number;
  pointOpacity?: number;
  lineColor?: string;
  lineWidth?: number;
  lineOpacity?: number;
  polygonColor?: string;
  polygonOpacity?: number;
  style?: (feature: any) => GeoJSONLayerOptions;
  onEachFeature?: (feature: any, layer: any) => void;
  filter?: (feature: any) => boolean;
  coordsToLatLng?: (coords: [number, number]) => LatLng;
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
    processingTime: number;
  }) => void;
  errorCallback?: (error: Error) => void;
}

// Popup options
export interface PopupOptions {
  maxWidth?: number;
  maxHeight?: number;
  autoPan?: boolean;
  autoPanPaddingTopLeft?: Point;
  autoPanPaddingBottomRight?: Point;
  autoPanPadding?: Point;
  closeButton?: boolean;
  autoClose?: boolean;
  closeOnClick?: boolean;
  className?: string;
  offset?: Point | [number, number];
  zoomAnimation?: boolean;
}

// Hit information
export interface HitInfo {
  layer_index: number;
  feature_index: number;
  distance: number;
  latlng: LatLng;
  properties?: Record<string, any>;
}

// Event handler types
export type EventHandler<T = any> = (event: T) => void;
export type ProgressCallback = (progress: any) => void;
export type CompleteCallback = (result: any) => void;
export type ErrorCallback = (error: Error) => void;

// Map class
export declare class Map {
  constructor(elementId: string, options?: MapOptions);
  
  // Methods
  addTo(container: HTMLElement): this;
  remove(): void;
  
  // View methods
  setView(center: LatLng, zoom: number): this;
  setCenter(center: LatLng): this;
  setZoom(zoom: number): this;
  getCenter(): LatLng;
  getZoom(): number;
  getMinZoom(): number;
  getMaxZoom(): number;
  setMinZoom(zoom: number): this;
  setMaxZoom(zoom: number): this;
  zoomIn(delta?: number): this;
  zoomOut(delta?: number): this;
  fitBounds(bounds: LatLngBounds, padding?: number): this;
  getBounds(): LatLngBounds;
  
  // Projection methods
  project(latlng: LatLng): Point;
  unproject(point: Point): LatLng;
  
  // Pan methods
  panBy(offset: Point): this;
  panTo(center: LatLng): this;
  
  // Layer methods
  addLayer(layer: Layer): this;
  removeLayer(layer: Layer): this;
  hasLayer(layer: Layer): boolean;
  eachLayer(fn: (layer: Layer) => void): this;
  
  // Event methods
  on(type: string, handler: EventHandler): this;
  off(type: string, handler?: EventHandler): this;
  fire(type: string, data?: any): this;
  
  // Specific event methods
  on(type: 'move', handler: (event: MoveEvent) => void): this;
  on(type: 'zoom', handler: (event: ZoomEvent) => void): this;
  on(type: 'click', handler: (event: ClickEvent) => void): this;
  on(type: 'mousedown', handler: (event: MouseEvent) => void): this;
  on(type: 'mouseup', handler: (event: MouseEvent) => void): this;
  on(type: 'mousemove', handler: (event: MouseEvent) => void): this;
  on(type: 'mouseover', handler: (event: MouseEvent) => void): this;
  on(type: 'mouseout', handler: (event: MouseEvent) => void): this;
  on(type: 'contextmenu', handler: (event: MouseEvent) => void): this;
  on(type: 'keydown', handler: (event: KeyboardEvent) => void): this;
  on(type: 'keyup', handler: (event: KeyboardEvent) => void): this;
  
  // Container methods
  getContainer(): HTMLElement;
  getPanes(): {
    mapPane: HTMLElement;
    tilePane: HTMLElement;
    overlayPane: HTMLElement;
    shadowPane: HTMLElement;
    markerPane: HTMLElement;
    tooltipPane: HTMLElement;
    popupPane: HTMLElement;
  };
  
  // Utility methods
  getScale(zoom?: number): number;
  getZoomScale(toZoom: number, fromZoom?: number): number;
  getSize(): Point;
  getPixelBounds(): any;
  getPixelOrigin(): Point;
}

// Layer base class
export declare class Layer {
  constructor();
  
  addTo(map: Map): this;
  remove(): void;
  removeFrom(map: Map): this;
  
  // Events
  on(type: string, handler: EventHandler): this;
  off(type: string, handler?: EventHandler): this;
  fire(type: string, data?: any): this;
  
  // Methods
  getMap(): Map | null;
  getZIndex(): number;
  setZIndex(zIndex: number): this;
  getBounds(): LatLngBounds | null;
  bringToFront(): this;
  bringToBack(): this;
}

// Tile layer class
export declare class TileLayer extends Layer {
  constructor(urlTemplate: string, options?: TileLayerOptions);
  
  // Methods
  setUrl(url: string): this;
  setOpacity(opacity: number): this;
  setZIndex(zIndex: number): this;
  redraw(): this;
  getTileSize(): number;
  getAttribution(): string;
}

// Point layer class
export declare class PointLayer extends Layer {
  constructor(options?: PointLayerOptions);
  
  // Data methods
  add(points: PointFeature[]): this;
  clear(): this;
  getFeatureCount(): number;
  
  // Style methods
  setStyle(options: Partial<PointLayerOptions>): this;
  
  // Visibility
  show(): this;
  hide(): this;
  toggle(): this;
  
  // Hit testing
  hitTest(latlng: LatLng): HitInfo | null;
  
  // Events
  on(type: 'click', handler: (hitInfo: HitInfo) => void): this;
  on(type: 'hover', handler: (hitInfo: HitInfo) => void): this;
}

// Line layer class
export declare class LineLayer extends Layer {
  constructor(options?: LineLayerOptions);
  
  // Data methods
  add(lines: LineFeature[]): this;
  clear(): this;
  getFeatureCount(): number;
  
  // Style methods
  setStyle(options: Partial<LineLayerOptions>): this;
  
  // Visibility
  show(): this;
  hide(): this;
  toggle(): this;
  
  // Hit testing
  hitTest(latlng: LatLng): HitInfo | null;
  
  // Events
  on(type: 'click', handler: (hitInfo: HitInfo) => void): this;
  on(type: 'hover', handler: (hitInfo: HitInfo) => void): this;
}

// Polygon layer class
export declare class PolygonLayer extends Layer {
  constructor(options?: PolygonLayerOptions);
  
  // Data methods
  add(polygons: PolygonFeature[]): this;
  clear(): this;
  getFeatureCount(): number;
  
  // Style methods
  setStyle(options: Partial<PolygonLayerOptions>): this;
  
  // Visibility
  show(): this;
  hide(): this;
  toggle(): this;
  
  // Hit testing
  hitTest(latlng: LatLng): HitInfo | null;
  
  // Events
  on(type: 'click', handler: (hitInfo: HitInfo) => void): this;
  on(type: 'hover', handler: (hitInfo: HitInfo) => void): this;
}

// GeoJSON layer class
export declare class GeoJSONLayer extends Layer {
  constructor(geojson?: any, options?: GeoJSONLayerOptions);
  
  // Data methods
  setData(geojson: any): this;
  addData(geojson: any): this;
  clear(): this;
  getFeatureCount(): number;
  
  // Streaming methods
  loadUrlStreaming(url: string, options?: GeoJSONStreamingOptions): Promise<void>;
  loadFile(file: File, options?: GeoJSONStreamingOptions): Promise<void>;
  processChunk(chunk: string, isFinal: boolean): void;
  
  // Style methods
  setStyle(options: Partial<GeoJSONLayerOptions>): this;
  resetStyle(): this;
  
  // Visibility
  show(): this;
  hide(): this;
  toggle(): this;
  
  // Hit testing
  hitTest(latlng: LatLng): HitInfo | null;
  
  // Events
  on(type: 'click', handler: (hitInfo: HitInfo) => void): this;
  on(type: 'hover', handler: (hitInfo: HitInfo) => void): this;
  on(type: 'load', handler: (event: Event) => void): this;
  on(type: 'error', handler: (event: ErrorEvent) => void): this;
}

// Popup class
export declare class Popup {
  constructor(options?: PopupOptions, source?: Layer);
  
  // Content methods
  setContent(content: string | HTMLElement): this;
  getContent(): string | HTMLElement;
  
  // Position methods
  setLatLng(latlng: LatLng): this;
  getLatLng(): LatLng | null;
  
  // Binding methods
  bindTo(layer: Layer, latlng?: LatLng): this;
  unbind(): this;
  
  // Control methods
  openOn(map: Map): this;
  close(): this;
  toggle(): this;
  isOpen(): boolean;
  
  // Utility methods
  update(): this;
  bringToFront(): this;
  bringToBack(): this;
  
  // Events
  on(type: string, handler: EventHandler): this;
  off(type: string, handler?: EventHandler): this;
  
  // Specific events
  on(type: 'open', handler: (event: Event) => void): this;
  on(type: 'close', handler: (event: Event) => void): this;
}

// Utility functions
export declare function latLng(lat: number, lng: number): LatLng;
export declare function latLngBounds(southWest: LatLng, northEast: LatLng): LatLngBounds;
export declare function point(x: number, y: number): Point;
export declare function bounds(point1: Point, point2: Point): any;

// CRS (Coordinate Reference System)
export declare namespace CRS {
  export const EPSG3857: any;
  export const EPSG4326: any;
  export const EPSG3395: any;
  export const Simple: any;
}

// Browser detection utilities
export declare namespace Browser {
  export const ie: boolean;
  export const ielt9: boolean;
  export const edge: boolean;
  export const webkit: boolean;
  export const android: boolean;
  export const android23: boolean;
  export const chrome: boolean;
  export const safari: boolean;
  export const win: boolean;
  export const ie3d: boolean;
  export const opera: boolean;
  export const mobile: boolean;
  export const mobileWebkit: boolean;
  export const mobileOpera: boolean;
  export const gecko: boolean;
  export const retina: boolean;
}

// Event utilities
export declare namespace DomEvent {
  export function on(element: HTMLElement, type: string, handler: EventHandler, context?: any): void;
  export function off(element: HTMLElement, type: string, handler: EventHandler, context?: any): void;
  export function stopPropagation(event: Event): void;
  export function preventDefault(event: Event): void;
  export function stop(event: Event): void;
  export function getMousePosition(event: MouseEvent, container?: HTMLElement): Point;
  export function getWheelDelta(event: WheelEvent): number;
  export function disableClickPropagation(element: HTMLElement): void;
  export function preventDefault(event: Event): void;
}

// DOM utilities
export declare namespace DomUtil {
  export function get(id: string): HTMLElement;
  export function getStyle(element: HTMLElement, style: string): string;
  export function create(tagName: string, className?: string, container?: HTMLElement): HTMLElement;
  export function remove(element: HTMLElement): void;
  export function empty(element: HTMLElement): void;
  export function toFront(element: HTMLElement): void;
  export function toBack(element: HTMLElement): void;
  export function hasClass(element: HTMLElement, name: string): boolean;
  export function addClass(element: HTMLElement, name: string): void;
  export function removeClass(element: HTMLElement, name: string): void;
  export function setOpacity(element: HTMLElement, opacity: number): void;
  export function testProp(props: string[]): string | undefined;
  export function setTransform(element: HTMLElement, offset: Point, scale?: number): void;
  export function setPosition(element: HTMLElement, point: Point): void;
  export function getPosition(element: HTMLElement): Point;
}

// Utility functions
export declare function extend(dest: any, ...sources: any[]): any;
export declare function create(proto: any, properties?: any): any;
export declare function bind(fn: Function, ...args: any[]): Function;
export declare function stamp(obj: any): number;
export declare function throttle(fn: Function, time: number, context: any): Function;
export declare function wrapNum(num: number, range: number[], includeMax?: boolean): number;
export declare function falseFn(): boolean;
export declare function formatNum(num: number, precision?: number): number;
export declare function trim(str: string): string;
export declare function splitWords(str: string): string[];
export declare function setOptions(obj: any, options: any): void;
export declare function getParamString(obj: any, existingUrl?: string, uppercase?: boolean): string;
export declare function template(templateString: string, data: any): string;
export declare function isArray(obj: any): boolean;
export declare function indexOf(array: any[], item: any): number;

// Version info
export declare const version: string;

// Default export
export default {
  Map,
  Layer,
  TileLayer,
  PointLayer,
  LineLayer,
  PolygonLayer,
  GeoJSONLayer,
  Popup,
  version,
  CRS,
  Browser,
  DomEvent,
  DomUtil,
  latLng,
  latLngBounds,
  point,
  bounds,
  extend,
  create,
  bind,
  stamp,
  throttle,
  wrapNum,
  falseFn,
  formatNum,
  trim,
  splitWords,
  setOptions,
  getParamString,
  template,
  isArray,
  indexOf
};