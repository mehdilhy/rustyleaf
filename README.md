# 🚨 Rustyleaf 🗺️ v0.0.1 (EXPERIMENTAL - WORK IN PROGRESS)

**⚠️ WARNING: This is an early-stage experimental project. Currently incomplete and NOT FOR PRODUCTION.**

**Tiny, modern Rust-based map visualization engine (WASM + WebGL2).**
Leaflet-simple API. Currently in active development with many unfinished features.

---

## 🎯 Current Status: PRE-ALPHA

### ✅ What Works (Basic Features)
- 🗺️ **Tile rendering**: Basic XYZ tile support with WebGL2
- 📍 **Point rendering**: Simple point display with basic styling
- 🎮 **Basic interaction**: Pan, zoom, click events (limited)
- 📦 **WASM compilation**: Rust core with JavaScript API
- 🎯 **Spatial indexing**: R-tree for hit-testing (partially implemented)

### ❌ What's Missing (Critical Issues)
- 🔴 **Memory leaks**: Multiple memory management issues
- ⚡ **Performance problems**: Slow rendering, inefficient algorithms
- 🛡️ **Poor error handling**: Many unwrap() calls, crashes easily
- 📱 **No mobile support**: Limited touch event handling
- 🔧 **Incomplete features**: Many placeholder implementations
- 🐛 **Unstable API**: Breaking changes likely
- 📊 **No testing**: Minimal test coverage

---

## 🚀 Quick Start

### Installation
```bash
npm install rustyleaf
# or
yarn add rustyleaf
# or
pnpm add rustyleaf
```

### Basic Usage
```javascript
import { Map } from 'rustyleaf';

// Create map instance
const map = new Map({
  container: 'map',
  center: [40.7128, -74.0060], // [lat, lng]
  zoom: 10
});

// Add tile layer
map.addTileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors'
});

// Add GeoJSON layer
map.addGeoJSONLayer({
  type: 'Feature',
  geometry: {
    type: 'Point',
    coordinates: [-74.0060, 40.7128]
  },
  properties: {
    name: 'New York City'
  }
});

// Handle events
map.on('click', (event) => {
  console.log('Clicked at:', event.latlng);
});
```

---

## 📚 API Reference

### Core Classes

#### Map
```javascript
const map = new Map(options);
```

**Options:**
- `container`: `string | HTMLElement` - Map container element or selector
- `center`: `[number, number]` - Initial center as [lat, lng]
- `zoom`: `number` - Initial zoom level (0-22)
- `width`: `number` - Map width in pixels (optional)
- `height`: `number` - Map height in pixels (optional)

**Methods:**
- `setView(center: [number, number], zoom: number): void`
- `panBy(deltaX: number, deltaY: number): void`
- `fitBounds(bounds: [[number, number], [number, number]]): void`
- `on(event: string, callback: Function): void`
- `off(event: string, callback: Function): void`

#### TileLayer
```javascript
const tileLayer = map.addTileLayer(urlTemplate, options);
```

**Options:**
- `attribution`: `string` - Attribution text
- `maxZoom`: `number` - Maximum zoom level
- `subdomains`: `string[]` - Subdomain array for URL template

#### GeoJSONLayer
```javascript
const geojsonLayer = map.addGeoJSONLayer(geojson, options);
```

**Options:**
- `style`: `object` - Styling options for features
- `pointToLayer`: `Function` - Custom point rendering
- `onEachFeature`: `Function` - Feature event handlers

---

## 🛠️ Development

### Prerequisites
- Rust 1.70+ with `wasm32-unknown-unknown` target
- Node.js 18+
- wasm-pack

### Setup
```bash
# Clone the repository
git clone https://github.com/mehdilhy/rustyleaf.git
cd rustyleaf

# Install Rust target
rustup target add wasm32-unknown-unknown

# Install wasm-pack
cargo install wasm-pack

# Install dependencies
npm install
```

### Development Commands
```bash
# Build project
npm run build

# Development mode with watch
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format

# Type checking
npm run typecheck
```

---

## 🛠️ Development

### Prerequisites
- Rust (latest stable)
- Node.js 18+
- wasm-pack

### Setup
```bash
# Clone the repository
git clone https://github.com/mehdilhy/rustyleaf.git
cd rustyleaf

# Install dependencies
npm install

# Install wasm-pack
cargo install wasm-pack
```

### Development
```bash
# Build project (Rust -> WASM and JS bundle)
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run benchmarks
npm run bench

# Format code
npm run format

# Lint code
npm run lint
```

### Build WASM
```bash
# Build WebAssembly module
npm run build:wasm

# Build everything for release
npm run prepublishOnly
```

### Run Examples (no dev server)
```bash
# Build once
npm run build

# Open basic example
# Windows:
start examples\\basic\\index.html
# macOS:
open examples/basic/index.html
# Linux:
xdg-open examples/basic/index.html

# Open React/Vue CDN examples similarly:
# start examples\\react\\index.html
# start examples\\vue\\index.html
```

### Cross-platform build notes
- Windows: use MSVC toolchain for Rust (default on rustup for Windows). Ensure `wasm-pack` is installed and available in PATH. If you hit OpenSSL or linker errors, run `rustup target add wasm32-unknown-unknown` and retry `npm run build`.
- Linux/macOS: ensure `wasm32-unknown-unknown` target is installed: `rustup target add wasm32-unknown-unknown`.
- CI builds on Ubuntu are configured in `.github/workflows/ci.yml`.

---

## 🎯 Development Goals (Theoretical)

**NOTE: These are aspirational goals, not current capabilities.**

| Feature | Goal | Current Status |
|---------|------|----------------|
| Vector rendering | WebGL2 acceleration | 🚧 Basic implementation |
| Point display | GPU instancing | ✅ Working |
| Tile loading | Smooth experience | ✅ Working |
| Memory management | No leaks | ❌ Issues present |

---

## ⚠️ Security and Stability

This is an early experimental release. No network requests or telemetry beyond fetching public tiles via the URL you provide. Review the source if you embed in production.

## 🗺️ Roadmap

### v0.1 (Current)
- ✅ WebGL2 rendering engine
- ✅ Basic Map, TileLayer, PointLayer
- ✅ Event system foundation
- ✅ npm package structure

### v0.2 (Next)
- Line and polygon rendering
- Advanced hit-testing
- Label collision detection
- Vector tile support

---

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Current focus areas:**
- Mobile performance optimization
- Advanced rendering features
- More layer types
- Better documentation

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file

---

## 🙏 Acknowledgments

Inspired by Leaflet, MapLibre GL JS, and the amazing Rust/WASM ecosystem.