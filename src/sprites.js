// sprites.js — procedural pixel art: heroes, enemies, bosses, tiles and parallax backdrops.
// Everything is drawn at 480x272 and scaled up with smoothing off, so plain rects read as pixels.
'use strict';
const W = 480, H = 272, T = 16, ROWS = 17;

let FLASH = false;                       // when true, every fill turns white (hit flash)
const C = c => (FLASH ? '#ffffff' : c);
function R(g, x, y, w, h, c) { g.fillStyle = C(c); g.fillRect(Math.round(x), Math.round(y), w, h); }
function E(g, x, y, rx, ry, c) { g.fillStyle = C(c); g.beginPath(); g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2); g.fill(); }
function Ln(g, x1, y1, x2, y2, w, c) { g.strokeStyle = C(c); g.lineWidth = w; g.lineCap = 'square'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
function P(g, pts, c) { g.fillStyle = C(c); g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill(); }
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
function grad(g, w, h, stops) { const gr = g.createLinearGradient(0, 0, 0, h); stops.forEach(([c, p]) => gr.addColorStop(p, c)); g.fillStyle = gr; g.fillRect(0, 0, w, h); }

// ---------- heroes ----------
const CHARS = [
  { id: 'rex', name: 'REX', title: 'Thiết Giáp', role: 'Lính hạng nặng',
    desc: 'Giáp dày, chịu được 2 phát bắn mỗi mạng.', speed: 1.9, hp: 2, dj: false, drone: false, stats: [3, 5, 2],
    pal: { main: '#d2483a', dark: '#7c2320', light: '#ff8a6a', visor: '#ffd23f', gun: '#cfd3e6' } },
  { id: 'linh', name: 'LINH', title: 'Phong Vân', role: 'Trinh sát',
    desc: 'Chạy nhanh nhất đội, nhảy được hai lần trên không.', speed: 2.35, hp: 1, dj: true, drone: false, stats: [5, 2, 3],
    pal: { main: '#2db5a3', dark: '#16605a', light: '#7ff0dc', visor: '#e9f7ff', scarf: '#ff4f86', gun: '#cfd3e6' } },
  { id: 'tobi', name: 'TOBI', title: 'Kỹ Sư', role: 'Kỹ sư chiến trường',
    desc: 'Đi kèm drone hỗ trợ tự bắn kẻ địch gần nhất.', speed: 2.05, hp: 1, dj: false, drone: true, stats: [4, 2, 5],
    pal: { main: '#e3a02f', dark: '#7a4e14', light: '#ffd88a', visor: '#69d2ff', gun: '#cfd3e6' } },
];

// o: { x (center), y (feet), facing, aimX, aimY, crouch, air, anim, flash, t }
function drawHero(g, ci, o) {
  const ch = CHARS[ci], c = ch.pal, id = ch.id, t = o.t;
  g.save();
  g.translate(Math.round(o.x), Math.round(o.y));
  if (o.facing < 0) g.scale(-1, 1);
  const ax = o.aimX * o.facing, ay = o.aimY, by = o.crouch ? 8 : 0, boot = '#1b1828';

  if (o.crouch) {
    R(g, -6, -5, 5, 5, c.dark); R(g, 1, -5, 6, 5, c.main); R(g, -7, -2, 5, 2, boot); R(g, 3, -2, 5, 2, boot);
  } else if (o.air) {
    R(g, -4, -11, 3, 6, c.dark); R(g, 1, -10, 3, 5, c.main); R(g, -5, -6, 4, 2, boot); R(g, 1, -6, 4, 2, boot);
  } else {
    const sw = [0, 2, 0, -2][Math.floor(o.anim / 5) % 4];
    R(g, -3 - sw, -8, 3, 7, c.dark); R(g, 1 + sw, -8, 3, 7, c.main);
    R(g, -4 - sw, -2, 4, 2, boot); R(g, 1 + sw, -2, 4, 2, boot);
  }

  if (id === 'linh') for (let i = 0; i < 6; i++) R(g, -5 - i * 2, -18 + by + Math.sin(t * 0.25 + i * 0.9) * 1.6 + i * 0.5, 2, 2, c.scarf);
  if (id === 'tobi') {
    R(g, -8, -17 + by, 4, 8, c.dark); R(g, -7, -16 + by, 2, 2, c.light);
    R(g, -7, -23 + by, 1, 6, '#a6abc4'); R(g, -7, -24 + by, 1, 1, t % 30 < 15 ? '#ff4f6a' : '#ffd23f');
  }

  // torso
  R(g, -4, -16 + by, 9, 8, c.main); R(g, -3, -15 + by, 3, 2, c.light);
  R(g, -4, -9 + by, 9, 1, c.dark); R(g, 0, -9 + by, 2, 1, '#ffd23f');
  // head
  R(g, -4, -23 + by, 8, 7, c.main); R(g, -3, -23 + by, 5, 1, c.light); R(g, -4, -17 + by, 8, 1, c.dark);
  if (id === 'tobi') {
    R(g, -4, -21 + by, 8, 1, '#5a3a12'); R(g, -1, -22 + by, 2, 3, c.visor); R(g, 2, -22 + by, 3, 3, c.visor); R(g, 3, -22 + by, 1, 1, '#ffffff');
  } else {
    R(g, 0, -21 + by, 4, 2, c.visor); R(g, 3, -21 + by, 1, 1, '#ffffff');
  }
  if (id === 'rex') { R(g, -6, -17 + by, 4, 4, c.dark); R(g, -6, -17 + by, 4, 1, c.light); R(g, -1, -25 + by, 3, 2, c.visor); R(g, -4, -24 + by, 8, 1, c.dark); }
  if (id === 'linh') R(g, -5, -22 + by, 2, 4, '#1b1828');

  // arm + rifle, rotated to the aim direction
  g.save();
  g.translate(1, -14 + by);
  g.rotate(Math.atan2(ay, ax));
  R(g, -1, -1, 5, 3, c.main); R(g, 3, -2, 9, 3, c.gun); R(g, 4, 0, 3, 2, '#5a5f7a'); R(g, 11, -2, 2, 2, '#8a8fa8');
  if (o.flash > 0) { R(g, 13, -3, 4, 5, '#fff6c2'); R(g, 16, -2, 2, 3, '#ffd23f'); }
  g.restore();
  g.restore();
}

function drawBuddyDrone(g, d, t) {
  const x = Math.round(d.x), y = Math.round(d.y);
  g.globalAlpha = 0.7; R(g, x - 6 + (t % 3), y - 5, 5, 1, '#ffe7b0'); R(g, x + 2 - (t % 3), y - 5, 5, 1, '#ffe7b0'); g.globalAlpha = 1;
  R(g, x - 4, y - 3, 8, 5, '#e3a02f'); R(g, x - 3, y - 3, 6, 1, '#ffd88a'); R(g, x - 1, y - 1, 2, 2, '#69d2ff');
  R(g, x - 5, y + 2, 10, 1, '#7a4e14');
}

// ---------- enemies ----------
function drawSoldier(g, e, t) {
  FLASH = e.flash > 0;
  g.save(); g.translate(Math.round(e.x + e.w / 2), Math.round(e.y + e.h)); if (e.face < 0) g.scale(-1, 1);
  const sw = e.vx ? [0, 2, 0, -2][Math.floor(e.anim / 6) % 4] : 0;
  R(g, -3 - sw, -7, 3, 7, '#3c445c'); R(g, 1 + sw, -7, 3, 7, '#56607e');
  R(g, -4, -15, 9, 8, '#6b7896'); R(g, -3, -14, 7, 2, '#8f9cbc'); R(g, -4, -8, 9, 1, '#2c3245');
  R(g, -3, -20, 7, 5, '#56607e'); R(g, -3, -21, 7, 1, '#8f9cbc'); R(g, 1, -19, 3, 2, '#ff3b4f'); R(g, -1, -23, 1, 2, '#8f9cbc');
  R(g, 0, -12, 10, 2, '#2c3245'); R(g, 8, -13, 2, 1, '#2c3245');
  if (e.muzzle > 0) R(g, 10, -13, 3, 3, '#ffb0b8');
  g.restore(); FLASH = false;
}

function drawTurret(g, e, t) {
  FLASH = e.flash > 0;
  const cx = e.x + e.w / 2, by = e.y + e.h;
  R(g, cx - 9, by - 5, 18, 5, '#3a3f52'); R(g, cx - 8, by - 6, 16, 1, '#7c849e');
  E(g, cx, by - 7, 7, 6, '#4f5670'); E(g, cx - 2, by - 9, 3, 2, '#8a93b0');
  g.save(); g.translate(cx, by - 8); g.rotate(e.ang);
  R(g, 2, -2, 10, 4, '#2a2e3d'); R(g, 10, -2, 2, 4, e.fireT < 20 ? '#ff3b4f' : '#5a6080');
  g.restore();
  R(g, cx - 1, by - 13, 2, 2, t % 40 < 20 ? '#ff3b4f' : '#6b1e2a');
  FLASH = false;
}

function drawDrone(g, e, t) {
  FLASH = e.flash > 0;
  const cx = e.x + 7, cy = e.y + 5;
  g.globalAlpha = 0.6; R(g, cx - 9 + (t % 4), cy - 8, 7, 1, '#d6dcf0'); R(g, cx + 2 - (t % 4), cy - 8, 7, 1, '#d6dcf0'); g.globalAlpha = 1;
  R(g, cx - 1, cy - 7, 2, 3, '#3a3f52');
  E(g, cx, cy, 7, 4, '#8d95b5'); E(g, cx, cy + 2, 6, 2, '#4a5068'); E(g, cx - 2, cy - 1, 3, 1, '#c9cfe6');
  R(g, cx - 1, cy, 3, 2, t % 20 < 10 ? '#ff3b4f' : '#ffd23f');
  FLASH = false;
}

function drawHopper(g, e, t) {
  FLASH = e.flash > 0;
  const cx = e.x + 7, by = e.y + e.h, air = !e.onGround;
  for (const i of [-5, 0, 5]) {
    if (air) { R(g, cx + i - 1, by - 3, 1, 4, '#2a1830'); }
    else { R(g, cx + i - 2, by - 5, 1, 2, '#2a1830'); R(g, cx + i - 1, by - 3, 1, 3, '#2a1830'); }
  }
  E(g, cx, by - 6, 7, 5, '#7a3fa0'); E(g, cx - 1, by - 8, 4, 2, '#b77ae0'); R(g, cx - 6, by - 4, 12, 1, '#4a2266');
  R(g, cx + 3 * e.face - 1, by - 8, 2, 2, '#ffd23f');
  FLASH = false;
}

function drawCapsule(g, e, t) {
  FLASH = e.flash > 0;
  const cx = e.x + 8, cy = e.y + 5, fl = Math.floor(t / 4) % 2;
  P(g, [cx - 4, cy, cx - 13, cy - 4 - fl * 2, cx - 11, cy + 2], '#9aa3c4');
  P(g, [cx + 4, cy, cx + 13, cy - 4 - fl * 2, cx + 11, cy + 2], '#9aa3c4');
  E(g, cx, cy, 6, 5, '#c9cfe6'); E(g, cx, cy + 1, 5, 3, '#7c849e'); E(g, cx, cy, 3, 3, t % 10 < 5 ? '#ff4f86' : '#ffd23f');
  FLASH = false;
}

const GLYPHS = {
  S: ['111', '100', '111', '001', '111'], L: ['100', '100', '100', '100', '111'],
  H: ['101', '101', '111', '101', '101'], R: ['110', '101', '110', '101', '101'],
};
function glyph(g, ch, x, y, c) { const m = GLYPHS[ch]; if (!m) return; for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (m[r][k] === '1') R(g, x + k, y + r, 1, 1, c); }

function drawPower(g, e, t) {
  if (e.life > 420 && Math.floor(t / 4) % 2) return;
  const cx = e.x + 6, cy = e.y + 5, f = Math.floor(t / 6) % 2;
  R(g, cx - 11, cy - 2 - f, 5, 2, '#ffd23f'); R(g, cx - 10, cy, 4, 2, '#ff8a3d');
  R(g, cx + 6, cy - 2 - f, 5, 2, '#ffd23f'); R(g, cx + 6, cy, 4, 2, '#ff8a3d');
  E(g, cx, cy, 6, 6, '#ffd23f'); E(g, cx, cy, 5, 5, '#2a1f4a');
  glyph(g, e.kind, cx - 1, cy - 2, '#ffffff');
}

// ---------- bosses ----------
function drawCrab(g, b, t) {
  FLASH = b.flash > 0;
  const cr = b.mode === 'crouch' ? 4 + (t % 4 < 2 ? 1 : 0) : 0, walk = b.vx ? t * 0.25 : 0, ph2 = b.hp < b.maxHp * 0.5;
  g.save(); g.translate(Math.round(b.x + b.w / 2), Math.round(b.y + b.h)); if (b.face > 0) g.scale(-1, 1);
  for (const s of [1, -1]) for (let i = 0; i < 3; i++) {
    const lift = b.mode === 'leap' ? 5 : Math.max(0, Math.sin(walk + i * 2.1 + (s > 0 ? Math.PI : 0))) * 4;
    const bx = s * (10 + i * 8), kx = s * (26 + i * 5), ky = -32 + i * 2 - lift + cr, fx = s * (30 + i * 6), fy = -lift;
    Ln(g, bx, -18 + cr, kx, ky, 3, '#4a1e2a'); Ln(g, kx, ky, fx, fy - 1, 2, '#6a2a34'); R(g, fx - 1, fy - 2, 3, 2, '#2a1018');
  }
  R(g, -6, -46 + cr, 18, 7, '#3a3448'); R(g, -20, -48 + cr, 16, 4, '#2a2636'); R(g, -22, -48 + cr, 2, 4, b.shootT < 12 ? '#ffd23f' : '#5a5470');
  E(g, 0, -26 + cr, 34, 15, '#b73a2c'); E(g, 0, -30 + cr, 30, 10, '#d9533a'); E(g, -6, -35 + cr, 18, 4, '#ff8a5c');
  R(g, -26, -16 + cr, 52, 4, '#6a1c22');
  for (let k = 0; k < 5; k++) R(g, -22 + k * 11, -27 + cr, 1, 8, '#8e2a24');
  Ln(g, -12, -38 + cr, -14, -48 + cr, 2, '#4a1e2a'); Ln(g, -4, -40 + cr, -4, -50 + cr, 2, '#4a1e2a');
  const eye = ph2 ? '#ff3b4f' : '#ffd23f';
  E(g, -14, -49 + cr, 3, 3, eye); E(g, -4, -51 + cr, 3, 3, eye);
  const open = b.mode === 'crouch' ? 4 : (Math.sin(t * 0.12) + 1) * 1.5;
  Ln(g, -26, -22 + cr, -36, -20 + cr, 4, '#8e2a24');
  E(g, -45, -23 + cr - open, 10, 5, '#d9533a'); E(g, -47, -25 + cr - open, 5, 2, '#ff8a5c'); E(g, -44, -14 + cr, 8, 4, '#b73a2c');
  Ln(g, -24, -12 + cr, -32, -8 + cr, 3, '#8e2a24'); E(g, -36, -7 + cr, 6, 3, '#b73a2c');
  g.restore(); FLASH = false;
}

function drawCore(g, b, t, px, py) {
  const oy = Math.round(b.rise), x = b.x, y = b.y + oy, w = b.w, h = b.h, cx = b.cx, cy = b.cy + oy, ph2 = b.hp < b.maxHp * 0.4;
  // chimney + flame
  R(g, x + w - 38, y - 4, 26, 4, '#3e3346'); R(g, x + w - 36, y, 22, 24, '#231c28');
  for (let i = 0; i < 6; i++) { const fh = 4 + ((t * 3 + i * 7) % 9); R(g, x + w - 34 + i * 3, y - 4 - fh, 3, fh, i % 2 ? '#ff8a3d' : '#ffd23f'); }
  // hull
  R(g, x, y + 20, w, h - 20, '#2a2230'); R(g, x + 4, y + 24, w - 8, 3, '#3e3346'); R(g, x, y + 20, 3, h - 20, '#3e3346');
  for (let yy = y + 34; yy < y + h - 4; yy += 16) { R(g, x + 5, yy, 2, 2, '#5a4b5e'); R(g, x + w - 7, yy, 2, 2, '#5a4b5e'); }
  const pulse = (Math.sin(t * 0.1) + 1) / 2;
  for (let k = 0; k < 6; k++) { g.globalAlpha = 0.5 + pulse * 0.5; R(g, x + 12, y + 132 + k * 6, 18, 2, k % 2 ? '#ff5a1f' : '#b8360f'); R(g, x + w - 30, y + 132 + k * 6, 18, 2, k % 2 ? '#ff5a1f' : '#b8360f'); }
  g.globalAlpha = 1;
  // chamber
  FLASH = b.flash > 0;
  E(g, cx, cy, 30, 30, '#1a141e'); E(g, cx, cy, 27, 27, '#4a3b4e');
  if (b.openAmt > 0) {
    E(g, cx, cy, 20, 20, ph2 ? '#ff2a4a' : '#ff5a1f'); E(g, cx, cy, 14, 14, '#ffb43d'); E(g, cx, cy, 7 + pulse * 3, 7 + pulse * 3, '#fff3c4');
  }
  FLASH = false;
  const o = b.openAmt * 22;
  g.save(); g.beginPath(); g.arc(cx, cy, 25, 0, Math.PI * 2); g.clip();
  for (const s of [-1, 1]) {
    const px0 = s < 0 ? cx - 25 - o : cx + o;
    R(g, px0, cy - 25, 25, 50, '#5a4b5e');
    for (let k = 0; k < 6; k++) R(g, px0 + (s < 0 ? 19 : 0), cy - 24 + k * 8, 6, 4, k % 2 ? '#ffd23f' : '#2a2230');
  }
  g.restore();
  // side turrets
  for (const tr of b.turrets) {
    const ty = tr.y + oy;
    if (!tr.alive) { R(g, tr.x - 6, ty - 5, 12, 10, '#1a141e'); if (t % 8 < 4) R(g, tr.x - 2, ty - 9, 3, 3, '#3a2a30'); continue; }
    FLASH = tr.flash > 0;
    E(g, tr.x, ty, 10, 9, '#3e3346'); E(g, tr.x - 2, ty - 3, 5, 3, '#6a5a70');
    g.save(); g.translate(tr.x, ty); g.rotate(tr.ang); R(g, 4, -2, 12, 4, '#1a141e'); R(g, 14, -2, 2, 4, tr.fireT < 15 ? '#ffd23f' : '#5a4b5e'); g.restore();
    R(g, tr.x - 1, ty - 1, 3, 3, '#ff3b4f');
    FLASH = false;
  }
}

function drawSerpent(g, b, t) {
  for (let i = b.segs.length - 1; i >= 0; i--) {
    const s = b.segs[i], last = i === b.segs.length - 1, r = last ? 6 : 10 - i * 0.35;
    if (last) { P(g, [s.x, s.y, s.x + 14, s.y - 10, s.x + 9, s.y, s.x + 14, s.y + 10], '#f2c45a'); }
    R(g, s.x - 1, s.y - r - 5, 3, 5, '#f2c45a');
    E(g, s.x, s.y, r, r, i % 2 ? '#237a6c' : '#2fa58f'); E(g, s.x - 2, s.y - 3, r * 0.5, r * 0.35, '#7fe0c8'); E(g, s.x, s.y + r * 0.55, r * 0.7, r * 0.3, '#f2c45a');
  }
  FLASH = b.flash > 0;
  g.save(); g.translate(Math.round(b.hx), Math.round(b.hy)); if (b.face > 0) g.scale(-1, 1);
  const jaw = b.jaw;
  for (let k = 0; k < 5; k++) R(g, 6 + k * 3, -9 + Math.sin(t * 0.3 + k) * 1.5, 2, 9, '#ff4f86');
  E(g, 0, 0, 16, 11, '#2fa58f'); E(g, -2, -5, 10, 4, '#7fe0c8');
  R(g, -27, -3, 15, 7, '#2fa58f'); R(g, -27, -3, 15, 2, '#7fe0c8');
  R(g, -25, 4 + jaw, 13, 4, '#237a6c'); for (let k = 0; k < 4; k++) R(g, -25 + k * 3, 3 + (jaw ? 0 : 0), 1, 2, '#ffffff');
  if (jaw > 0) R(g, -24, 4, 11, jaw, '#ff5a1f');
  Ln(g, 4, -8, 14, -19, 3, '#f2c45a'); Ln(g, -3, -9, 3, -21, 2, '#f2c45a');
  E(g, -8, -3, 3, 2, b.hp < b.maxHp * 0.5 ? '#ff3b4f' : '#ffd23f'); R(g, -9, -4, 1, 2, '#1b1828');
  Ln(g, -26, 2, -36, 6 + Math.sin(t * 0.2) * 2, 1, '#f2c45a');
  g.restore(); FLASH = false;
}

// ---------- tiles ----------
function buildTiles(theme) {
  const mk = f => { const c = makeCanvas(T, T); f(c.getContext('2d')); return c; };
  if (theme === 'harbor') return {
    edge: '#141a30',
    top: mk(a => { R(a, 0, 0, 16, 16, '#283150'); R(a, 0, 0, 16, 2, '#93b3ee'); R(a, 0, 2, 16, 2, '#4a5a88'); for (let i = 0; i < 16; i += 4) R(a, i, 4, 2, 1, '#ffd23f'); R(a, 0, 15, 16, 1, '#1a2038'); R(a, 7, 5, 1, 11, '#1f2742'); [[1, 7], [14, 7], [1, 13], [14, 13]].forEach(([x, y]) => R(a, x, y, 1, 1, '#4a5a88')); }),
    inner: mk(a => { R(a, 0, 0, 16, 16, '#1e2540'); R(a, 0, 15, 16, 1, '#151a2e'); R(a, 7, 0, 1, 16, '#181e35'); for (let i = 0; i < 16; i++) R(a, i, i, 1, 1, '#262f50'); }),
    plat: mk(a => { R(a, 0, 0, 16, 5, '#8a5a32'); R(a, 0, 0, 16, 1, '#d39a5c'); R(a, 0, 4, 16, 1, '#4a2e18'); R(a, 5, 1, 1, 3, '#5e3b20'); R(a, 11, 1, 1, 3, '#5e3b20'); R(a, 2, 5, 2, 3, '#3a2414'); R(a, 12, 5, 2, 3, '#3a2414'); }),
  };
  if (theme === 'forge') return {
    edge: '#170d0d',
    top: mk(a => { R(a, 0, 0, 16, 16, '#3a2626'); R(a, 0, 0, 16, 1, '#ff9a4a'); R(a, 0, 1, 16, 1, '#c2401a'); R(a, 0, 2, 16, 2, '#4e3030'); R(a, 3, 5, 1, 4, '#ff5a1f'); R(a, 4, 8, 3, 1, '#ff5a1f'); R(a, 11, 6, 1, 6, '#a8350f'); R(a, 9, 11, 2, 1, '#a8350f'); R(a, 0, 15, 16, 1, '#241616'); }),
    inner: mk(a => { R(a, 0, 0, 16, 16, '#2a1a1a'); R(a, 2, 3, 1, 5, '#4a1a10'); R(a, 9, 9, 4, 1, '#4a1a10'); R(a, 12, 2, 1, 3, '#3a1a14'); R(a, 0, 15, 16, 1, '#1e1212'); }),
    plat: mk(a => { R(a, 0, 0, 16, 4, '#4a4652'); R(a, 0, 0, 16, 1, '#8f8a9c'); for (let i = 1; i < 16; i += 3) R(a, i, 1, 1, 2, '#1a1418'); R(a, 1, 4, 2, 4, '#2e2a34'); R(a, 13, 4, 2, 4, '#2e2a34'); }),
  };
  return {
    edge: '#1d4a46',
    top: mk(a => { R(a, 0, 0, 16, 16, '#3f8f86'); R(a, 0, 0, 16, 2, '#f2c45a'); R(a, 0, 2, 16, 1, '#b8862e'); R(a, 2, 6, 5, 1, '#6cc9b8'); R(a, 6, 7, 1, 3, '#6cc9b8'); R(a, 10, 11, 4, 1, '#6cc9b8'); R(a, 0, 15, 16, 1, '#2c6a64'); }),
    inner: mk(a => { R(a, 0, 0, 16, 16, '#2c6a64'); R(a, 3, 4, 4, 1, '#3f8f86'); R(a, 9, 10, 1, 4, '#3f8f86'); R(a, 0, 15, 16, 1, '#245a55'); }),
    plat: mk(a => { R(a, 0, 0, 16, 5, '#b83a3a'); R(a, 0, 0, 16, 1, '#f2c45a'); R(a, 0, 4, 16, 1, '#7a2020'); R(a, 7, 1, 2, 3, '#f2c45a'); R(a, 1, 5, 2, 3, '#5a1818'); R(a, 13, 5, 2, 3, '#5a1818'); }),
  };
}

// ---------- parallax backdrops ----------
function buildBackdrop(theme) {
  const r = rng(theme === 'harbor' ? 11 : theme === 'forge' ? 23 : 37);
  const L0 = makeCanvas(W, H), a = L0.getContext('2d');
  const mk = () => { const c = makeCanvas(960, H); return [c, c.getContext('2d')]; };
  const [L1, b] = mk(), [L2, c] = mk(), [L3, d] = mk();
  let front = null;

  if (theme === 'harbor') {
    grad(a, W, H, [['#08071f', 0], ['#1f1548', 0.55], ['#4a1d5e', 0.85], ['#6b2a5e', 1]]);
    for (let i = 0; i < 90; i++) R(a, r() * W, r() * H * 0.55, 1, 1, r() < 0.2 ? '#ffe9ff' : '#6f66a9');
    a.globalAlpha = 0.15; E(a, 372, 58, 36, 36, '#ff9ed2'); a.globalAlpha = 1;
    E(a, 372, 58, 22, 22, '#ffd9ec'); E(a, 365, 51, 5, 4, '#f2b8d6'); E(a, 380, 66, 4, 3, '#f2b8d6'); E(a, 377, 47, 2, 2, '#f2b8d6');
    for (let x = 0; x < 960;) {
      const w = 18 + (r() * 34 | 0), h = 50 + (r() * 110 | 0), top = H - 60 - h;
      R(b, x, top, w, h + 60, '#1b1442');
      if (r() < 0.3) { R(b, x + (w >> 1) - 1, top - 14, 2, 14, '#1b1442'); R(b, x + (w >> 1) - 1, top - 15, 2, 1, '#ff4f86'); }
      for (let wy = top + 4; wy < H - 40; wy += 6) for (let wx = x + 3; wx < x + w - 3; wx += 5) if (r() < 0.18) R(b, wx, wy, 2, 2, '#3a2f74');
      x += w + (r() * 4 | 0);
    }
    for (let x = 0; x < 960;) {
      const w = 30 + (r() * 40 | 0), h = 40 + (r() * 80 | 0), top = H - 50 - h;
      R(c, x, top, w, h + 50, '#120d2c'); R(c, x, top, w, 2, '#241b4f');
      for (let wy = top + 5; wy < H - 40; wy += 7) for (let wx = x + 4; wx < x + w - 4; wx += 6) if (r() < 0.3) R(c, wx, wy, 3, 3, pick(r, ['#ffcf6a', '#6ad8ff', '#ff6aa8', '#2a2255', '#2a2255']));
      if (r() < 0.5) {
        const sc = pick(r, ['#ff3d8b', '#38e0ff', '#ffd23f']), sw = 10 + (r() * 14 | 0), sx = x + 4 + (r() * Math.max(1, w - sw - 8) | 0), sy = top + 8 + (r() * 20 | 0);
        c.globalAlpha = 0.25; R(c, sx - 3, sy - 3, sw + 6, 10, sc); c.globalAlpha = 1; R(c, sx, sy, sw, 4, sc);
      }
      x += w + 4 + (r() * 10 | 0);
    }
    for (let k = 0; k < 3; k++) {
      const cx = 80 + k * 320 + (r() * 60 | 0);
      R(d, cx, 90, 6, 140, '#0a0818'); R(d, cx - 50, 90, 130, 6, '#0a0818'); R(d, cx + 60, 96, 1, 40, '#0a0818'); R(d, cx + 56, 136, 9, 6, '#0a0818');
      for (let y = 96; y < 230; y += 10) R(d, cx + 1, y, 4, 1, '#1c1636');
      R(d, cx + 2, 86, 2, 2, '#ff3b4f');
    }
    for (let x = 0; x < 960; x += 34 + (r() * 24 | 0)) {
      const n = 1 + (r() * 3 | 0);
      for (let s = 0; s < n; s++) { R(d, x, 198 - s * 12, 30, 12, pick(r, ['#1d2a3d', '#2e1a2e', '#1a2e2a'])); R(d, x, 198 - s * 12, 30, 1, '#33405a'); }
    }
  } else if (theme === 'forge') {
    grad(a, W, H, [['#120404', 0], ['#3a0c08', 0.5], ['#8a2410', 0.85], ['#d9541c', 1]]);
    a.globalAlpha = 0.3; E(a, 120, 150, 72, 72, '#ff7a2a'); a.globalAlpha = 1; E(a, 120, 150, 34, 34, '#ffb35a');
    for (let i = 0; i < 70; i++) R(a, r() * W, r() * H * 0.7, 1, 1, '#5a1c12');
    for (let k = 0; k < 4; k++) {
      const px = 60 + k * 240 + (r() * 60 | 0), hw = 110 + (r() * 60 | 0), py = 70 + (r() * 40 | 0);
      P(b, [px - hw, H, px - 14, py, px + 14, py, px + hw, H], '#2a0a08');
      let lx = px, ly = py + 2;
      for (let s = 0; s < 14; s++) { const nx = lx + (r() - 0.5) * 10, ny = ly + 10; Ln(b, lx, ly, nx, ny, 2, '#ff5a1f'); lx = nx; ly = ny; }
      R(b, px - 12, py - 2, 24, 3, '#ff8a3d');
    }
    for (let x = 0; x < 960;) {
      const w = 26 + (r() * 30 | 0), h = 50 + (r() * 70 | 0), top = H - 50 - h;
      R(c, x, top, w, h + 50, '#1a0605');
      if (r() < 0.6) { const chx = x + 4 + (r() * (w - 12) | 0); R(c, chx, top - 30, 8, 30, '#1a0605'); c.globalAlpha = 0.5; E(c, chx + 4, top - 38, 8, 6, '#3a1a18'); E(c, chx + 8, top - 48, 10, 7, '#3a1a18'); c.globalAlpha = 1; }
      for (let wy = top + 8; wy < H - 40; wy += 12) if (r() < 0.6) R(c, x + 5, wy, w - 10, 2, r() < 0.5 ? '#ff7a2a' : '#7a2410');
      x += w + 10 + (r() * 30 | 0);
    }
    R(d, 0, 150, 960, 6, '#120404'); R(d, 0, 150, 960, 1, '#3a1612');
    for (let x = 0; x < 960; x += 40) { R(d, x, 148, 4, 10, '#200808'); if (r() < 0.4) for (let y = 0; y < 150; y += 4) R(d, x + 20, y, 2, 3, '#160606'); }
  } else {
    grad(a, W, H, [['#24195a', 0], ['#7a3a8f', 0.45], ['#e2708f', 0.75], ['#ffc07a', 1]]);
    a.globalAlpha = 0.25; E(a, 240, 196, 64, 64, '#ffe3a1'); a.globalAlpha = 1; E(a, 240, 196, 36, 36, '#fff0c8');
    for (let i = 0; i < 40; i++) R(a, r() * W, r() * 70, 1, 1, '#c9b8ff');
    for (let k = 0; k < 5; k++) {
      const ix = 40 + k * 190 + (r() * 60 | 0), iy = 110 + (r() * 50 | 0), iw = 30 + (r() * 30 | 0);
      P(b, [ix - iw, iy, ix + iw, iy, ix + 6, iy + 34, ix - 4, iy + 40], '#6a3f7a');
      for (let tier = 0; tier < 3; tier++) { const tw = 16 - tier * 4, ty = iy - 8 - tier * 9; R(b, ix - tw / 2, ty + 3, tw, 6, '#5a3370'); P(b, [ix - tw / 2 - 5, ty + 3, ix + tw / 2 + 5, ty + 3, ix, ty - 3], '#4a2862'); }
    }
    for (let k = 0; k < 9; k++) {
      const cx = k * 110 + (r() * 40 | 0), cy = 150 + (r() * 60 | 0);
      for (let p = 0; p < 6; p++) E(c, cx + p * 12 - 30, cy - Math.sin(p / 5 * Math.PI) * 10, 16, 10, '#f7d4e4');
      E(c, cx, cy + 6, 40, 5, '#e2a5c4');
    }
    for (let k = 0; k < 5; k++) {
      const rx = k * 200 + (r() * 80 | 0), ry = 60 + (r() * 80 | 0), rw = 14 + (r() * 10 | 0);
      P(d, [rx - rw, ry, rx + rw, ry, rx + 3, ry + 22], '#3d2552'); R(d, rx - rw, ry - 2, rw * 2, 3, '#5b8f6e');
    }
    front = makeCanvas(W, 48); const f = front.getContext('2d');
    for (let x = -10; x < W + 20; x += 22) { E(f, x, 22 + (x * 7 % 9), 20, 12, '#f0bdd4'); }
    for (let x = 0; x < W + 20; x += 26) { E(f, x, 30 + (x * 5 % 7), 18, 12, '#fbe1ec'); }
    R(f, 0, 34, W, 14, '#fbe1ec');
  }
  return { L0, layers: [[L1, 0.1], [L2, 0.25], [L3, 0.5]], front };
}
