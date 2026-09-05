// Public package entry point. The compatibility surface is versioned from
// package.json; keep module evaluation side-effect free so applications and
// SSR bundlers can import Rustyleaf without a release-status warning.

// WASM initialization happens in rustyleaf-api.js (single fetch + instantiate,
// resolved relative to the bundle URL). Do NOT also import dist/rustyleaf_core.js
// here: that creates a second, racing WASM instance whose memory is disjoint
// from the one the API talks to (layers silently vanish).

// Main entry point for webpack bundling to UMD output
export * from './rustyleaf-api.js';
export { default } from './rustyleaf-api.js';
