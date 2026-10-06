// server.js — LAN server for Bão Lửa. No dependencies: `node server.js`
// Serves index.html + src/ to every machine on the network and relays WebSocket messages:
//   guests --(inputs)--> host browser --(snapshots)--> guests
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const PUBLIC = [path.join(ROOT, 'index.html'), path.join(ROOT, 'src') + path.sep];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
const MAX_FRAME = 4 * 1024 * 1024;

const lanIPs = () => Object.values(os.networkInterfaces()).flat()
  .filter(i => i && (i.family === 'IPv4' || i.family === 4) && !i.internal).map(i => i.address);

// ---------- static files ----------
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/lan-info') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ port: PORT, ips: lanIPs(), host: !!host }));
  }
  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!PUBLIC.some(p => file === p || file.startsWith(p))) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
});

// ---------- minimal WebSocket (RFC 6455, text frames) ----------
function sendRaw(c, text) {
  if (!c.sock.writable) return;
  const p = Buffer.from(text);
  let head;
  if (p.length < 126) head = Buffer.from([0x81, p.length]);
  else if (p.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(p.length, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(p.length), 2); }
  c.sock.write(Buffer.concat([head, p]));
}
const send = (c, obj) => sendRaw(c, JSON.stringify(obj));

function readFrame(c) {
  const b = c.buf;
  if (b.length < 2) return null;
  const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
  let len = b[1] & 0x7f, off = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (b.length < 10) return null; const big = b.readBigUInt64BE(2); if (big > BigInt(MAX_FRAME)) return { op: 8 }; len = Number(big); off = 10; }
  const m = masked ? 4 : 0;
  if (b.length < off + m + len) return null;
  const payload = Buffer.from(b.subarray(off + m, off + m + len));
  if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= b[off + (i & 3)];
  c.buf = b.subarray(off + m + len);
  return { fin, op, payload };
}

let host = null, nextId = 1;
const guests = new Map();

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (req.url !== '/ws' || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  const c = { id: nextId++, sock, role: null, buf: Buffer.alloc(0), frag: [], fragLen: 0, addr: sock.remoteAddress };
  sock.on('data', d => {
    c.buf = c.buf.length ? Buffer.concat([c.buf, d]) : d;
    if (c.buf.length > MAX_FRAME + 16) { sock.destroy(); return; }
    let f;
    while ((f = readFrame(c))) {
      if (f.op === 8) { sock.end(); return; }
      if (f.op === 9) { if (sock.writable) sock.write(Buffer.concat([Buffer.from([0x8a, f.payload.length & 0x7f]), f.payload.subarray(0, 125)])); continue; }
      if (f.op !== 1 && f.op !== 0) continue;
      c.frag.push(f.payload); c.fragLen += f.payload.length;
      if (c.fragLen > MAX_FRAME) { sock.destroy(); return; }
      if (f.fin) { const msg = Buffer.concat(c.frag).toString('utf8'); c.frag = []; c.fragLen = 0; onMessage(c, msg); }
    }
  });
  sock.on('close', () => drop(c));
  sock.on('error', () => drop(c));
});

function onMessage(c, msg) {
  // host snapshots are relayed verbatim without parsing
  if (c === host && msg.startsWith('{"t":"snap"')) {
    for (const g of guests.values()) if (g.sock.writableLength < 1024 * 1024) sendRaw(g, msg);
    return;
  }
  let m; try { m = JSON.parse(msg); } catch (e) { return; }
  if (!m || typeof m !== 'object') return;
  if (m.t === 'hello' && !c.role) {
    if (m.role === 'host') {
      if (host) { send(c, { t: 'error', msg: 'Phòng đã có chủ. Hãy bấm “Vào phòng”.' }); return; }
      host = c; c.role = 'host';
      send(c, { t: 'welcome', id: c.id, role: 'host' });
      for (const g of guests.values()) { send(host, { t: 'join', id: g.id }); send(g, { t: 'hostup' }); }
      console.log(`[phòng] máy ${c.id} (${c.addr}) làm chủ phòng`);
    } else {
      c.role = 'guest'; guests.set(c.id, c);
      send(c, { t: 'welcome', id: c.id, role: 'guest', hostReady: !!host });
      if (host) send(host, { t: 'join', id: c.id });
      console.log(`[phòng] máy ${c.id} (${c.addr}) vào phòng`);
    }
    return;
  }
  if (c.role === 'guest' && host && m.t === 'in' && typeof m.slot === 'string' && m.slot.length < 16 && m.k && typeof m.k === 'object') {
    send(host, { t: 'in', from: c.id, slot: m.slot, k: m.k });
  }
}

function drop(c) {
  if (c.dropped) return;
  c.dropped = true;
  if (c === host) {
    host = null;
    for (const g of guests.values()) send(g, { t: 'hostgone' });
    console.log(`[phòng] chủ phòng (máy ${c.id}) đã thoát`);
  } else if (guests.delete(c.id)) {
    if (host) send(host, { t: 'leave', id: c.id });
    console.log(`[phòng] máy ${c.id} rời phòng`);
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  BÃO LỬA · máy chủ LAN đang chạy\n');
  console.log(`  Máy này:        http://localhost:${PORT}`);
  for (const ip of lanIPs()) console.log(`  Máy khác (LAN): http://${ip}:${PORT}`);
  console.log('\n  Một máy bấm "Tạo phòng", các máy còn lại bấm "Vào phòng". Ctrl+C để tắt.\n');
});
