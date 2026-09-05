const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'rustyleaf.bundle.js',
    library: {
      type: 'module',
    },
  },
  performance: {
    hints: false, // Disable performance warnings
  },
  resolve: {
    extensions: ['.js', '.wasm'],
  },
  module: {
    rules: [
      {
        // The wasm is fetched at runtime via `new URL(..., import.meta.url)`
        // in rustyleaf-api.js. Emit it as a plain asset with a stable name so
        // exactly one WASM instance exists (webassembly/async would create a
        // second, racing instance).
        test: /\.wasm$/,
        type: 'asset/resource',
        generator: {
          filename: 'rustyleaf_core_bg.wasm',
        },
      },
    ],
  },
  experiments: {
    outputModule: true,
  },
};

