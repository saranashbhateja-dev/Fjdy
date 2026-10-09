// Technical Builder OS local server.
// Run with Node.js 22+. Serves the app without requiring a framework.
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = Number(process.env.PORT || 3001);
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon',
};
function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
function safePath(urlPath) {
  const raw = decodeURIComponent(urlPath.split('?')[0]);
  const relative = raw === '/' ? 'index.html' : raw.replace(/^\/+/, '');
  const full = path.resolve(ROOT, relative);
  return full.startsWith(path.resolve(ROOT) + path.sep) ? full : null;
}
const server = http.createServer((req, res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) return send(res, 405, 'Method not allowed');
    if (req.url === '/health') { const body=JSON.stringify({ ok: true, app: 'Technical Builder OS' }); if(req.method==='HEAD'){res.writeHead(200, {'Content-Type':MIME['.json'],'Cache-Control':'no-store'});return res.end();} return send(res, 200, body, MIME['.json']); }
    const file = safePath(req.url || '/');
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': ext === '.json' ? 'no-store' : 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    send(res, 500, 'Server error');
  }
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is busy. Close the other app window or set PORT.`);
  else console.error(e);
});
server.listen(PORT, '127.0.0.1', () => console.log(`Technical Builder OS running at http://localhost:${PORT}`));
