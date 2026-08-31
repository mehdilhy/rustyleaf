# Installation

Rustyleaf is published on npm as a pre-alpha package. It ships an ES module
bundle with the WASM inlined via async loading, so it works out of the box with
Vite, Webpack 5, and other bundlers that support async WebAssembly. **No
runtime dependencies.**

```bash
npm install rustyleaf
```

## Module formats

The package exposes both a module entry and a self-contained bundle:

| Field | Path | Use |
| --- | --- | --- |
| `module` | `dist/rustyleaf.js` | Tree-shakeable ES module |
| `main` / default | `dist/rustyleaf.bundle.js` | Standalone bundle with WASM inlined |
| `types` | `types/rustyleaf.d.ts` | TypeScript definitions |

For most apps, import the named exports and let your bundler resolve WASM
asynchronously:

```js
import { Map, TileLayer, PointLayer } from 'rustyleaf'
```

## Using from a CDN / plain script

The bundle is self-contained. With an import map you can use it directly in a
browser without a build step:

```html
<script type="module">
  import { Map, TileLayer } from 'https://cdn.jsdelivr.net/npm/rustyleaf/dist/rustyleaf.bundle.js'

  const map = new Map('map', { center: [48.8566, 2.3522], zoom: 12 })
  new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
</script>
```

The WASM core is loaded asynchronously on first `Map` construction. Make sure
the page is served over HTTP(S) — `file://` won't allow the WASM fetch in most
browsers.

## Container element

Rustyleaf sizes its canvas to the container element, so give it explicit
dimensions:

```html
<div id="map" style="width: 100%; height: 100vh;"></div>
```

## TypeScript

Types are bundled. With `moduleResolution: "bundler"` or `"node16"` they resolve
automatically from the package `exports`. Everything in
[`types/rustyleaf.d.ts`](https://github.com/mehdilhy/rustyleaf/blob/main/types/rustyleaf.d.ts)
is accurate to the runtime.
