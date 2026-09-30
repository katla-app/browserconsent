import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('./fixtures/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

function handler(req, res) {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, path === '/' ? 'index.html' : path);
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}

// Two ports so a fixture can embed a cross-origin iframe (port + 1).
export async function startServer(port = 0) {
  const main = createServer(handler);
  await new Promise((resolve) => main.listen(port, resolve));
  const { port: mainPort } = main.address();
  const second = createServer(handler);
  await new Promise((resolve) => second.listen(mainPort + 1, resolve));
  return {
    port: mainPort,
    close: () => Promise.all([main, second].map((s) => new Promise((resolve) => s.close(resolve)))),
  };
}
