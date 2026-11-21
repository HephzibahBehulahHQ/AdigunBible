import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
http.createServer((req, res) => {
  let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${path.sep}`)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.createReadStream(file).on('error', () => { res.writeHead(404); res.end('not found'); }).pipe(res);
}).listen(4175, '127.0.0.1');

