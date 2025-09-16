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
        test: /\.wasm$/,
        type: 'webassembly/async',
      },
    ],
  },
  experiments: {
    asyncWebAssembly: true,
    outputModule: true,
  },
};

