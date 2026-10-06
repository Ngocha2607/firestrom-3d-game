// game.js — Bão Lửa simulation: loop, input (2 keyboard halves, gamepads, touch), 1–4 player co-op,
// enemies, bosses, the shared "Bão Lửa" storm super, LAN. Drawing lives in world3d.js and ui.js.
(() => {
  'use strict';
  const GRAV = 0.27, JUMP = -5.7, HAZARD_Y = 246, STEP = 1000 / 60, REVIVE = 100;
  const INK = '#f3ecff', DIM = '#a39cc0', EMBER = '#ff6a3d', VOLT = '#ffd23f', JADE = '#38d6b4', BLOOD = '#ff3b4f';
  const WEAPON_NAME = { P: 'XUNG KÍCH', S: 'ĐẠN TỎA', L: 'LASER', H: 'TÊN LỬA' };
  const SCORE = { soldier: 100, turret: 300, drone: 150, hopper: 200, capsule: 50 };
  const SLOT_NAME = { kb: 'BÀN PHÍM', kbA: 'BÀN PHÍM TRÁI', kbB: 'BÀN PHÍM PHẢI', touch: 'CẢM ỨNG', pad0: 'TAY CẦM 1', pad1: 'TAY CẦM 2', pad2: 'TAY CẦM 3', pad3: 'TAY CẦM 4' };
  const slotName = s => { const m = /^n(\d+):(.+)$/.exec(s); return m ? 'MÁY ' + m[1] + ' · ' + (SLOT_NAME[m[2]] || m[2]) : (SLOT_NAME[s] || s); };

  // LAN: the host browser simulates; guests forward inputs and draw the host's snapshots.
  // Sound effects are recorded on the host and replayed on guests.
  let netRole = null, netWs = null, netStatus = 'off', netError = '', netGuests = 0, netInfo = null, hostTick = 0;
  let curMusic = 'title', guestMusic = null;
  const sfxQueue = [], netSent = {};
  const origMusic = SFX.music;
  SFX.music = name => { curMusic = name; if (netRole !== 'guest') origMusic(name); };
  for (const n of ['shoot', 'spread', 'laser', 'missile', 'jump', 'dash', 'hit', 'ting', 'boom', 'bigBoom', 'power', 'hurt', 'select', 'warn', 'eshot']) {
    const f = SFX[n]; SFX['_' + n] = f;
    SFX[n] = () => { if (netRole === 'host' && sfxQueue.length < 40) sfxQueue.push(n); f(); };
  }

  const view = document.getElementById('screen');
  VIEW3D.init(view);

  // ---------- input: every device is a "slot" with its own held (k) and just-pressed (p) state ----------
  const inputs = {};
  const inp = id => inputs[id] || (inputs[id] = { k: {}, p: {} });
  function setIn(id, k, v) { const s = inp(id); if (v && !s.k[k]) s.p[k] = true; s.k[k] = v; }
  // Default: the whole keyboard drives ONE player (each person plays on their own machine / keyboard).
  // Browsers cannot tell several keyboards on one computer apart, so extra local players use gamepads,
  // or the optional split mode (Tab on the select screen) that shares one keyboard between two people.
  const KB_SOLO = {
    kb: { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
      KeyJ: 'fire', KeyZ: 'fire', KeyK: 'jump', KeyX: 'jump', Space: 'jump', KeyL: 'dash', KeyC: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash',
      KeyI: 'super', KeyV: 'super', Enter: 'start', NumpadEnter: 'start' },
  };
  const KB_SPLIT = {
    kbA: { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyF: 'fire', KeyG: 'jump', Space: 'jump', KeyH: 'dash', KeyR: 'super' },
    kbB: { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Comma: 'fire', Period: 'jump', Slash: 'dash', KeyL: 'super',
      Numpad1: 'fire', Numpad2: 'jump', Numpad3: 'dash', Numpad0: 'super', Enter: 'start', NumpadEnter: 'start' },
  };
  const KB_SYS = { sys: { Enter: 'start', NumpadEnter: 'start', Escape: 'back', KeyP: 'pause', KeyM: 'mute', KeyQ: 'quality', Tab: 'split' } };
  let splitKb = false;
  const startSlot = () => (splitKb ? 'kbB' : 'kb');
  function onKey(e, down) {
    let hit = false;
    for (const maps of [splitKb ? KB_SPLIT : KB_SOLO, KB_SYS]) for (const id in maps) { const a = maps[id][e.code]; if (a) { setIn(id, a, down); hit = true; } }
    if (hit) { e.preventDefault(); if (down) SFX.init(); }
  }
  function setSplit(on) {
    if (on === splitKb) return;
    splitKb = on;
    for (const id of ['kb', 'kbA', 'kbB']) { if (inputs[id]) inputs[id].k = {}; }
    lobby = lobby.filter(l => !['kb', 'kbA', 'kbB'].includes(l.slot));
    SFX.select();
  }
  addEventListener('keydown', e => onKey(e, true));
  addEventListener('keyup', e => onKey(e, false));
  addEventListener('blur', () => { for (const id in inputs) inputs[id].k = {}; if (state === 'play' && !netRole) paused = true; });

  function pollPads() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < Math.min(4, pads.length); i++) {
      const gp = pads[i]; if (!gp) continue;
      const id = 'pad' + i, b = n => !!(gp.buttons[n] && gp.buttons[n].pressed), ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      setIn(id, 'left', b(14) || ax < -0.4); setIn(id, 'right', b(15) || ax > 0.4);
      setIn(id, 'up', b(12) || ay < -0.5); setIn(id, 'down', b(13) || ay > 0.5);
      setIn(id, 'jump', b(0)); setIn(id, 'fire', b(2) || b(5) || b(7)); setIn(id, 'dash', b(1) || b(4) || b(6));
      setIn(id, 'super', b(3)); setIn(id, 'start', b(9));
    }
  }
  const playerSlots = () => Object.keys(inputs).filter(id => id !== 'sys');
  const anyPressed = (...ks) => Object.keys(inputs).some(id => ks.some(k => inputs[id].p[k]));
  const isTouch = matchMedia('(pointer: coarse)').matches;

  (function bindTouch() {
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    let sid = null;
    function move(e) {
      const r = stick.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy), on = d > r.width * 0.14, a = Math.atan2(dy, dx), cx = Math.cos(a), cy = Math.sin(a);
      setIn('touch', 'left', on && cx < -0.38); setIn('touch', 'right', on && cx > 0.38);
      setIn('touch', 'up', on && cy < -0.38); setIn('touch', 'down', on && cy > 0.38);
      const m = Math.min(d, r.width * 0.32); knob.style.transform = `translate(${cx * m}px, ${cy * m}px)`;
    }
    const end = e => { if (e.pointerId !== sid) return; sid = null; ['left', 'right', 'up', 'down'].forEach(k => setIn('touch', k, false)); knob.style.transform = ''; };
    stick.addEventListener('pointerdown', e => { e.preventDefault(); SFX.init(); sid = e.pointerId; stick.setPointerCapture(sid); move(e); });
    stick.addEventListener('pointermove', e => { if (e.pointerId === sid) move(e); });
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    document.querySelectorAll('[data-k],[data-sys]').forEach(b => {
      const id = b.dataset.sys ? 'sys' : 'touch', k = b.dataset.sys || b.dataset.k;
      b.addEventListener('pointerdown', e => { e.preventDefault(); SFX.init(); b.setPointerCapture(e.pointerId); setIn(id, k, true); b.classList.add('on'); });
      const up = () => { setIn(id, k, false); b.classList.remove('on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    });
  })();

  function tap(card, touchy) {
    SFX.init();
    if (netRole === 'guest') { netSend({ t: 'in', slot: 'touch', k: { fire: true } }); netSend({ t: 'in', slot: 'touch', k: { fire: false } }); return; }
    touchy = touchy || isTouch;
    if (state === 'select') {
      const own = lobby.findIndex(l => l.slot === 'touch');
      if (touchy && own < 0) lobbyJoin('touch');
      else if (own >= 0 && card === own) { lobby[own].ready = !lobby[own].ready; SFX.select(); }
      else if (!touchy && lobby.length === 0) lobbyJoin(startSlot());
    } else if (state === 'play') { if (paused) paused = false; }
    else inp('sys').p.start = true;
  }

  // ---------- run state ----------
  let state = 'title', stateT = 0, paused = false, frame = 0, titleX = 0, lobby = [], lobbyT = 0;
  let G = null, Lv = null, hiscore = 0;
  try { hiscore = +localStorage.getItem('baolua_hi') || 0; } catch (e) { }
  const teamScore = () => (G ? G.players.reduce((s, p) => s + p.score, 0) : 0);
  const saveHi = () => { const s = teamScore(); if (s > hiscore) { hiscore = s; try { localStorage.setItem('baolua_hi', String(s)); } catch (e) { } } };

  function makeRecord(slot, ci, num) { return { slot, ci, num, lives: 3, score: 0, weapon: 'P', rapid: false, nextLife: 20000 }; }
  function newRun(entries) { G = { players: entries.map((l, i) => makeRecord(l.slot, l.ci, i)), stage: 0, storm: 0 }; }
  function freeChar(used) { const c = [0, 1, 2].find(i => !used.includes(i)); return c === undefined ? used.length % 3 : c; }

  function lobbyJoin(slot) {
    if (lobby.length >= 4 || lobby.some(l => l.slot === slot)) return;
    lobby.push({ slot, ci: freeChar(lobby.map(l => l.ci)), ready: false }); SFX.select();
  }

  function buildLevel(i) {
    const d = LEVELS[i], cols = d.cols, map = [];
    for (let r = 0; r < ROWS; r++) map.push(new Uint8Array(cols));
    for (const [a, b, row] of d.ground) for (let c = a; c < b; c++) for (let r = row; r < ROWS; r++) map[r][c] = 1;
    for (const [c0, row, len] of d.plats) for (let c = c0; c < c0 + len; c++) if (!map[row][c]) map[row][c] = 2;
    const spawns = [
      ...d.enemies.map(([kind, col, row]) => ({ kind, col, row })),
      ...d.capsules.map(([col, weapon]) => ({ kind: 'capsule', col, weapon })),
    ].sort((a, b) => a.col - b.col);
    const last = d.ground[d.ground.length - 1];
    return {
      i, d, cols, map, theme: d.theme,
      camX: 0, arenaX: (cols - 30) * T, groundY: last[2] * T,
      spawns, spawnIdx: 0, enemies: [], pB: [], eB: [], parts: [], amb: [], items: [], texts: [], rings: [], trail: [], bolts: [],
      boss: null, bossState: 'none', warnT: 0, soldierT: 200, shake: 0, introT: 170, t: 0, players: [], endT: 0, stormT: 0, flashT: 0,
    };
  }

  function startStage(i) {
    G.stage = i;
    Lv = buildLevel(i);
    Lv.players = G.players.map((pr, k) => newPlayer(pr, 40 + k * 20, 60));
    state = 'play'; stateT = 0; paused = false;
    SFX.music(LEVELS[i].music);
  }

  function newPlayer(pr, x, y) {
    return { pr, slot: pr.slot, ci: pr.ci, x, y, w: 10, h: 22, vx: 0, vy: 0, facing: 1, aimX: 1, aimY: 0, onGround: false, crouch: false,
      coyote: 0, jumpBuf: 0, jumps: 0, dropT: 0, fireCd: 0, flash: 0, dashT: 0, dashCd: 0, invuln: 150, hp: CHARS[pr.ci].hp,
      anim: 0, dead: false, deadT: 0, ghost: false, gx: 0, gy: 0, reviveT: 0,
      drone: CHARS[pr.ci].drone ? { x, y, fireT: 40 } : null };
  }

  function joinMidgame(slot) {
    if (G.players.length >= 4) return;
    const pr = makeRecord(slot, freeChar(G.players.map(p => p.ci)), G.players.length);
    G.players.push(pr);
    const p = newPlayer(pr, spawnX(), 10);
    Lv.players.push(p);
    floatText(p.x + 5, 60, 'P' + (pr.num + 1) + ' THAM GIA', PCOL[pr.num]); SFX.power();
  }

  // ---------- tiles & physics ----------
  function tileAt(c, r) { if (r < 0 || r >= ROWS) return 0; if (c < 0 || c >= Lv.cols) return 1; return Lv.map[r][c]; }
  function solidTop(c) { for (let r = 0; r < ROWS; r++) if (tileAt(c, r) === 1) return r; return -1; }
  function hitSolid(x, y, w, h) {
    const c0 = Math.floor(x / T), c1 = Math.floor((x + w - 1) / T), r0 = Math.floor(y / T), r1 = Math.floor((y + h - 1) / T);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (tileAt(c, r) === 1) return true;
    return false;
  }
  function physics(e, drop) {
    e.hitWall = false;
    if (e.vx) {
      e.x += e.vx;
      if (hitSolid(e.x, e.y, e.w, e.h)) {
        e.x = e.vx > 0 ? Math.floor((e.x + e.w - 1) / T) * T - e.w : (Math.floor(e.x / T) + 1) * T;
        e.hitWall = true;
      }
    }
    const prevB = e.y + e.h;
    e.y += e.vy; e.onGround = false;
    if (hitSolid(e.x, e.y, e.w, e.h)) {
      if (e.vy > 0) { e.y = Math.floor((e.y + e.h - 1) / T) * T - e.h; e.onGround = true; }
      else if (e.vy < 0) e.y = (Math.floor(e.y / T) + 1) * T;
      e.vy = 0;
    } else if (e.vy > 0 && !drop) {
      const r = Math.floor((e.y + e.h - 1) / T), top = r * T;
      if (prevB <= top + 0.01) {
        for (let c = Math.floor(e.x / T); c <= Math.floor((e.x + e.w - 1) / T); c++) {
          if (tileAt(c, r) === 2) { e.y = top - e.h; e.vy = 0; e.onGround = true; break; }
        }
      }
    }
    // ground snap: gravity moves a standing body less than a pixel into the gap above the tile,
    // which the overlap test above cannot see — so glue it to a floor that is within 1px below
    if (!e.onGround && e.vy >= 0) {
      const bottom = e.y + e.h, r = Math.round(bottom / T), top = r * T;
      if (Math.abs(bottom - top) <= 1 && prevB <= top + 1) {
        for (let c = Math.floor(e.x / T); c <= Math.floor((e.x + e.w - 1) / T); c++) {
          const v = tileAt(c, r);
          if (v === 1 || (v === 2 && !drop)) { e.y = top - e.h; e.vy = 0; e.onGround = true; break; }
        }
      }
    }
  }
  function onOneWay(p) {
    const r = Math.floor((p.y + p.h) / T);
    let plat = false;
    for (let c = Math.floor(p.x / T); c <= Math.floor((p.x + p.w - 1) / T); c++) { const v = tileAt(c, r); if (v === 1) return false; if (v === 2) plat = true; }
    return plat;
  }
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const onScreen = (e, m = 0) => e.x + (e.w || 0) > Lv.camX - m && e.x < Lv.camX + W + m;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hurtbox = p => ({ x: p.x + 2, y: p.y + 4, w: p.w - 4, h: p.h - 6 });
  const alivePlayers = () => Lv.players.filter(p => !p.dead && !p.ghost);
  function nearestPlayer(x, y) {
    let best = null, bd = Infinity;
    for (const p of Lv.players) {
      if (p.dead || p.ghost) continue;
      const d = (p.x + p.w / 2 - x) ** 2 + (p.y + p.h / 2 - y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  function hitPlayers(rect) { for (const p of Lv.players) if (!p.dead && !p.ghost && overlap(hurtbox(p), rect)) hurtPlayer(p); }

  // ---------- effects ----------
  function particle(x, y, vx, vy, life, c, s = 1, gr = 0) { if (Lv.parts.length < 700) Lv.parts.push({ x, y, vx, vy, life, max: life, c, s, g: gr }); }
  function spark(x, y, c = '#fff6c2') { for (let i = 0; i < 4; i++) particle(x, y, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 10, c); }
  function boom(x, y, size = 1, quiet = false) {
    const cols = ['#fff6c2', '#ffd23f', '#ff8a3d', '#ff4f4f', '#5a4a6a'];
    for (let i = 0; i < 12 * size; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * 2.4 * size;
      particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 0.4, 18 + Math.random() * 18, cols[Math.floor(Math.random() * cols.length)], Math.random() < 0.3 ? 3 : 2, 0.03);
    }
    Lv.rings.push({ x, y, life: 36, max: 36, r: 10 * size });
    Lv.shake = Math.max(Lv.shake, 2 * size);
    if (!quiet) SFX.boom();
  }
  function floatText(x, y, s, c = VOLT) { Lv.texts.push({ x, y, s, c, life: 70 }); }
  function addScore(n, pr, x, y) {
    if (!pr) { G.players.forEach(q => q.score += Math.round(n / G.players.length)); return; }
    pr.score += n;
    if (x !== undefined && n >= 300) floatText(x, y, String(n), PCOL[pr.num]);
    if (pr.score >= pr.nextLife) {
      pr.nextLife += 20000; pr.lives++; SFX.power();
      const p = Lv.players.find(q => q.pr === pr); if (p) floatText(p.x + 5, p.y - 10, '+1 MẠNG', JADE);
    }
  }
  function chargeStorm(n) { const was = G.storm; G.storm = Math.min(100, G.storm + n); if (was < 100 && G.storm >= 100) { SFX.power(); floatText(Lv.camX + W / 2, 236, 'BÃO LỬA SẴN SÀNG', EMBER); } }

  function bolt(x, y) {
    const pts = []; let bx = x + (Math.random() - 0.5) * 20;
    for (let yy = -10; yy < y; yy += 14) { pts.push(bx, yy); bx += (Math.random() - 0.5) * 14; }
    pts.push(x, y);
    Lv.bolts.push({ pts, life: 14 });
    for (let i = 0; i < 8; i++) particle(x, y, (Math.random() - 0.5) * 4, -Math.random() * 3, 18, Math.random() < 0.5 ? '#fff6c2' : VOLT, 2, 0.12);
  }
  function triggerStorm(p) {
    G.storm = 0; Lv.stormT = 90; Lv.flashT = 12; Lv.shake = 10; Lv.eB = [];
    SFX.bigBoom(); SFX.laser();
    floatText(p.x + 5, p.y - 16, 'BÃO LỬA!', EMBER);
    for (const e of Lv.enemies) if (!e.remove && !e.passive && onScreen(e)) { bolt(e.x + e.w / 2, e.y + e.h / 2); damageEnemy(e, 8, p.pr); }
    const b = Lv.boss;
    if (b && b.alive) {
      const [cx, cy] = bossCenter(b); bolt(cx, cy); bolt(cx - 20, cy + 10);
      damageBoss(b, { id: 'storm' }, Math.ceil(b.maxHp * 0.12), p.pr, true);
    }
  }

  // ---------- players ----------
  function setCrouch(p, on) {
    if (on && !p.crouch) { p.y += 8; p.h = 14; p.crouch = true; }
    else if (!on && p.crouch && !hitSolid(p.x, p.y - 8, p.w, 8)) { p.y -= 8; p.h = 22; p.crouch = false; }
  }
  function muzzle(p) {
    const sx = p.x + p.w / 2 + p.facing, sy = p.y + p.h - (p.crouch ? 6 : 14);
    return [sx + p.aimX * 14, sy + p.aimY * 14];
  }
  function shot(x, y, a, sp, dmg, kind, own, o = {}) {
    Lv.pB.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg, kind, own, life: 100, pierce: !!o.pierce, homing: !!o.homing, hit: new Set() });
  }
  function fire(p) {
    const pr = p.pr, rate = pr.rapid ? 0.6 : 1, [mx, my] = muzzle(p), a = Math.atan2(p.aimY, p.aimX);
    p.flash = 4;
    switch (pr.weapon) {
      case 'S': for (const d of [-0.28, -0.14, 0, 0.14, 0.28]) shot(mx, my, a + d, 5.2, 1, 'S', pr); p.fireCd = 15 * rate; SFX.spread(); break;
      case 'L': shot(mx, my, a, 9, 4, 'L', pr, { pierce: true }); p.fireCd = 20 * rate; SFX.laser(); break;
      case 'H': shot(mx, my, a - 0.4, 2.6, 2, 'H', pr, { homing: true }); shot(mx, my, a + 0.4, 2.6, 2, 'H', pr, { homing: true }); p.fireCd = 18 * rate; SFX.missile(); break;
      default: shot(mx, my, a, 6.2, 1, 'P', pr); p.fireCd = 9 * rate; SFX.shoot();
    }
  }

  function updatePlayer(p, idx) {
    const I = inp(p.slot), K = I.k, PR = I.p, pr = p.pr, ch = CHARS[p.ci];
    if (p.ghost) { updateGhost(p, idx); return; }
    if (p.dead) { if (--p.deadT <= 0) respawn(p, idx); return; }
    if (p.invuln > 0) p.invuln--; if (p.fireCd > 0) p.fireCd--; if (p.flash > 0) p.flash--; if (p.dashCd > 0) p.dashCd--; if (p.dropT > 0) p.dropT--;
    const hx = (K.right ? 1 : 0) - (K.left ? 1 : 0), U = K.up, D = K.down;
    if (hx && p.dashT <= 0) p.facing = hx;
    setCrouch(p, D && p.onGround && !hx && p.dashT <= 0);

    if (PR.dash && p.dashCd <= 0 && p.dashT <= 0) {
      setCrouch(p, false);
      p.dashT = 12; p.dashCd = 42; p.vy = 0; SFX.dash();
      for (let i = 0; i < 6; i++) particle(p.x + p.w / 2, p.y + p.h - 2, -p.facing * Math.random() * 2, -Math.random(), 14, '#d8d2f0', 2);
    }
    if (p.dashT > 0) {
      p.dashT--; p.vx = p.facing * 5; p.vy = 0;
      if (p.dashT % 2 === 0) Lv.trail.push({ ci: p.ci, x: p.x + p.w / 2, y: p.y + p.h, facing: p.facing, aimX: p.aimX, aimY: p.aimY, life: 12 });
    } else {
      const target = p.crouch ? 0 : hx * ch.speed;
      p.vx += (target - p.vx) * 0.5; if (Math.abs(p.vx) < 0.05) p.vx = 0;
      p.vy = Math.min(p.vy + GRAV, 7);
    }

    if (PR.jump) p.jumpBuf = 7; else if (p.jumpBuf > 0) p.jumpBuf--;
    if (p.onGround) { p.coyote = 6; p.jumps = 0; } else if (p.coyote > 0) p.coyote--;
    if (p.jumpBuf > 0 && p.dashT <= 0) {
      if (D && p.onGround && onOneWay(p)) { setCrouch(p, false); p.dropT = 12; p.jumpBuf = 0; p.y += 2; }
      else if (p.coyote > 0) { setCrouch(p, false); p.vy = JUMP; p.coyote = 0; p.jumpBuf = 0; p.jumps = 1; p.onGround = false; SFX.jump(); }
      else if (ch.dj && p.jumps < 2) {
        p.vy = JUMP * 0.92; p.jumps = 2; p.jumpBuf = 0; SFX.jump();
        for (let i = 0; i < 8; i++) particle(p.x + p.w / 2, p.y + p.h, (Math.random() - 0.5) * 2.4, Math.random() * 0.8, 14, '#7ff0dc', 2);
      }
    }
    if (!K.jump && p.vy < -2.4 && p.dashT <= 0) p.vy = -2.4;

    physics(p, p.dropT > 0);
    if (p.x < Lv.camX) { p.x = Lv.camX; if (p.vx < 0) p.vx = 0; }
    if (p.x + p.w > Lv.camX + W) p.x = Lv.camX + W - p.w;
    const b = Lv.boss;
    if (b && b.type === 'core' && b.alive && p.x + p.w > b.x - 14) p.x = b.x - 14 - p.w;

    let ax = hx, ay = U ? -1 : (D && (!p.onGround || hx) ? 1 : 0);
    if (p.crouch) { ax = p.facing; ay = 0; }
    if (!ax && !ay) ax = p.facing;
    const n = Math.hypot(ax, ay); p.aimX = ax / n; p.aimY = ay / n;
    if (K.fire && p.fireCd <= 0 && p.dashT <= 0) fire(p);
    if (PR.super && G.storm >= 100) triggerStorm(p);
    if (p.onGround && Math.abs(p.vx) > 0.3) p.anim++;

    if (p.y + p.h > HAZARD_Y) {
      for (let i = 0; i < 10; i++) particle(p.x + p.w / 2, HAZARD_Y, (Math.random() - 0.5) * 3, -Math.random() * 3, 24, Lv.theme === 'forge' ? '#ffb43d' : '#9fc0ff', 2, 0.15);
      killPlayer(p);
    }
    for (const it of Lv.items) if (!it.remove && overlap(p, it)) {
      it.remove = true; SFX.power(); addScore(500, pr);
      if (it.kind === 'R') { pr.rapid = true; floatText(p.x + 5, p.y - 8, 'BẮN NHANH', JADE); }
      else { pr.weapon = it.kind; floatText(p.x + 5, p.y - 8, WEAPON_NAME[it.kind], JADE); }
    }
    updateBuddy(p);
  }

  function updateGhost(p, idx) {
    p.gx = clamp(p.gx, Lv.camX + 14, Lv.camX + W - 14);
    p.gy = 74 + Math.sin(Lv.t * 0.05 + p.pr.num) * 5;
    const near = alivePlayers().some(q => Math.abs(q.x + q.w / 2 - p.gx) < 26);
    p.reviveT = near ? p.reviveT + 1 : Math.max(0, p.reviveT - 2);
    if (frame % 6 === 0) particle(p.gx + (Math.random() - 0.5) * 10, p.gy + 6, 0, -0.4, 20, PCOL[p.pr.num], 1);
    if (p.reviveT >= REVIVE) {
      const np = newPlayer(p.pr, p.gx - 5, p.gy);
      Lv.players[idx] = np;
      for (let i = 0; i < 20; i++) particle(p.gx, p.gy, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 26, PCOL[p.pr.num], 2);
      floatText(p.gx, p.gy - 18, 'HỒI SINH', JADE); SFX.power();
    }
  }

  function hurtPlayer(p) {
    if (p.dead || p.ghost || p.invuln > 0 || p.dashT > 0) return;
    if (--p.hp > 0) { p.invuln = 90; SFX.hurt(); Lv.shake = 5; floatText(p.x + 5, p.y - 8, 'MẤT GIÁP', BLOOD); spark(p.x + 5, p.y + 8, VOLT); return; }
    killPlayer(p);
  }
  function killPlayer(p) {
    if (p.dead || p.ghost) return;
    p.dead = true; p.deadT = 80; SFX.hurt();
    boom(p.x + p.w / 2, p.y + p.h / 2, 1.4, true); Lv.shake = 8;
    p.pr.weapon = 'P'; p.pr.rapid = false;
  }
  function spawnX(near) {
    const startC = Math.floor(Math.max(Lv.camX, (near || Lv.camX + 40) - 60) / T);
    for (let c = startC; c < Math.floor(Lv.camX / T) + 26; c++) if (c >= Math.floor(Lv.camX / T) + 1 && solidTop(c) >= 0 && solidTop(c + 1) >= 0) return c * T + 3;
    let x = Lv.camX + 40;
    const b = Lv.boss; if (b && b.type === 'core') x = Math.min(x, b.x - 40);
    return x;
  }
  function respawn(p, idx) {
    const pr = p.pr;
    if (pr.lives <= 0) {
      p.dead = false; p.ghost = true; p.gx = p.x + p.w / 2; p.gy = 74; p.reviveT = 0;
      if (Lv.players.every(q => q.ghost)) { saveHi(); state = 'over'; stateT = 0; SFX.music('title'); }
      return;
    }
    pr.lives--;
    let x = spawnX(p.x);
    const b = Lv.boss; if (b && b.type === 'core') x = Math.min(x, b.x - 40);
    Lv.players[idx] = newPlayer(pr, x, 10);
  }

  function updateBuddy(p) {
    const d = p.drone; if (!d) return;
    const tx = p.x + p.w / 2 - p.facing * 14, ty = p.y - 10 + Math.sin(Lv.t * 0.08) * 3;
    d.x += (tx - d.x) * 0.12; d.y += (ty - d.y) * 0.12;
    if (--d.fireT <= 0) {
      const tg = nearestTarget(d.x, d.y, 190);
      if (tg) { shot(d.x, d.y, Math.atan2(tg.y - d.y, tg.x - d.x), 5, 1, 'D', p.pr); d.fireT = 32; } else d.fireT = 8;
    }
  }

  // ---------- enemies ----------
  function spawnSoldier(x, y, dir) {
    Lv.enemies.push({ type: 'soldier', x, y, w: 10, h: 20, hp: 2, vx: 0, vy: 0, dir, face: dir, shootT: 50 + Math.random() * 80, stopT: 0, anim: 0, flash: 0, muzzle: 0 });
  }
  function spawnEntity(s) {
    const x = s.col * T, list = Lv.enemies;
    if (s.kind === 'capsule') { const base = 40 + Math.random() * 30; list.push({ type: 'capsule', x: Lv.camX - 18, y: base, base, w: 16, h: 10, hp: 1, t: 0, weapon: s.weapon, flash: 0 }); return; }
    if (s.kind === 'drone') { list.push({ type: 'drone', x, y: s.row * T, base: s.row * T, w: 14, h: 10, hp: 2, t: Math.random() * 100, mode: 'patrol', vx: -0.8, vy: 0, fireT: 90 + Math.random() * 60, flash: 0 }); return; }
    if (s.kind === 'geyser') { list.push({ type: 'geyser', x: x + 4, y: 236, w: 8, h: 8, t: Math.floor(Math.random() * 80), passive: true }); return; }
    const top = solidTop(s.col); if (top < 0) return;
    if (s.kind === 'turret') list.push({ type: 'turret', x, y: top * T - 12, w: 16, h: 12, hp: 6, ang: Math.PI, fireT: 60 + Math.random() * 60, flash: 0 });
    else if (s.kind === 'soldier') spawnSoldier(x, top * T - 20, -1);
    else if (s.kind === 'hopper') list.push({ type: 'hopper', x, y: top * T - 10, w: 14, h: 10, hp: 3, vx: 0, vy: 0, jumpT: 40 + Math.random() * 40, face: -1, flash: 0, onGround: true });
  }
  function enemyShot(x, y, tx, ty, sp, o = {}) {
    const a = Math.atan2(ty - y, tx - x);
    Lv.eB.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: o.r || 3, kind: o.kind || 'dot', g: o.g || 0, life: o.life || 300 });
    SFX.eshot();
  }

  function updateEnemies() {
    for (const e of Lv.enemies) {
      if (e.flash > 0) e.flash--;
      const tp = nearestPlayer(e.x + e.w / 2, e.y + e.h / 2), alive = !!tp;
      const px = tp ? tp.x + tp.w / 2 : e.x - 100, py = tp ? tp.y + tp.h / 2 : e.y;
      switch (e.type) {
        case 'soldier':
          e.anim++; if (e.muzzle > 0) e.muzzle--;
          if (e.stopT > 0) {
            e.stopT--; e.vx = 0; e.face = px < e.x ? -1 : 1;
            if (e.stopT === 10 && alive) { enemyShot(e.x + e.w / 2 + e.face * 10, e.y + 8, px, py, 2.3); e.muzzle = 5; }
          } else {
            e.vx = e.dir * 1.05; e.face = e.dir;
            if (onScreen(e) && e.onGround && --e.shootT <= 0) { e.stopT = 26; e.shootT = 110 + Math.random() * 90; }
          }
          e.vy = Math.min(e.vy + GRAV, 7); physics(e, false);
          if (e.hitWall && e.onGround) e.vy = -4.6;
          if (e.dir > 0 && e.x > Lv.camX + W + 80) e.remove = true;
          break;
        case 'turret': {
          const tx = e.x + 8, ty = e.y + 4, want = Math.atan2(py - ty, px - tx);
          let d = want - e.ang; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
          e.ang += clamp(d, -0.05, 0.05);
          if (onScreen(e) && --e.fireT <= 0) {
            e.fireT = 100 + Math.random() * 40;
            if (alive) enemyShot(tx + Math.cos(e.ang) * 12, ty + Math.sin(e.ang) * 12, tx + Math.cos(e.ang) * 100, ty + Math.sin(e.ang) * 100, 2.2);
          }
          break;
        }
        case 'drone':
          e.t++;
          if (e.mode === 'patrol') {
            e.x += e.vx; e.y = e.base + Math.sin(e.t * 0.06) * 14;
            if (alive && Math.abs(px - e.x) < 90 && py > e.y + 20 && Math.random() < 0.02) {
              e.mode = 'dive'; e.mt = 45; const a = Math.atan2(py - e.y, px - e.x); e.vx = Math.cos(a) * 2.4; e.vy = Math.sin(a) * 2.4;
            }
          } else if (e.mode === 'dive') { e.x += e.vx; e.y += e.vy; if (--e.mt <= 0) { e.mode = 'leave'; e.vx = -1.2; e.vy = -1.4; } }
          else { e.x += e.vx; e.y += e.vy; if (e.y < -30) e.remove = true; }
          if (onScreen(e) && --e.fireT <= 0) { e.fireT = 130 + Math.random() * 60; if (alive) enemyShot(e.x + 7, e.y + 8, px, py, 2); }
          break;
        case 'hopper':
          if (e.onGround) {
            e.vx *= 0.7;
            if (--e.jumpT <= 0 && onScreen(e)) { e.face = px < e.x ? -1 : 1; e.vy = -4.3; e.vx = e.face * 1.8; e.jumpT = 45 + Math.random() * 35; }
          }
          e.vy = Math.min(e.vy + GRAV, 7); physics(e, false);
          break;
        case 'geyser': {
          e.t++; const cyc = e.t % 130;
          if (cyc > 95 && cyc % 5 === 0) particle(e.x + 4 + (Math.random() - 0.5) * 8, 248, 0, -0.6, 16, VOLT, 2);
          if (cyc === 0 && onScreen(e)) Lv.eB.push({ x: e.x + 4, y: 252, vx: (Math.random() - 0.5) * 0.5, vy: -6.6, g: 0.15, r: 5, kind: 'fire', life: 200 });
          if (e.x < Lv.camX - 40) e.remove = true;
          break;
        }
        case 'capsule':
          e.t++; e.x += 1.5; e.y = e.base + Math.sin(e.t * 0.07) * 16;
          if (e.x > Lv.camX + W + 24) e.remove = true;
          break;
      }
      if (e.type !== 'capsule' && (e.x + e.w < Lv.camX - 80 || e.y > H + 20)) e.remove = true;
      if (!e.passive && e.type !== 'capsule' && !e.remove) hitPlayers(e);
    }
  }

  function damageEnemy(e, dmg, own) {
    if (e.remove) return;
    e.hp -= dmg; e.flash = 3; SFX.hit();
    if (e.hp > 0) return;
    e.remove = true;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    boom(cx, cy, e.type === 'turret' ? 1.6 : 1);
    addScore(SCORE[e.type] || 100, own, cx, cy - 10);
    chargeStorm((SCORE[e.type] || 100) / 40);
    if (e.type === 'capsule') Lv.items.push({ x: cx - 6, y: cy, w: 12, h: 10, vx: 0, vy: -3, kind: e.weapon, life: 0 });
  }

  // ---------- bosses ----------
  function spawnBoss() {
    const ax = Lv.arenaX, gy = Lv.groundY, type = Lv.d.boss, mult = 1 + 0.5 * (G.players.length - 1);
    let b;
    if (type === 'crab') b = { name: 'CUA THÉP K-9', x: ax + W + 10, y: gy - 46, w: 84, h: 46, hp: 150, vx: 0, vy: 0, mode: 'enter', modeT: 0, face: -1, shootT: 70, cycles: 0, targetX: ax + W - 130, mortarT: 160 };
    if (type === 'core') {
      const x = ax + W - 108, th = Math.round(28 * mult);
      b = { name: 'LÒ RÈN VÔ CỰC', x, y: gy - 170, w: 108, h: 170, hp: 170, mode: 'closed', modeT: 0, openAmt: 0, spin: 0, cx: x + 60, cy: gy - 92, rise: 170,
        turrets: [{ x: x + 2, y: gy - 146, hp: th, fireT: 40, ang: Math.PI, alive: true, flash: 0 }, { x: x + 2, y: gy - 34, hp: th, fireT: 80, ang: Math.PI, alive: true, flash: 0 }] };
    }
    if (type === 'serpent') b = { name: 'LONG HẠM THIÊN VÂN', hp: 240, hx: ax + W + 60, hy: 60, pt: 0, mode: 'fly', modeT: 0, hist: [], segs: [], fireT: 90, bombT: 120, face: -1, jaw: 0 };
    b.hp = Math.round(b.hp * mult);
    Object.assign(b, { type, maxHp: b.hp, t: 0, flash: 0, alive: true, dying: 0 });
    Lv.boss = b;
  }

  function bossParts(b) {
    if (b.type === 'crab') return [{ x: b.x + 6, y: b.y + 4, w: b.w - 12, h: b.h - 8, id: 'body' }];
    if (b.type === 'core') {
      const oy = b.rise, arr = [{ x: b.cx - 20, y: b.cy - 20 + oy, w: 40, h: 40, id: 'core', armored: b.openAmt < 0.8 }];
      b.turrets.forEach((tr, i) => { if (tr.alive) arr.push({ x: tr.x - 10, y: tr.y - 9 + oy, w: 20, h: 18, id: 't' + i, tur: tr }); });
      return arr;
    }
    return [{ x: b.hx - 18, y: b.hy - 12, w: 36, h: 24, id: 'head' }];
  }

  function damageBoss(b, part, dmg, own, fromStorm) {
    if (!b.alive) return;
    if (part.tur) {
      const tr = part.tur; tr.hp -= dmg; tr.flash = 3; SFX.hit();
      if (tr.hp <= 0) { tr.alive = false; boom(tr.x, tr.y + b.rise, 2); addScore(1000, own, tr.x, tr.y - 10); chargeStorm(10); }
      return;
    }
    b.hp -= dmg; b.flash = 3; SFX.hit();
    if (!fromStorm) chargeStorm(dmg * 0.3);
    if (b.hp <= 0) {
      b.hp = 0; b.alive = false; b.dying = 160; Lv.eB = []; Lv.bossState = 'dying';
      SFX.bigBoom(); Lv.shake = 12; addScore(10000, own);
    }
  }

  function bossCenter(b) {
    if (b.type === 'crab') return [b.x + b.w / 2, b.y + b.h / 2];
    if (b.type === 'core') return [b.cx, b.cy + b.rise];
    return [b.hx, b.hy];
  }

  function updateBoss(b) {
    b.t++; if (b.flash > 0) b.flash--;
    const [bcx, bcy] = bossCenter(b), tp = nearestPlayer(bcx, bcy), alive = !!tp;
    const px = tp ? tp.x + tp.w / 2 : bcx - 100, py = tp ? tp.y + tp.h / 2 : bcy, ax = Lv.arenaX, gy = Lv.groundY;
    if (!b.alive) {
      if (--b.dying % 7 === 0) boom(bcx + (Math.random() - 0.5) * 70, bcy + (Math.random() - 0.5) * 60, 1.5, b.dying % 21 !== 0);
      if (b.dying <= 0) { Lv.boss = null; Lv.bossState = 'done'; Lv.endT = 90; }
      return;
    }

    if (b.type === 'crab') {
      const cx = b.x + b.w / 2, ph2 = b.hp < b.maxHp * 0.5;
      const pickTarget = () => { b.targetX = ax + 20 + Math.random() * (W - b.w - 40); };
      if (b.mode !== 'leap' && b.mode !== 'crouch') b.face = px < cx ? -1 : 1;
      if (b.mode === 'enter') { b.vx = -1.2; if (b.x <= b.targetX) { b.mode = 'walk'; b.modeT = 0; pickTarget(); } }
      else if (b.mode === 'walk') {
        b.modeT++;
        const d = b.targetX - b.x; b.vx = Math.abs(d) < 2 ? 0 : Math.sign(d) * (ph2 ? 1.7 : 1.1);
        if (--b.shootT <= 0) {
          b.shootT = ph2 ? 50 : 72;
          if (alive) {
            const ox = cx + b.face * 18, oy = b.y - 2, a = Math.atan2(py - oy, px - ox), n = ph2 ? 5 : 3;
            for (let i = 0; i < n; i++) { const aa = a + (i - (n - 1) / 2) * 0.18; Lv.eB.push({ x: ox, y: oy, vx: Math.cos(aa) * 2.4, vy: Math.sin(aa) * 2.4, r: 3, kind: 'dot', g: 0, life: 300 }); }
            SFX.eshot();
          }
        }
        if (ph2 && --b.mortarT <= 0) {
          b.mortarT = 170;
          for (const k of [-1, 1]) Lv.eB.push({ x: cx, y: b.y, vx: (px - cx) / 70 + k * 0.6, vy: -5.5, g: 0.14, r: 4, kind: 'bomb', life: 300 });
        }
        if (Math.abs(d) < 2 || b.modeT > 150) { b.cycles++; b.modeT = 0; if (b.cycles % 3 === 0) { b.mode = 'crouch'; b.vx = 0; } else pickTarget(); }
      } else if (b.mode === 'crouch') {
        b.vx = 0;
        if (++b.modeT > 32) { b.mode = 'leap'; b.vy = -7.2; b.vx = clamp((px - cx) / 52, -3, 3); SFX.jump(); }
      }
      b.x += b.vx;
      if (b.mode !== 'enter') b.x = clamp(b.x, ax + 4, ax + W - b.w - 4);
      b.vy += 0.28; b.y += b.vy;
      if (b.y + b.h >= gy) {
        b.y = gy - b.h;
        if (b.mode === 'leap') {
          b.mode = 'walk'; b.modeT = 0; pickTarget(); Lv.shake = 10; SFX.boom();
          const c2 = b.x + b.w / 2;
          for (const s of [-1, 1]) Lv.eB.push({ x: c2 + s * 34, y: gy - 6, vx: s * 2.6, vy: 0, r: 6, kind: 'wave', g: 0, life: 200 });
          for (let i = 0; i < 14; i++) particle(c2 + (Math.random() - 0.5) * 80, gy - 2, (Math.random() - 0.5) * 3, -Math.random() * 2, 20, '#7a6a8a', 2, 0.1);
        }
        b.vy = 0;
      }
      hitPlayers({ x: b.x + 4, y: b.y + 6, w: b.w - 8, h: b.h - 6 });
    }

    else if (b.type === 'core') {
      if (b.rise > 0) {
        b.rise = Math.max(0, b.rise - 1.2); Lv.shake = Math.max(Lv.shake, 2);
        if (b.t % 4 === 0) particle(b.x + Math.random() * b.w, gy - 2, (Math.random() - 0.5) * 2, -Math.random() * 2, 24, '#5a3a3a', 3, 0.05);
        return;
      }
      const ph2 = b.hp < b.maxHp * 0.4; b.modeT++;
      if (b.mode === 'closed') {
        b.openAmt = Math.max(0, b.openAmt - 0.05);
        if (b.modeT % (ph2 ? 28 : 40) === 0) Lv.eB.push({ x: b.x + b.w - 26, y: b.y - 6, vx: -(1 + Math.random() * 2.8), vy: -3.5 - Math.random() * 1.5, g: 0.12, r: 5, kind: 'fire', life: 300 });
        if (b.modeT > (ph2 ? 110 : 150)) { b.mode = 'open'; b.modeT = 0; SFX.warn(); }
      } else {
        b.openAmt = Math.min(1, b.openAmt + 0.05);
        if (b.openAmt >= 1 && b.modeT % (ph2 ? 6 : 9) === 0) {
          b.spin += 0.37;
          for (let k = 0; k < (ph2 ? 2 : 1); k++) {
            const a = Math.PI / 2 + ((b.spin + k * 1.6) % Math.PI);
            Lv.eB.push({ x: b.cx, y: b.cy, vx: Math.cos(a) * 1.9, vy: Math.sin(a) * 1.9, r: 3, kind: 'orb', g: 0, life: 400 });
          }
        }
        if (b.modeT > 170) { b.mode = 'closed'; b.modeT = 0; }
      }
      for (const tr of b.turrets) {
        if (!tr.alive) continue;
        if (tr.flash > 0) tr.flash--;
        const tt = nearestPlayer(tr.x, tr.y), tx = tt ? tt.x + 5 : px, ty = tt ? tt.y + tt.h / 2 : py;
        let d = Math.atan2(ty - tr.y, tx - tr.x) - tr.ang; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        tr.ang += clamp(d, -0.04, 0.04);
        if (--tr.fireT <= 0) { tr.fireT = ph2 ? 55 : 80; if (alive) enemyShot(tr.x + Math.cos(tr.ang) * 16, tr.y + Math.sin(tr.ang) * 16, tr.x + Math.cos(tr.ang) * 100, tr.y + Math.sin(tr.ang) * 100, 2.3); }
      }
    }

    else {
      const ph2 = b.hp < b.maxHp * 0.5, prevX = b.hx;
      b.modeT++;
      if (b.mode === 'fly') {
        b.pt += ph2 ? 1.5 : 1;
        const tx = ax + W / 2 + Math.cos(b.pt * 0.013) * 165, ty = 78 + Math.sin(b.pt * 0.026) * 42;
        b.hx += (tx - b.hx) * 0.08; b.hy += (ty - b.hy) * 0.08;
        b.jaw = b.fireT < 15 ? 3 : 0;
        if (--b.fireT <= 0) {
          b.fireT = ph2 ? 55 : 80;
          if (alive) {
            const mx = b.hx + b.face * 24;
            for (const d of [-0.22, 0, 0.22]) { const a = Math.atan2(py - b.hy, px - mx) + d; Lv.eB.push({ x: mx, y: b.hy + 4, vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5, r: 5, kind: 'fire', g: 0, life: 300 }); }
            SFX.eshot();
          }
        }
        if (--b.bombT <= 0 && b.segs.length > 3) { b.bombT = ph2 ? 70 : 110; const s = b.segs[2 + Math.floor(Math.random() * (b.segs.length - 3))]; Lv.eB.push({ x: s.x, y: s.y + 8, vx: 0, vy: 0.5, g: 0.1, r: 4, kind: 'bomb', life: 300 }); }
        if (b.modeT > (ph2 ? 360 : 470)) { b.mode = 'windup'; b.modeT = 0; SFX.warn(); Lv.shake = 6; }
      } else if (b.mode === 'windup') {
        b.hx += (ax + W + 70 - b.hx) * 0.07; b.hy += (gy - 20 - b.hy) * 0.07; b.jaw = 4;
        if (b.modeT > 60) { b.mode = 'sweep'; b.modeT = 0; }
      } else if (b.mode === 'sweep') {
        b.hx -= ph2 ? 6 : 5; b.hy = gy - 20 + Math.sin(b.modeT * 0.2) * 3; b.jaw = 4;
        if (b.modeT % 6 === 0) particle(b.hx + 20, b.hy + 8, 1, -0.5, 18, '#ff8a3d', 2);
        if (b.hx < ax - 100) { b.mode = 'fly'; b.modeT = 0; }
      }
      if (Math.abs(b.hx - prevX) > 0.3) b.face = b.hx < prevX ? -1 : 1;
      b.hist.unshift({ x: b.hx, y: b.hy }); if (b.hist.length > 90) b.hist.pop();
      b.segs = [];
      for (let i = 1; i <= 11; i++) b.segs.push(b.hist[Math.min(b.hist.length - 1, i * 7)]);
      hitPlayers({ x: b.hx - 16, y: b.hy - 10, w: 32, h: 20 });
      for (const s of b.segs) hitPlayers({ x: s.x - 7, y: s.y - 7, w: 14, h: 14 });
    }
  }

  // ---------- bullets ----------
  function nearestTarget(x, y, range = 260) {
    let best = null, bd = range * range;
    for (const e of Lv.enemies) {
      if (e.remove || e.passive || !onScreen(e)) continue;
      const dx = e.x + e.w / 2 - x, dy = e.y + e.h / 2 - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { x: e.x + e.w / 2, y: e.y + e.h / 2 }; }
    }
    const b = Lv.boss;
    if (b && b.alive) for (const pt of bossParts(b)) {
      const cx = pt.x + pt.w / 2, cy = pt.y + pt.h / 2, dx = cx - x, dy = cy - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { x: cx, y: cy }; }
    }
    return best;
  }
  const hitsBox = (b, e) => b.x >= e.x - 3 && b.x <= e.x + e.w + 3 && b.y >= e.y - 3 && b.y <= e.y + e.h + 3;

  function updateBullets() {
    for (const b of Lv.pB) {
      if (--b.life <= 0) { b.dead = true; continue; }
      if (b.homing) {
        const tg = nearestTarget(b.x, b.y);
        let cur = Math.atan2(b.vy, b.vx); const sp = Math.min(5.5, Math.hypot(b.vx, b.vy) + 0.15);
        if (tg) { let d = Math.atan2(tg.y - b.y, tg.x - b.x) - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; cur += clamp(d, -0.13, 0.13); }
        b.vx = Math.cos(cur) * sp; b.vy = Math.sin(cur) * sp;
        if (frame % 2) particle(b.x, b.y, 0, 0, 12, '#8a8296', 1);
      }
      b.x += b.vx; b.y += b.vy;
      if (b.x < Lv.camX - 20 || b.x > Lv.camX + W + 20 || b.y < -20 || b.y > H + 20) { b.dead = true; continue; }
      if (tileAt(Math.floor(b.x / T), Math.floor(b.y / T)) === 1) { b.dead = true; spark(b.x, b.y); continue; }
      for (const e of Lv.enemies) {
        if (e.remove || e.passive || b.hit.has(e) || !hitsBox(b, e)) continue;
        damageEnemy(e, b.dmg, b.own);
        if (b.pierce) b.hit.add(e); else { b.dead = true; spark(b.x, b.y); if (b.kind === 'H') boom(b.x, b.y, 0.5, true); break; }
      }
      const boss = Lv.boss;
      if (!b.dead && boss && boss.alive) for (const pt of bossParts(boss)) {
        if (b.hit.has(pt.id) || !hitsBox(b, pt)) continue;
        if (pt.armored) { b.dead = true; spark(b.x, b.y, '#cfd3e6'); SFX.ting(); break; }
        damageBoss(boss, pt, b.dmg, b.own);
        if (b.pierce) b.hit.add(pt.id); else { b.dead = true; spark(b.x, b.y); if (b.kind === 'H') boom(b.x, b.y, 0.5, true); }
        break;
      }
    }
    Lv.pB = Lv.pB.filter(b => !b.dead);

    for (const b of Lv.eB) {
      b.vy += b.g; b.x += b.vx; b.y += b.vy;
      if (--b.life <= 0 || b.x < Lv.camX - 40 || b.x > Lv.camX + W + 40 || b.y > H + 20 || b.y < -60) { b.dead = true; continue; }
      if (b.kind !== 'fire' && b.kind !== 'wave' && tileAt(Math.floor(b.x / T), Math.floor(b.y / T)) === 1) {
        b.dead = true; if (b.kind === 'bomb') boom(b.x, b.y - 4, 0.8); else spark(b.x, b.y, '#ff8a9a'); continue;
      }
      if (b.kind === 'wave' && frame % 3 === 0) particle(b.x, b.y + 4, -b.vx * 0.2, -Math.random(), 12, VOLT, 2);
      const box = { x: b.x - b.r + 1, y: b.y - b.r + 1, w: b.r * 2 - 2, h: b.r * 2 - 2 };
      for (const p of Lv.players) {
        if (p.dead || p.ghost || p.invuln > 0 || p.dashT > 0 || !overlap(hurtbox(p), box)) continue;
        b.dead = true; hurtPlayer(p); break;
      }
    }
    Lv.eB = Lv.eB.filter(b => !b.dead);
  }

  function updateItems() {
    for (const it of Lv.items) {
      it.life++; it.vy = Math.min(it.vy + 0.15, 3); physics(it, false);
      if (it.y > H || it.life > 540) it.remove = true;
    }
    Lv.items = Lv.items.filter(i => !i.remove);
  }

  function updateAmbient() {
    const A = Lv.amb, th = Lv.theme;
    if (th === 'harbor') for (let i = 0; i < 3; i++) A.push({ x: Math.random() * (W + 80), y: -8, vx: -1.4, vy: 7, life: 60, k: 'rain' });
    else if (th === 'forge') { if (frame % 3 === 0) A.push({ x: Math.random() * W, y: H, vx: 0, vy: -0.5 - Math.random(), life: 260, k: 'ember', ph: Math.random() * 6 }); }
    else if (frame % 4 === 0) A.push({ x: W + 10, y: Math.random() * 200, vx: -4 - Math.random() * 3, vy: 0, life: 200, k: 'wind', len: 8 + Math.random() * 10 });
    for (const a of A) { a.x += a.vx + (a.k === 'ember' ? Math.sin(frame * 0.05 + a.ph) * 0.3 : 0); a.y += a.vy; a.life--; }
    Lv.amb = A.filter(a => a.life > 0 && a.y < H + 10 && a.x > -30);
  }

  // ---------- world step ----------
  function stepPlay() {
    const L = Lv;
    L.t++;
    if (L.introT > 0) L.introT--;
    for (let i = 0; i < L.players.length; i++) updatePlayer(L.players[i], i);
    if (state !== 'play' && state !== 'clear') return;

    const al = alivePlayers();
    if (L.bossState === 'none') {
      if (al.length) {
        const front = Math.max(...al.map(p => p.x)), rear = Math.min(...al.map(p => p.x));
        const target = Math.min(front - W * 0.42, rear - 6);
        if (target > L.camX) L.camX = Math.min(target, L.arenaX);
      }
      while (L.spawnIdx < L.spawns.length && L.spawns[L.spawnIdx].col * T < L.camX + W + 24) spawnEntity(L.spawns[L.spawnIdx++]);
      if (al.length && --L.soldierT <= 0) {
        L.soldierT = (150 + Math.random() * 140) / Math.sqrt(G.players.length);
        const fromLeft = Math.random() < 0.2 && L.camX > 40, x = fromLeft ? L.camX - 12 : L.camX + W + 4, top = solidTop(Math.floor((x + 5) / T));
        if (top >= 0 && L.enemies.filter(e => e.type === 'soldier').length < 4 + G.players.length) spawnSoldier(x, top * T - 20, fromLeft ? 1 : -1);
      }
      if (L.camX >= L.arenaX) { L.bossState = 'warn'; L.warnT = 150; SFX.music('boss'); SFX.warn(); }
    } else if (L.bossState === 'warn') {
      if (L.warnT % 40 === 0) SFX.warn();
      if (--L.warnT <= 0) { L.bossState = 'fight'; spawnBoss(); }
    } else if (L.bossState === 'done' && state === 'play') {
      if (--L.endT <= 0) {
        state = 'clear'; stateT = 0; SFX.music('win');
        for (const pr of G.players) pr.score += (pr.lives + 1) * 1000;
        saveHi();
      }
    }

    if (L.stormT > 0) {
      L.stormT--;
      for (let i = 0; i < 3; i++) particle(L.camX + Math.random() * W, -4, -0.6, 4 + Math.random() * 2, 50, Math.random() < 0.5 ? EMBER : VOLT, 2);
      if (L.stormT % 10 === 0) {
        const vis = L.enemies.filter(e => !e.remove && !e.passive && onScreen(e));
        if (vis.length) { const e = vis[Math.floor(Math.random() * vis.length)]; bolt(e.x + e.w / 2, e.y + e.h / 2); damageEnemy(e, 4); }
        else bolt(L.camX + 30 + Math.random() * (W - 60), 200);
        SFX.missile();
      }
    }
    if (L.flashT > 0) L.flashT--;

    updateEnemies();
    if (L.boss) updateBoss(L.boss);
    updateBullets();
    updateItems();
    L.enemies = L.enemies.filter(e => !e.remove);

    for (const q of L.parts) { q.x += q.vx; q.y += q.vy; q.vy += q.g; q.life--; }
    L.parts = L.parts.filter(q => q.life > 0);
    for (const r of L.rings) r.life--; L.rings = L.rings.filter(r => r.life > 0);
    for (const t of L.trail) t.life--; L.trail = L.trail.filter(t => t.life > 0);
    for (const b of L.bolts) b.life--; L.bolts = L.bolts.filter(b => b.life > 0);
    for (const t of L.texts) { t.life--; t.y -= 0.4; } L.texts = L.texts.filter(t => t.life > 0);
    if (L.theme === 'forge' && frame % 9 === 0) {
      const c = Math.floor((L.camX + Math.random() * W) / T);
      if (tileAt(c, ROWS - 1) !== 1) particle(c * T + Math.random() * T, 248, 0, -0.4, 20, VOLT, 2);
    }
    updateAmbient();
    L.shake *= 0.86; if (L.shake < 0.3) L.shake = 0;
  }

  // ---------- step per state ----------
  function stepSelect() {
    const sys = inp('sys').p;
    for (const id of playerSlots()) {
      const P = inputs[id].p, i = lobby.findIndex(l => l.slot === id), l = lobby[i];
      if (!l) { if (P.fire || P.jump || P.start) lobbyJoin(id); continue; }
      if (!l.ready) {
        if (P.left) { l.ci = (l.ci + 2) % 3; SFX.select(); }
        if (P.right) { l.ci = (l.ci + 1) % 3; SFX.select(); }
        if ((P.fire || P.jump || P.start) && stateT > 8) { l.ready = true; SFX.power(); }
        else if (P.dash) { lobby.splice(i, 1); SFX.select(); }
      } else if (P.dash) { l.ready = false; SFX.select(); }
    }
    if (sys.split && netRole !== 'guest') setSplit(!splitKb);
    if (sys.back) { if (lobby.length) lobby = []; else { state = 'title'; stateT = 0; } }
    if (lobby.length && lobby.every(l => l.ready)) { if (++lobbyT > 50) { newRun(lobby); startStage(0); } }
    else lobbyT = 0;
    titleX += 0.3;
  }

  function step() {
    frame++; stateT++;
    pollPads();
    const sys = inp('sys').p;
    if (sys.mute) SFX.toggle();
    if (sys.quality) VIEW3D.setQuality(VIEW3D.quality === 'high' ? 'low' : 'high');
    switch (state) {
      case 'title':
        titleX += 0.6;
        if (anyPressed('start', 'fire', 'jump')) { state = 'select'; stateT = 0; lobby = []; lobbyT = 0; SFX.select(); }
        break;
      case 'select': stepSelect(); break;
      case 'play': {
        const joined = new Set(G.players.map(p => p.slot));
        let pauseNow = sys.pause || sys.back;
        for (const id of playerSlots()) {
          const P = inputs[id].p;
          if (!joined.has(id) && (P.fire || P.start) && !paused) joinMidgame(id);
          else if (joined.has(id) && P.start && id !== startSlot()) pauseNow = true;
        }
        if (sys.start && joined.has(startSlot())) pauseNow = true;
        if (pauseNow) paused = !paused;
        if (!paused) stepPlay();
        break;
      }
      case 'clear':
        stepPlay();
        if ((stateT > 60 && anyPressed('start', 'fire')) || stateT > 420) {
          if (G.stage + 1 < LEVELS.length) startStage(G.stage + 1);
          else { state = 'victory'; stateT = 0; saveHi(); }
        }
        break;
      case 'over':
        if (stateT > 40 && (sys.start || anyPressed('fire', 'start')) && !sys.back) {
          for (const pr of G.players) Object.assign(pr, { lives: 3, score: 0, nextLife: 20000, weapon: 'P', rapid: false });
          G.storm = 0; startStage(G.stage);
        } else if (stateT > 40 && sys.back) { state = 'title'; stateT = 0; SFX.music('title'); }
        break;
      case 'victory':
        titleX += 0.5;
        if (stateT > 90 && anyPressed('start', 'fire')) { state = 'title'; stateT = 0; SFX.music('title'); }
        break;
    }
    for (const id in inputs) inputs[id].p = {};
  }

  // ---------- LAN play ----------
  const lanEl = document.getElementById('lan');
  const NET_KEYS = ['left', 'right', 'up', 'down', 'fire', 'jump', 'dash', 'super', 'start'];
  const round1 = (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 10) / 10 : v);
  function netSend(o) { if (netWs && netWs.readyState === 1) netWs.send(JSON.stringify(o)); }

  function lanStart(role) {
    netStatus = 'connecting'; netError = ''; lanUpdate();
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    netWs = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', role }));
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onNet(m); };
    ws.onclose = () => {
      if (netRole === 'guest') { state = 'title'; G = null; Lv = null; origMusic('title'); }
      netRole = null; netWs = null; netGuests = 0;
      if (netStatus !== 'error') netStatus = 'closed';
      lanUpdate();
    };
  }
  function onNet(m) {
    switch (m.t) {
      case 'welcome':
        netRole = m.role; netStatus = m.role === 'guest' && !m.hostReady ? 'waiting' : 'ok';
        if (netRole === 'guest') { state = 'title'; stateT = 0; lobby = []; }
        break;
      case 'error': netStatus = 'error'; netError = m.msg || 'Không kết nối được.'; netWs && netWs.close(); break;
      case 'hostup': netStatus = 'ok'; break;
      case 'hostgone': netStatus = 'waiting'; state = 'title'; G = null; Lv = null; origMusic('title'); guestMusic = null; break;
      case 'join': netGuests++; break;
      case 'leave':
        netGuests = Math.max(0, netGuests - 1);
        for (const id of Object.keys(inputs)) if (id.startsWith('n' + m.id + ':')) { inputs[id].k = {}; lobby = lobby.filter(l => l.slot !== id); }
        break;
      case 'in':
        if (netRole === 'host' && m.k) for (const k of NET_KEYS) if (k in m.k) setIn('n' + m.from + ':' + m.slot, k, !!m.k[k]);
        return;
      case 'snap': if (netRole === 'guest') applySnap(m); return;
    }
    lanUpdate();
  }

  function sendSnap() {
    if (!netWs || netWs.readyState !== 1) { sfxQueue.length = 0; return; }
    if (netWs.bufferedAmount > 512 * 1024) return;
    const s = { t: 'snap', state, stateT, frame, paused, lobby, lobbyT, hiscore, titleX, music: curMusic, sfx: sfxQueue.splice(0), G };
    if (Lv && G && (state === 'play' || state === 'clear' || state === 'over')) {
      const L = Lv, b = L.boss;
      s.lv = {
        i: L.i, camX: L.camX, t: L.t, shake: L.shake, introT: L.introT, bossState: L.bossState, warnT: L.warnT, stormT: L.stormT, flashT: L.flashT,
        players: L.players.map(p => { const { pr, ...o } = p; o.num = pr.num; return o; }),
        enemies: L.enemies, pB: L.pB.map(q => ({ x: q.x, y: q.y, vx: q.vx, vy: q.vy, kind: q.kind })), eB: L.eB, items: L.items,
        parts: L.parts.slice(-350), texts: L.texts, rings: L.rings, trail: L.trail, bolts: L.bolts,
        boss: b ? (({ hist, ...o }) => o)(b) : null,
      };
    }
    netWs.send(JSON.stringify(s, round1));
  }

  function applySnap(m) {
    state = m.state; stateT = m.stateT; frame = m.frame; paused = m.paused; lobby = m.lobby || []; lobbyT = m.lobbyT; titleX = m.titleX;
    hiscore = Math.max(hiscore, m.hiscore || 0); G = m.G || null;
    if (m.lv && G) {
      if (!Lv || Lv.i !== m.lv.i) Lv = buildLevel(m.lv.i);
      const amb = Lv.amb;
      Object.assign(Lv, m.lv); Lv.amb = amb;
      for (const p of Lv.players) p.pr = G.players[p.num];
    }
    if (m.music !== guestMusic) { guestMusic = m.music; origMusic(m.music); }
    for (const n of m.sfx || []) if (SFX['_' + n]) SFX['_' + n]();
  }

  function guestSendInputs() {
    for (const id of playerSlots()) {
      const s = inputs[id], prev = netSent[id] || (netSent[id] = {}), diff = {};
      let changed = false, taps = null;
      for (const a of NET_KEYS) {
        const cur = !!s.k[a];
        if (s.p[a] && !cur && !prev[a]) (taps || (taps = {}))[a] = true;   // pressed and released between two steps
        if (cur !== !!prev[a]) { diff[a] = cur; prev[a] = cur; changed = true; }
      }
      if (taps) { netSend({ t: 'in', slot: id, k: taps }); const off = {}; for (const a in taps) off[a] = false; netSend({ t: 'in', slot: id, k: off }); }
      if (changed) netSend({ t: 'in', slot: id, k: diff });
    }
  }

  function stepGuest() {
    frame++;
    pollPads();
    if (inp('sys').p.mute) SFX.toggle();
    if (inp('sys').p.split && state === 'select') setSplit(!splitKb);
    guestSendInputs();
    if (Lv && G && (state === 'play' || state === 'clear')) updateAmbient();
    for (const id in inputs) inputs[id].p = {};
  }

  let lanHtml = '';
  function lanUpdate() {
    if (!netInfo) { lanEl.hidden = true; return; }
    const addr = netInfo.ips.length ? netInfo.ips.map(ip => `http://${ip}:${netInfo.port}`).join('<br>') : location.origin;
    let h;
    if (netRole === 'host') h = `<b>CHỦ PHÒNG</b><p>${netGuests ? netGuests + ' máy khác đã vào phòng.' : 'Chưa có máy nào vào.'} Bạn bè cùng Wi-Fi mở:</p><p class="addr">${addr}</p><p>Máy này chạy trận đấu, hãy để cửa sổ luôn mở.</p>`;
    else if (netRole === 'guest') h = netStatus === 'waiting'
      ? `<b>ĐÃ KẾT NỐI</b><p>Đang chờ một máy bấm “Tạo phòng”…</p>`
      : `<b>ĐÃ VÀO PHÒNG</b><p>Bấm phím Bắn (J, Z, Enter hoặc nút A/X trên tay cầm) để tham gia.</p>`;
    else if (netStatus === 'connecting') h = `<b>MẠNG LAN</b><p>Đang kết nối…</p>`;
    else h = `<b>CHƠI QUA MẠNG LAN</b><p>Các máy cùng Wi-Fi mở địa chỉ:</p><p class="addr">${addr}</p>`
      + (netStatus === 'error' ? `<p class="err">${netError}</p>` : netStatus === 'closed' ? `<p class="err">Mất kết nối với máy chủ.</p>` : '')
      + `<div class="row"><button id="lanHost" type="button">Tạo phòng</button><button id="lanJoin" type="button" class="ghost">Vào phòng</button></div>`;
    if (h !== lanHtml) { lanHtml = h; lanEl.innerHTML = h; }
    lanVisibility();
  }
  function lanVisibility() {
    if (!netInfo) return;
    const hide = (state === 'play' || state === 'clear') && !paused;
    if (lanEl.hidden !== hide) lanEl.hidden = hide;
    lanEl.classList.toggle('compact', !netRole && state === 'title');
  }
  lanEl.addEventListener('click', e => {
    const id = e.target && e.target.id;
    if (id === 'lanHost' || id === 'lanJoin') { e.target.blur(); SFX.init(); lanStart(id === 'lanHost' ? 'host' : 'guest'); }
  });
  fetch('lan-info', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(info => { if (info && Array.isArray(info.ips)) { netInfo = info; lanUpdate(); } })
    .catch(() => { });

  // ---------- loop ----------
  let last = performance.now(), acc = 0;
  const V = { isTouch, slotName };
  UI.init(document.getElementById('ui'), tap);
  function loop(now) {
    const dtMs = Math.min(100, now - last);
    acc += dtMs; last = now;
    while (acc >= STEP) {
      if (netRole === 'guest') stepGuest();
      else { step(); if (netRole === 'host' && ++hostTick % 2 === 0) sendSnap(); }
      acc -= STEP;
    }
    lanVisibility();
    V.state = state; V.stateT = stateT; V.frame = frame; V.paused = paused; V.G = G; V.Lv = Lv; V.lobby = lobby; V.lobbyT = lobbyT;
    V.hiscore = hiscore; V.team = teamScore(); V.netRole = netRole; V.splitKb = splitKb;
    VIEW3D.render(V, dtMs);
    UI.render(V);
    requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play' && !netRole) paused = true; });

  // keep the run across live page updates in the artifact viewer
  const hot = window.claude && window.claude.hot;
  try { hot && hot.snapshot && hot.snapshot(() => ({ G, playing: state === 'play' || state === 'clear' })); } catch (e) { }
  if (location.hash === '#debug') window.__baolua = {
    get G() { return G; }, get Lv() { return Lv; }, inputs, setIn,
    start(cis, st) { newRun(cis.map((ci, i) => ({ slot: ['kbA', 'kbB', 'pad0', 'pad1'][i], ci }))); startStage(st); },
    tick(n) { for (let i = 0; i < n; i++) step(); },
  };
  function boot(data) {
    if (data && data.playing && data.G && data.G.players) { G = data.G; startStage(G.stage); }
    else SFX.music('title');
    requestAnimationFrame(t => { last = t; loop(t); });
  }
  if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data || {});
})();
