/**
 * 家庭点菜 H5 —— 零依赖后端服务
 * 运行：node server.js   （无需 npm install）
 * 默认端口 3000，可用 PORT 环境变量覆盖
 *
 * 数据存储：本目录 data.json（菜品库 + 每日点菜单）
 * 两人共用同一份数据，前端每 5 秒轮询一次实现“实时”同步
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- 数据存储 ----------
function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      d.seq = d.seq || { dish: 0, order: 0 };
      d.dishes = d.dishes || [];
      d.orders = d.orders || [];
      return d;
    } catch (e) {
      console.error('⚠️ data.json 损坏，已用空数据重置：', e.message);
    }
  }
  return { dishes: [], orders: [], seq: { dish: 0, order: 0 } };
}
let data = loadData();
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function nextId(kind) {
  data.seq[kind] = (data.seq[kind] || 0) + 1;
  return data.seq[kind];
}

// ---------- 工具函数 ----------
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => {
      buf += c;
      if (buf.length > 1e6) req.destroy(); // 防滥用
    });
    req.on('end', () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(
    PUBLIC_DIR,
    path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
  );
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ---------- API ----------
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','dishes']
  const method = req.method;

  // ---- 菜品库 ----
  if (parts[1] === 'dishes') {
    if (method === 'GET') {
      return sendJSON(res, 200, { dishes: data.dishes });
    }
    if (method === 'POST') {
      const b = await readBody(req);
      const name = (b.name || '').trim();
      if (!name) return sendJSON(res, 400, { error: '菜名不能为空' });
      const dish = { id: nextId('dish'), name, createdAt: Date.now() };
      data.dishes.push(dish);
      saveData();
      return sendJSON(res, 200, { dish });
    }
    if (method === 'DELETE') {
      const id = parseInt(parts[2], 10);
      data.dishes = data.dishes.filter((d) => d.id !== id);
      saveData();
      return sendJSON(res, 200, { ok: true });
    }
  }

  // ---- 每日点菜单 ----
  if (parts[1] === 'orders') {
    if (method === 'GET') {
      const date = url.searchParams.get('date');
      let orders = data.orders;
      if (date) orders = orders.filter((o) => o.date === date);
      return sendJSON(res, 200, { orders });
    }
    if (method === 'POST') {
      // 老公提交某天的点菜：先清空该天旧单，再写入新选的菜
      const b = await readBody(req);
      const date = b.date;
      const dishIds = Array.isArray(b.dishIds) ? b.dishIds.map(Number) : [];
      if (!date) return sendJSON(res, 400, { error: '缺少日期' });
      data.orders = data.orders.filter((o) => o.date !== date);
      const newOrders = [];
      dishIds.forEach((did) => {
        const dish = data.dishes.find((d) => d.id === did);
        if (dish) {
          newOrders.push({
            id: nextId('order'),
            date,
            dishId: did,
            dishName: dish.name,
            status: 'pending', // pending(未准备) / ready(已准备)
            updatedAt: Date.now(),
          });
        }
      });
      data.orders.push(...newOrders);
      saveData();
      return sendJSON(res, 200, { orders: newOrders });
    }
    if (method === 'PATCH') {
      // 老婆标记某道菜是否已准备
      const id = parseInt(parts[2], 10);
      const b = await readBody(req);
      const o = data.orders.find((x) => x.id === id);
      if (!o) return sendJSON(res, 404, { error: 'not found' });
      if (b.status) o.status = b.status;
      o.updatedAt = Date.now();
      saveData();
      return sendJSON(res, 200, { order: o });
    }
    if (method === 'DELETE') {
      const id = parseInt(parts[2], 10);
      data.orders = data.orders.filter((x) => x.id !== id);
      saveData();
      return sendJSON(res, 200, { ok: true });
    }
  }

  return sendJSON(res, 404, { error: 'unknown api' });
}

// ---------- 主服务 ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        return res.end();
      }
      return await handleApi(req, res, url);
    }
    return serveStatic(req, res);
  } catch (e) {
    console.error(e);
    sendJSON(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`🍳 家庭点菜 H5 已启动：http://localhost:${PORT}`);
});
