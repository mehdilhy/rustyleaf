import http from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 3333;
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = normalize(join(__dirname, '..'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.ts':   'text/plain; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png':  'image/png',
  '.geojson': 'application/json',
};

const server = http.createServer((req, res) => {
  let path;
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    path = normalize(join(ROOT, u.pathname));
    if (!path.startsWith(ROOT)) {
      res.writeHead(403);
      return void res.end('Forbidden');
    }
    if (!existsSync(path) || !statSync(path).isFile()) {
      res.writeHead(404);
      return void res.end('Not found');
    }
    const data = readFileSync(path);
    const mime = MIME[extname(path)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch (e) {
    try { res.writeHead(500); res.end('Internal error'); } catch {}
    console.error(`[serve] error serving ${req.url}:`, e.message);
  }
});

process.on('uncaughtException', (e) => {
  console.error('[serve] uncaught exception:', e.message);
  // Don't exit — keep serving
});

process.on('unhandledRejection', (e) => {
  console.error('[serve] unhandled rejection:', e?.message || e);
});

server.listen(PORT, () => {
  console.log(`e2e server: http://localhost:${PORT}`);
});
