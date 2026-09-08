const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  mode: 'production',
  // WebGL2 + WASM already require a modern browser, so emit ES2020
  // (arrows/const/async natively) instead of transpiled ES5 helpers.
  target: ['web', 'es2020'],
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'rustyleaf.bundle.js',
    library: {
      type: 'module',
    },
    environment: {
      arrowFunction: true,
      const: true,
      destructuring: true,
      forOf: true,
      module: true,
    },
  },
  performance: {
    hints: false, // Disable performance warnings
  },
  resolve: {
    extensions: ['.js', '.wasm'],
  },
  // The wasm-bindgen glue (dist/rustyleaf_core_bg.js) already ships next to
  // the bundle and must stay a SINGLE module instance (the API manually
  // instantiates the wasm against that exact module object). Inlining it
  // would duplicate ~68KB of glue into the bundle, so keep it external:
  // dist/rustyleaf.bundle.js imports ./rustyleaf_core_bg.js at runtime.
  externals: {
    '../dist/rustyleaf_core_bg.js': 'module ./rustyleaf_core_bg.js',
  },
  optimization: {
    minimize: true,
    usedExports: true,
    sideEffects: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          module: true,
          toplevel: true,
          compress: {
            passes: 3,
            pure_funcs: ['console.log', 'console.info', 'console.debug'],
          },
          mangle: true,
          format: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
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
