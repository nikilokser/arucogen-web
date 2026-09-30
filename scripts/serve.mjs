import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const production = process.argv.includes('--dist');
const directory = production ? path.join(root, 'dist') : root;
const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 5173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png' };

http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    let relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    if (relative.split('/').some(segment => segment.startsWith('.'))) { response.writeHead(404).end(); return; }
    let target = path.resolve(directory, relative);
    if (!target.startsWith(directory + path.sep)) { response.writeHead(403).end(); return; }
    // Development serves the same public paths as the static build.
    if (!production && relative.startsWith('examples/')) target = path.join(root, 'public', relative);
    const info = await stat(target);
    if (!info.isFile()) { response.writeHead(404).end(); return; }
    const data = await readFile(target);
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`ArUco Web: http://127.0.0.1:${port}`));
