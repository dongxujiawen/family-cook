const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5050;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DATA_FILE = path.join(DATA_DIR, 'characters.json');
const PUBLIC_DIR = path.join(ROOT, 'public');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

/* ---------- 数据存取 ---------- */
function loadChars() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return []; }
}
function saveChars(arr) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2));
}

/* ---------- 类型与 MIME ---------- */
const IMG_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
const VID_EXT = ['.mp4', '.webm', '.mov', '.mkv', '.avi'];
const AUD_EXT = ['.mp3', '.wav', '.ogg', '.m4a'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4'
};
function typeOf(ext, ct) {
  const e = ext.toLowerCase();
  if (IMG_EXT.includes(e)) return 'image';
  if (VID_EXT.includes(e)) return 'video';
  if (AUD_EXT.includes(e)) return 'audio';
  if (ct) {
    if (ct.startsWith('image/')) return 'image';
    if (ct.startsWith('video/')) return 'video';
    if (ct.startsWith('audio/')) return 'audio';
  }
  return 'file';
}
function ctFor(ext) { return MIME[ext.toLowerCase()] || 'application/octet-stream'; }

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

/* ---------- 读取 JSON body ---------- */
function readJSON(req, cb) {
  const chunks = [];
  let size = 0;
  req.on('data', c => {
    size += c.length;
    if (size > 10 * 1024 * 1024) { req.destroy(); cb(new Error('body too large')); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    try { cb(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch (e) { cb(new Error('invalid json')); }
  });
  req.on('error', cb);
}

/* ---------- 解析 multipart/form-data（支持二进制，含视频） ---------- */
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || '');
  if (!m) return [];
  const boundary = '--' + (m[1] || m[2]).trim();
  const parts = [];
  let pos = buf.indexOf(boundary);
  if (pos < 0) return parts;
  while (true) {
    pos += boundary.length;
    if (buf.toString('ascii', pos, pos + 2) === '\r\n') pos += 2;
    if (buf.toString('ascii', pos, pos + 2) === '--') break; // 结束边界
    const next = buf.indexOf(boundary, pos);
    if (next < 0) break;
    let partBuf = buf.slice(pos, next);
    if (partBuf.length >= 2 && partBuf.toString('ascii', partBuf.length - 2) === '\r\n') {
      partBuf = partBuf.slice(0, partBuf.length - 2);
    }
    const sep = partBuf.indexOf('\r\n\r\n');
    if (sep > 0) {
      const headerStr = partBuf.toString('utf8', 0, sep);
      const body = partBuf.slice(sep + 4);
      const dM = /name="([^"]*)"(?:;\s*filename="([^"]*)")?/i.exec(headerStr);
      const ctM = /content-type:\s*([^\r\n]+)/i.exec(headerStr);
      parts.push({
        name: dM ? dM[1] : null,
        filename: dM && dM[2] ? dM[2] : null,
        contentType: ctM ? ctM[1].trim() : null,
        data: body
      });
    }
    pos = next;
  }
  return parts;
}

function readRaw(req, cb) {
  const chunks = [];
  let size = 0;
  const MAX = 1500 * 1024 * 1024; // 1.5GB 上限保护
  req.on('data', c => {
    size += c.length;
    if (size > MAX) { req.destroy(); cb(new Error('file too large')); return; }
    chunks.push(c);
  });
  req.on('end', () => cb(null, Buffer.concat(chunks)));
  req.on('error', cb);
}

/* ---------- 静态文件服务（支持 Range，视频可拖动） ---------- */
function serveFile(res, filepath, ct, headOnly) {
  fs.stat(filepath, (err, stat) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const total = stat.size;
    const range = false; // 由调用方传入
    res.writeHead(200, {
      'Content-Type': ct,
      'Content-Length': total,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    });
    if (headOnly) { res.end(); return; }
    fs.createReadStream(filepath).pipe(res);
  });
}
function serveFileRange(req, res, filepath, ct) {
  fs.stat(filepath, (err, stat) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const total = stat.size;
    const r = req.headers.range;
    if (r) {
      const mm = /bytes=(\d+)-(\d*)/.exec(r);
      if (mm) {
        const start = parseInt(mm[1], 10);
        const end = mm[2] ? parseInt(mm[2], 10) : total - 1;
        if (start > end || start >= total) { res.writeHead(416); res.end(); return; }
        res.writeHead(206, {
          'Content-Type': ct,
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Cache-Control': 'no-cache'
        });
        fs.createReadStream(filepath, { start, end }).pipe(res);
        return;
      }
    }
    res.writeHead(200, {
      'Content-Type': ct,
      'Content-Length': total,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filepath).pipe(res);
  });
}

/* ---------- 路由 ---------- */
const server = http.createServer((req, res) => {
  const parsed = req.url.split('?');
  const url = parsed[0];
  const qs = new URLSearchParams(parsed[1] || '');

  /* ===== API ===== */
  if (url.startsWith('/api/')) {
    // 列表
    if (url === '/api/characters' && req.method === 'GET') {
      return sendJSON(res, 200, loadChars());
    }
    // 新增角色
    if (url === '/api/characters' && req.method === 'POST') {
      return readJSON(req, (err, body) => {
        if (err) return sendJSON(res, 400, { error: err.message });
        const name = (body.name || '').trim();
        if (!name) return sendJSON(res, 400, { error: '角色名不能为空' });
        const chars = loadChars();
        const ch = {
          id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name,
          source: (body.source || '').trim(),
          note: (body.note || '').trim(),
          media: []
        };
        chars.push(ch);
        saveChars(chars);
        return sendJSON(res, 201, ch);
      });
    }
    // 删除角色
    let m = url.match(/^\/api\/characters\/([^/]+)$/);
    if (m && req.method === 'DELETE') {
      const id = m[1];
      const chars = loadChars();
      const idx = chars.findIndex(c => c.id === id);
      if (idx < 0) return sendJSON(res, 404, { error: 'not found' });
      (chars[idx].media || []).forEach(md => {
        const fp = path.join(UPLOAD_DIR, md.file);
        if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch (e) {}
      });
      chars.splice(idx, 1);
      saveChars(chars);
      return sendJSON(res, 200, { ok: true });
    }
    // 上传媒体
    m = url.match(/^\/api\/characters\/([^/]+)\/media$/);
    if (m && req.method === 'POST') {
      const id = m[1];
      const chars = loadChars();
      const ch = chars.find(c => c.id === id);
      if (!ch) return sendJSON(res, 404, { error: 'not found' });
      return readRaw(req, (err, buf) => {
        if (err) return sendJSON(res, 400, { error: err.message });
        const parts = parseMultipart(buf, req.headers['content-type']);
        const filePart = parts.find(p => p.filename);
        if (!filePart) return sendJSON(res, 400, { error: 'no file' });
        const original = filePart.filename;
        const ext = path.extname(original) || '';
        const base = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const stored = base + ext;
        fs.writeFileSync(path.join(UPLOAD_DIR, stored), filePart.data);
        const md = {
          file: stored,
          name: original,
          type: typeOf(ext, filePart.contentType),
          size: filePart.data.length,
          ct: filePart.contentType || ctFor(ext)
        };
        ch.media = ch.media || [];
        ch.media.push(md);
        saveChars(chars);
        return sendJSON(res, 200, md);
      });
    }
    // 删除媒体
    m = url.match(/^\/api\/characters\/([^/]+)\/media\/([^/]+)$/);
    if (m && req.method === 'DELETE') {
      const id = m[1], file = decodeURIComponent(m[2]);
      const chars = loadChars();
      const ch = chars.find(c => c.id === id);
      if (!ch) return sendJSON(res, 404, { error: 'not found' });
      ch.media = (ch.media || []).filter(x => x.file !== file);
      const fp = path.join(UPLOAD_DIR, file);
      if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch (e) {}
      saveChars(chars);
      return sendJSON(res, 200, { ok: true });
    }
    return sendJSON(res, 404, { error: 'api not found' });
  }

  /* ===== 上传的媒体文件 ===== */
  if (url.startsWith('/uploads/')) {
    const file = decodeURIComponent(url.slice('/uploads/'.length));
    // 防目录穿越
    if (file.includes('..') || file.includes('/')) { res.writeHead(400); return res.end('bad'); }
    const fp = path.join(UPLOAD_DIR, file);
    const ext = path.extname(file);
    return serveFileRange(req, res, fp, ctFor(ext));
  }

  /* ===== 前端页面 ===== */
  if (url === '/' || url === '/index.html') {
    return serveFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8', req.method === 'HEAD');
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`角色工作台已启动：http://localhost:${PORT}`);
  console.log(`本机访问：http://localhost:${PORT}`);
  console.log(`手机访问：连同一 WiFi 后打开 http://<你电脑的局域网IP>:${PORT}`);
});
