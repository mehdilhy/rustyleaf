// Custom Jest transform for src/rustyleaf-api.js
// Fixes import.meta.url (ESM-only) before passing to ts-jest for CJS compilation
const tsJest = require('ts-jest').default || require('ts-jest');
const { createTransformer } = tsJest;
const tsJestTransformer = createTransformer ? createTransformer() : tsJest;

module.exports = {
  process(sourceText, sourcePath, jestConfig) {
    const fixed = sourceText.replace(
      /import\.meta\.url/g,
      "'file:///mock/rustyleaf_core_bg.wasm'"
    );
    return tsJestTransformer.process(fixed, sourcePath, jestConfig);
  },
};
