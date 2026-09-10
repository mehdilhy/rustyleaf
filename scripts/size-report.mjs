// Reports raw/gzip/brotli sizes for shipped dist/ assets.
// Usage: node scripts/size-report.mjs [--check]  (--check exits 1 if budget missed)
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const BUDGET_RAW_BUNDLE_KB = 150; // user requirement: the shipped JS bundle
const BUDGET_TOTAL_BROTLI_KB = 165; // regression guard; 150 needs phase-2 wasm surgery (lyon->earcut, rstar->grid)

const files = readdirSync(join(DIST)).filter((f) => {
  const p = join(DIST, f);
  return statSync(p).isFile() && !/\.br$|\.gz$/.test(f);
});

const rows = files.map((f) => {
  const b = readFileSync(join(DIST, f));
  return {
    file: f,
    raw: b.length,
    gzip: gzipSync(b).length,
    brotli: brotliCompressSync(b).length,
  };
});

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
for (const r of rows.sort((a, b) => b.raw - a.raw)) {
  console.log(`${r.file}: raw=${kb(r.raw)} gzip=${kb(r.gzip)} brotli=${kb(r.brotli)}`);
}
const total = rows.reduce(
  (acc, r) => ({ raw: acc.raw + r.raw, gzip: acc.gzip + r.gzip, brotli: acc.brotli + r.brotli }),
  { raw: 0, gzip: 0, brotli: 0 },
);
console.log(`TOTAL: raw=${kb(total.raw)} gzip=${kb(total.gzip)} brotli=${kb(total.brotli)}`);

if (process.argv.includes('--check')) {
  const bundle = rows.find((r) => r.file === 'rustyleaf.bundle.js');
  let failed = false;
  if (bundle && bundle.raw / 1024 > BUDGET_RAW_BUNDLE_KB) {
    console.error(
      `BUDGET FAIL: rustyleaf.bundle.js raw ${kb(bundle.raw)} > ${BUDGET_RAW_BUNDLE_KB}KB`,
    );
    failed = true;
  }
  if (total.brotli / 1024 > BUDGET_TOTAL_BROTLI_KB) {
    console.error(`BUDGET FAIL: dist total brotli ${kb(total.brotli)} > ${BUDGET_TOTAL_BROTLI_KB}KB`);
    failed = true;
  }
  if (failed) process.exit(1);
  console.log('Budgets OK.');
}
