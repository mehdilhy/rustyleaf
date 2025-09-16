// ⚠️ EXPERIMENTAL - NOT FOR PRODUCTION USE
// 
// WARNING: This is an early-stage experimental map library.
// DO NOT USE IN PRODUCTION APPLICATIONS.
//
// Known issues:
// - Memory leaks present
// - Limited error handling  
// - Performance not benchmarked
// - Missing critical features
// - Security vulnerabilities may exist
//
// Use only for experimentation, learning, or contributing to development.

console.warn('⚠️ Rustyleaf v0.0.1-experimental - NOT FOR PRODUCTION USE');
console.warn('This is an early-stage experimental library with known issues.');
console.warn('See documentation for limitations and suitability.');

// Import WASM bindings to include them in the bundle
import '../dist/rustyleaf_core.js';

// Main entry point for webpack bundling to UMD output
export * from './rustyleaf-api.js';
export { default } from './rustyleaf-api.js';
