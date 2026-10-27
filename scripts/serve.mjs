import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('../site/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const base = process.env.BASE_PATH || '/';
if (!base.startsWith('/') || !base.endsWith('/')) throw new Error('BASE_PATH must start and end with /.');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, {'Allow':'GET, HEAD'}).end(); return; }
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith(base)) { response.writeHead(404).end('Not found'); return; }
    const relative = pathname.slice(base.length) || 'index.html';
    const filename = resolve(root, relative);
    if (!filename.startsWith(resolve(root) + sep)) { response.writeHead(403).end('Forbidden'); return; }
    const info = await stat(filename);
    if (!info.isFile()) { response.writeHead(404).end('Not found'); return; }
    const headers = {'Content-Type': types[extname(filename)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store'};
    response.writeHead(200, headers);
    response.end(request.method === 'HEAD' ? undefined : await readFile(filename));
  } catch { response.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}).end('Not found'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`CvyClip preview: http://127.0.0.1:${port}${base}\nPress Ctrl+C to stop.`));
