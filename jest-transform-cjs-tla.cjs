// Transformer for the default jest config: compiles src/*.js ESM -> CJS
// and removes the single top-level `await __ensureRustyleafWasmReady();`
// statement (src/rustyleaf-api.js:62). Top-level await is legal ESM but cannot
// run under jest's CommonJS vm.Script pipeline; in unit tests the WASM glue
// (dist/rustyleaf_core_bg.js) is mocked anyway, so the ready-gate is a no-op.
const swc = require('@swc/core');

module.exports = {
  process(src, filename) {
    const out = swc.transformSync(src, {
      filename,
      jsc: {
        parser: {syntax: 'ecmascript', importMeta: true, topLevelAwait: true},
        target: 'es2022'
      },
      module: {type: 'commonjs'},
      sourceMaps: 'inline'
    });
    const code = out.code.replace(
      /^await __ensureRustyleafWasmReady\(\);/m,
      '// [jest-real] top-level await stripped for CJS test runs'
    );
    return {code};
  }
};
