import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createGzip } from 'node:zlib';
const root = path.resolve('site');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const compressible = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg']);
function acceptsGzip(header = '') {
  return String(header).split(',').some((part) => {
    const [coding, ...params] = part.trim().split(';');
    if (!['gzip', '*'].includes(coding.toLowerCase())) return false;
    const quality = params.find((param) => /^\s*q\s*=/i.test(param));
    return quality == null || Number(quality.split('=')[1]) > 0;
  });
}
http.createServer((req,res)=>{
  try {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    const ext = path.extname(file);
    const headers = {'Content-Type':types[ext] || 'application/octet-stream'};
    const accepts = acceptsGzip(req.headers['accept-encoding']);
    if (accepts && compressible.has(ext)) {
      headers['Content-Encoding'] = 'gzip';
      headers.Vary = 'Accept-Encoding';
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(createGzip()).pipe(res);
      return;
    }
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(400).end(); }
}).listen(4173,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4173'));
