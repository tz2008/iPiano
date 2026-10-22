// server.js — 本地静态服务器（node server.js 后打开 http://localhost:8123）
// iPad 同 Wi-Fi 访问：用下方打印的局域网 IP，如 http://192.168.1.5:8123
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = process.env.PORT || 8123;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { p = req.url; }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('五线谱小课堂已启动: http://localhost:' + PORT);
  // 打印局域网 IP（iPad 同 Wi-Fi 直接访问）
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name in nets) {
    for (const ni of nets[name]) {
      if (ni.family === 'IPv4' && !ni.internal) ips.push('http://' + ni.address + ':' + PORT);
    }
  }
  if (ips.length) {
    console.log('iPad（同一 Wi-Fi）访问:');
    ips.forEach(ip => console.log('  ' + ip));
    console.log('（首次运行 Windows 弹防火墙请点“允许访问”）');
  }
});
