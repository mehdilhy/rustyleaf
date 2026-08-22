// ⚠️ Rustyleaf is pre-alpha (v0.0.1): the API will change without notice.
// See README.md "Known limitations" for what works today and what doesn't.

console.warn('Rustyleaf v0.0.1 is pre-alpha: the API is unstable and not production-ready. See the README for known limitations.');

// WASM initialization happens in rustyleaf-api.js (single fetch + instantiate,
// resolved relative to the bundle URL). Do NOT also import dist/rustyleaf_core.js
// here: that creates a second, racing WASM instance whose memory is disjoint
// from the one the API talks to (layers silently vanish).

// Main entry point for webpack bundling to UMD output
export * from './rustyleaf-api.js';
export { default } from './rustyleaf-api.js';
