const fs = require('fs');
const zlib = require('zlib');

const files = [
  'vector-points.png', 'vector-lines.png', 'vector-polygons.png',
  'geojson-all.png', 'canvas-full.png'
];

for (const file of files) {
  const d = fs.readFileSync('e2e/tests/baselines/chromium/visual.spec.ts/' + file);
  
  let pos = 33;
  let rawIdat = [];
  while (pos < d.length - 4) {
    const len = d.readUInt32BE(pos);
    const type = d.slice(pos+4, pos+8).toString('ascii');
    if (type === 'IDAT') {
      rawIdat.push(d.slice(pos+8, pos+8+len));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  
  const allRaw = Buffer.concat(rawIdat);
  const dec = zlib.inflateSync(allRaw);
  
  let gray = 0, non = 0;
  const rowSize = 800 * 3 + 1;
  for (let row = 0; row < 600; row++) {
    const base = row * rowSize + 1;
    for (let col = 0; col < 800*3; col += 3) {
      const r = dec[base+col], g = dec[base+col+1], b = dec[base+col+2];
      if (r === g && g === b) gray++; else non++;
    }
  }
  const total = gray + non;
  const pct = (non / total * 100).toFixed(2);
  console.log(`${file}: ${non}/${total} non-gray (${pct}%)  [${d.length}B file]`);
}
