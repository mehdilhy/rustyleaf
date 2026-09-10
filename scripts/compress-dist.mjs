// Precompresses dist/ assets to .gz + .br for CDN/static hosting.
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
for (const f of readdirSync(join(DIST))) {
  const p = join(DIST, f);
  if (!statSync(p).isFile() || /\.br$|\.gz$/.test(f)) continue;
  if (!/\.(js|wasm|json|d\.ts|ts)$/.test(f) && !/^rustyleaf/i.test(f)) continue;
  const b = readFileSync(p);
  writeFileSync(`${p}.gz`, gzipSync(b, { level: 9 }));
  writeFileSync(`${p}.br`, brotliCompressSync(b));
  console.log(`compressed ${f}`);
}
