const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'lineup.json');
const INDEX = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  // 读取阵容（共享，教练编辑全队可见）
  if (req.url === '/api/lineup' && req.method === 'GET') {
    fs.readFile(DATA, 'utf8', (e, data) => {
      if (e) { res.writeHead(200, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify({empty:true})); return; }
      res.writeHead(200, {'Content-Type':'application/json; charset=utf-8'});
      res.end(data);
    });
    return;
  }
  // 保存阵容
  if (req.url === '/api/lineup' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      fs.writeFile(DATA, body, 'utf8', err => {
        if (err) { res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,err:String(err)})); return; }
        res.writeHead(200, {'Content-Type':'application/json; charset=utf-8'});
        res.end(JSON.stringify({ok:true}));
      });
    });
    return;
  }
  // 静态首页
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(INDEX, 'utf8', (e, data) => {
      if (e) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
      res.end(data);
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => console.log('GGBAO tactics running on port ' + PORT));
