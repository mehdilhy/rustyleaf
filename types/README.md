# Rustyleaf TypeScript Definitions

Complete TypeScript type definitions for [Rustyleaf](https://github.com/your-username/rustyleaf) - a high-performance WebAssembly map visualization engine built with Rust and WebGL2.

## Installation

```bash
npm install rustyleaf
npm install @types/rustyleaf --save-dev
```

## Features

- **Complete API Coverage**: Full type definitions for all Rustyleaf classes and methods
- **Leaflet-compatible**: Familiar API design with enhanced performance
- **WebGL2-powered**: Hardware-accelerated rendering
- **Type-safe**: Comprehensive type checking for all features
- **Streaming support**: Type definitions for large GeoJSON streaming
- **Event system**: Strongly typed event handlers and callbacks

## Quick Start

```typescript
import { Map, TileLayer, PointLayer, GeoJSONLayer } from 'rustyleaf';

// Create a map
const map = new Map('map', {
  center: [40.7128, -74.0060],
  zoom: 10
});

// Add tile layer
const tiles = new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
tiles.addTo(map);

// Add point layer
const points = new PointLayer();
points.add([
  { lat: 40.7128, lng: -74.0060, size: 5, color: '#ff0000' },
  { lat: 40.7580, lng: -73.9855, size: 8, color: '#00ff00' }
]);
points.addTo(map);

// Add GeoJSON layer with streaming support
const geojson = new GeoJSONLayer(null, {
  pointColor: '#ff0000',
  pointSize: 3,
  lineColor: '#00ff00',
  lineWidth: 2,
  polygonColor: '#0000ff80'
});

// Load large GeoJSON with streaming
geojson.loadUrlStreaming('https://example.com/large-data.geojson', {
  chunkSize: 1024 * 512, // 512KB chunks
  progressCallback: (progress) => {
    console.log(`Progress: ${progress.percentage}%`);
  },
  completeCallback: (result) => {
    console.log(`Loaded ${result.totalFeatures} features`);
  }
});

geojson.addTo(map);
```

## API Reference

### Core Classes

#### Map

Main map class with comprehensive navigation and layer management.

```typescript
const map = new Map(elementId: string, options?: MapOptions);
```

**Key Methods:**
- `setView(center: LatLng, zoom: number)`
- `setCenter(center: LatLng)`
- `setZoom(zoom: number)`
- `fitBounds(bounds: LatLngBounds)`
- `panBy(offset: Point)`
- `addLayer(layer: Layer)`
- `on(type: string, handler: EventHandler)`

#### Layers

##### TileLayer
```typescript
const tiles = new TileLayer(urlTemplate: string, options?: TileLayerOptions);
```

##### PointLayer
```typescript
const points = new PointLayer(options?: PointLayerOptions);
points.add(points: PointFeature[]);
```

##### LineLayer
```typescript
const lines = new LineLayer(options?: LineLayerOptions);
lines.add(lines: LineFeature[]);
```

##### PolygonLayer
```typescript
const polygons = new PolygonLayer(options?: PolygonLayerOptions);
polygons.add(polygons: PolygonFeature[]);
```

##### GeoJSONLayer
```typescript
const geojson = new GeoJSONLayer(data?: any, options?: GeoJSONLayerOptions);
```

**Streaming Support:**
```typescript
geojson.loadUrlStreaming(url: string, options?: GeoJSONStreamingOptions);
geojson.loadFile(file: File, options?: GeoJSONStreamingOptions);
geojson.processChunk(chunk: string, isFinal: boolean);
```

#### Popup

Enhanced popup system with auto-panning and anchoring.

```typescript
const popup = new Popup(options?: PopupOptions);
popup.setContent(content: string | HTMLElement);
popup.setLatLng(latlng: LatLng);
popup.openOn(map);
```

### Events

Strongly typed event system:

```typescript
map.on('click', (event: ClickEvent) => {
  console.log('Clicked at:', event.latlng);
});

map.on('move', (event: MoveEvent) => {
  console.log('Moved to:', event.center);
});

points.on('click', (hitInfo: HitInfo) => {
  console.log('Hit point:', hitInfo.layer_index, hitInfo.feature_index);
});
```

### Types

#### Core Types
```typescript
type LatLng = [number, number];
type LatLngBounds = [LatLng, LatLng];
type Point = { x: number; y: number };
```

#### Feature Types
```typescript
interface PointFeature {
  lat: number;
  lng: number;
  size?: number;
  color?: string;
  opacity?: number;
  properties?: Record<string, any>;
}

interface LineFeature {
  coordinates: LatLng[];
  width?: number;
  color?: string;
  opacity?: number;
  properties?: Record<string, any>;
}

interface PolygonFeature {
  coordinates: LatLng[][];
  color?: string;
  opacity?: number;
  properties?: Record<string, any>;
}
```

#### Event Types
```typescript
interface MapEvent {
  type: string;
  target: Map;
  latlng?: LatLng;
  originalEvent?: Event;
}

interface ClickEvent extends MapEvent {
  type: 'click';
  latlng: LatLng;
}

interface MouseEvent extends MapEvent {
  type: 'mousedown' | 'mouseup' | 'mousemove' | 'contextmenu';
  latlng: LatLng;
  containerPoint: Point;
  originalEvent: MouseEvent;
}
```

## Performance Features

### Streaming GeoJSON

Handle large GeoJSON files efficiently with chunked processing:

```typescript
const geojson = new GeoJSONLayer();

geojson.loadUrlStreaming('large-data.geojson', {
  chunkSize: 1024 * 1024, // 1MB chunks
  progressCallback: (progress) => {
    console.log(`${progress.percentage}% loaded, ${progress.featureCount} features`);
  },
  completeCallback: (result) => {
    console.log(`Completed: ${result.totalFeatures} features, ${result.totalBytes} bytes`);
  },
  errorCallback: (error) => {
    console.error('Loading failed:', error);
  }
});
```

### Hit Testing

Efficient spatial queries with hit testing:

```typescript
const hitInfo = points.hitTest([40.7128, -74.0060]);
if (hitInfo) {
  console.log('Hit point:', hitInfo.properties);
}
```

## Development

### Building Types

```bash
npm run build:types
```

### Testing Types

```bash
npm run test
```

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format
```

## Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add/update type definitions
5. Run tests and linting
6. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Related Packages

- [rustyleaf](https://www.npmjs.com/package/rustyleaf) - Core Rustyleaf package
- [rustyleaf-core](https://www.npmjs.com/package/rustyleaf-core) - WebAssembly core

## Changelog

### v0.0.1-experimental
- Initial TypeScript definitions release
- Complete API surface coverage
- Streaming GeoJSON support
- Event system typing
- Performance optimization types