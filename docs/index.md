---
layout: home

hero:
  name: Rustyleaf
  text: The Leaflet API, rendered by Rust + WASM + WebGL2
  tagline: >-
    Keep the familiar Leaflet developer experience while rendering datasets
    that make DOM-based maps fall over. 60fps at 1,000,000 points.
  image:
    src: /logo.png
    alt: Rustyleaf logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/introduction
    - theme: alt
      text: API Reference
      link: /api
    - theme: alt
      text: View on GitHub
      link: https://github.com/mehdilhy/rustyleaf

features:
  - icon: 🍃
    title: Leaflet-shaped API
    details: >-
      new Map('map'), layer.addTo(map), map.on('click', ...). If you know
      Leaflet, you already know Rustyleaf. The API is TDD'd against the real
      runtime, not a wish list.
  - icon: ⚡
    title: Rust / WASM core
    details: >-
      GeoJSON parsing, polygon tessellation (Lyon), and R-tree spatial indexing
      run in compiled Rust — off the JS main thread — not in a DOM renderer.
  - icon: 🎮
    title: WebGL2 rendering
    details: >-
      Tiles, points, lines, and polygons drawn on the GPU. Point geometry is
      uploaded once and projected in the vertex shader, so it stays resident.
  - icon: 📈
    title: Holds 1,000,000 points at 60fps
    details: >-
      GPU-resident points plus a deterministic fragment-work budget keep huge
      layers smooth even when zoomed out to a world view.
  - icon: 🧩
    title: Full feature surface
    details: >-
      Markers, shapes, popups, tooltips, layer groups, controls, ground
      overlays, WMS/grid tiles, flyTo, geolocation, and Leaflet-style events.
  - icon: 🧪
    title: Honestly documented & tested
    details: >-
      823 Jest unit and parity tests, a Playwright e2e suite (visual regression, GL leak
      detection, FPS, soak), and a reproducible benchmark. Nothing here is
      aspirational.

---

## Why Rustyleaf?

Leaflet's API is beloved, but its DOM/Canvas renderer struggles past a few
thousand features. WebGL map engines (MapLibre GL, deck.gl) scale — but with a
different mental model. Rustyleaf is an experiment in having both: the Leaflet
developer ergonomics you already know, backed by a Rust → WebAssembly → WebGL2
rendering core that doesn't flinch at a million points.

```js
import { Map, TileLayer, PointLayer } from 'rustyleaf'

const map = new Map('map', { center: [48.8566, 2.3522], zoom: 12 })

new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map)

// 100k points? Go ahead.
const points = new PointLayer()
points.add(
  Array.from({ length: 100_000 }, () => ({
    lat: 48.8 + Math.random() * 0.2,
    lng: 2.2 + Math.random() * 0.3,
    size: 4,
    color: '#e0393e',
  }))
)
points.addTo(map)
```

> **Compatibility preview (v0.0.8).** The documented Leaflet-style surface is
> covered by unit, parity, and end-to-end tests while the WebGL2 renderer and
> plugin ecosystem continue to mature.

## Performance at a glance

Point rendering is GPU-resident: geometry is uploaded once as zoom-independent
normalized-mercator coordinates and projected in the vertex shader. Against
Leaflet's canvas renderer that's **~3× faster at 100k points and ~37× at 1M**;
against MapLibre GL it ties on render FPS while setting up ~3× faster and still
rendering at 1M points (where MapLibre ran out of memory in the test
environment). [See the benchmark →](/performance)

| Artifact | Raw | Gzipped |
| --- | --- | --- |
| WASM core | 1.5 MB | ~500 KB |
| JS wrapper | 55 KB | 18 KB |

## Where to next?

- **New here?** Read the [Introduction](/guide/introduction) and
  [Quick Start](/guide/quick-start).
- **Looking up a method?** Jump to the [API Reference](/api).
- **Want proof?** Check [Examples](/examples) and
  [Performance](/performance).
- **Migrating a Leaflet workflow?** Use the [20 use cases](/use-cases) as a
  copy-paste compatibility checklist.
