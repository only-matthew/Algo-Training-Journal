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
    const urlPath = new URL(req.url,'http://localhost').pathname;
    // 标签目录是按 tagStorageKey 落盘的（`A*` → `A%2A`），所以解码后的路径可能不存在：
    // 先按解码路径找，找不到再按原样（未解码）路径找，模拟静态托管对百分号编码目录的处理。
    const candidates = [...new Set([decodeURIComponent(urlPath), urlPath])]
      .map((value) => path.resolve(root, '.' + value));
    let file = null;
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) { file = candidate; break; }
    }
    if (!file) { res.writeHead(404).end(); return; }
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
    if (fs.statSync(file).isDirectory()) file=path.join(file,'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    const ext = path.extname(file);
    // 预览服务不做内容哈希，浏览器会用启发式缓存留住旧的 style.css：重建后仍然按旧样式
    // 测量/截图（实测踩到过，而且带 ?v= 的请求会绕过 no-store）。预览是本地工具，直接禁缓存。
    const headers = {'Content-Type':types[ext] || 'application/octet-stream', 'Cache-Control':'no-store, no-cache, must-revalidate', 'Pragma':'no-cache', 'Expires':'0'};
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
