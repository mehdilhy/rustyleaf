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
export interface GeoJSONLayerOptions {
  pointColor?: string;
  pointSize?: number;
  lineColor?: string;
  lineWidth?: number;
  polygonColor?: string;
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
  project(latlng: LatLng): [number, number];
  unproject(point: [number, number]): LatLng;
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

// ==================== Default export ====================

declare const _default: {
  Map: typeof Map;
  TileLayer: typeof TileLayer;
  PointLayer: typeof PointLayer;
  LineLayer: typeof LineLayer;
  PolygonLayer: typeof PolygonLayer;
  GeoJSONLayer: typeof GeoJSONLayer;
  Popup: typeof Popup;
};
export default _default;
