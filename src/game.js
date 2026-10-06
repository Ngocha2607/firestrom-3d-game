// game.js — Bão Lửa simulation: loop, input (2 keyboard halves, gamepads, touch), 1–4 player co-op,
// enemies, bosses, the shared "Bão Lửa" storm super, LAN. Drawing lives in world3d.js and ui.js.
(() => {
  'use strict';
  const GRAV = 0.27, JUMP = -5.7, HAZARD_Y = 246, STEP = 1000 / 60, REVIVE = 100;
  const INK = '#f3ecff', DIM = '#a39cc0', EMBER = '#ff6a3d', VOLT = '#ffd23f', JADE = '#38d6b4', BLOOD = '#ff3b4f';
  const WEAPON_NAME = Object.fromEntries(Object.entries(WEAPONS).map(([k, v]) => [k, v.name.toUpperCase()]));
  const SCORE = { soldier: 100, shield: 250, turret: 300, drone: 150, hopper: 200, capsule: 50 };
  const grav = () => (Lv && Lv.d.gravity) || GRAV;
  const SLOT_NAME = { kb: 'BÀN PHÍM', kbA: 'BÀN PHÍM TRÁI', kbB: 'BÀN PHÍM PHẢI', touch: 'CẢM ỨNG', pad0: 'TAY CẦM 1', pad1: 'TAY CẦM 2', pad2: 'TAY CẦM 3', pad3: 'TAY CẦM 4' };
  const slotName = s => { const m = /^n(\d+):(.+)$/.exec(s); return m ? 'MÁY ' + m[1] + ' · ' + (SLOT_NAME[m[2]] || m[2]) : (SLOT_NAME[s] || s); };

  // LAN: the host browser simulates; guests forward inputs and draw the host's snapshots.
  // Sound effects are recorded on the host and replayed on guests.
  let netRole = null, netWs = null, netStatus = 'off', netError = '', netGuests = 0, netInfo = null, hostTick = 0;
  let curMusic = 'title', guestMusic = null;
  const sfxQueue = [], netSent = {};
  const origMusic = SFX.music;
  SFX.music = name => { curMusic = name; if (netRole !== 'guest') origMusic(name); };
  for (const n of ['shoot', 'spread', 'laser', 'missile', 'jump', 'dash', 'hit', 'ting', 'boom', 'bigBoom', 'power', 'hurt', 'select', 'warn', 'eshot', 'flame', 'zap', 'lob', 'crack']) {
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
  const KB_SYS = { sys: { Enter: 'start', NumpadEnter: 'start', Escape: 'back', KeyP: 'pause', KeyM: 'mute', KeyQ: 'quality', Tab: 'split', KeyN: 'mode' } };
  let splitKb = false;
  const startSlot = () => (splitKb ? 'kbB' : 'kb');
  function onKey(e, down) {
    if (e.target && e.target.tagName === 'INPUT') return;   // typing a room code
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
  let difficulty = 1;                                   // index into DIFFS, chosen in the lobby
  const DF = () => DIFFS[G && G.diff !== undefined ? G.diff : difficulty];
  let G = null, Lv = null, hiscore = 0;
  try { hiscore = +localStorage.getItem('baolua_hi') || 0; } catch (e) { }
  const teamScore = () => (G ? G.players.reduce((s, p) => s + p.score, 0) : 0);
  const saveHi = () => { const s = teamScore(); if (s > hiscore) { hiscore = s; try { localStorage.setItem('baolua_hi', String(s)); } catch (e) { } } };

  function makeRecord(slot, ci, num, auto = true) { return { slot, ci, num, auto, lives: DF().lives, score: 0, weapon: 'P', rapid: false, nextLife: 20000, kills: 0, deaths: 0, bosses: 0 }; }
  function newRun(entries) {
    runId++; aiLines = null;
    const dly = mode === 'daily' && daily.def ? { date: daily.date, src: daily.src, name: daily.def.name } : null;
    G = null; G = { players: entries.map((l, i) => makeRecord(l.slot, l.ci, i, l.auto !== false)), stage: dly ? DAILY_IDX : 0, storm: 0, diff: difficulty, daily: dly, radio: null, recap: '' };
  }

  // ---------- "Màn của ngày" and the AI extras (Cloudflare Workers AI, see worker/index.js) ----------
  // The daily stage is the same for everyone on a date: the Worker stores one plan per day. Without the Worker
  // (LAN, file://) or when it fails, the plan is rolled from the date, so a room's host and guests still match.
  const CAMPAIGN = LEVELS.length, DAILY_IDX = LEVELS.length;
  let mode = 'campaign', hostDaily = null, runId = 0, aiLines = null;
  const daily = { date: '', status: 'idle', src: '', def: null };
  const levelDef = i => (i === DAILY_IDX ? daily.def : LEVELS[i]);
  const localDate = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  let dailyBest = { date: '', score: 0 };
  try { dailyBest = JSON.parse(localStorage.getItem('baolua_daily')) || dailyBest; } catch (e) { }
  function setDaily(date, src, plan) { daily.date = date; daily.src = src; daily.def = DAILY.build(plan, date); daily.status = 'ready'; }
  function loadDaily(date, src) {
    if (daily.date === date && (daily.status === 'loading' || daily.failed || (daily.status === 'ready' && (!src || src === daily.src)))) return;
    // a failed fetch is not retried for that date: the rolled plan stays (failed is cleared when the date changes)
    if (daily.date !== date) daily.failed = false;
    daily.date = date; daily.status = 'loading'; daily.def = null;
    const local = () => { if (daily.date === date) { setDaily(date, 'local', DAILY.randomPlan(date)); daily.failed = true; } };
    if (src === 'local' || !(netInfo && netInfo.online)) return local();
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 45000);   // the first visitor of the day waits for the AI
    fetch('api/daily?d=' + date, { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(rec => { const plan = DAILY.sanitize(rec && rec.plan); if (!plan) throw new Error('bad plan'); if (daily.date === date) setDaily(date, rec.source, plan); })
      .catch(local)
      .finally(() => clearTimeout(timer));
  }
  const dailyInfo = () => (netRole === 'guest' ? hostDaily
    : { date: daily.date, status: daily.status, src: daily.src, name: daily.def ? daily.def.name : '', sub: daily.def ? daily.def.sub : '' });
  function setMode(m) {
    if (m === mode || netRole === 'guest') return;
    mode = m; lobbyT = 0; SFX.select();
    if (m === 'daily') loadDaily(localDate());
  }
  function saveDailyBest() {
    const s = teamScore();
    if (dailyBest.date === G.daily.date && dailyBest.score >= s) return;
    dailyBest = { date: G.daily.date, score: s };
    try { localStorage.setItem('baolua_daily', JSON.stringify(dailyBest)); } catch (e) { }
  }

  const aiOn = () => !!(netInfo && netInfo.ai) && netRole !== 'guest';
  const postAI = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))));
  // the radio box over the HUD; it lives in G so LAN/online guests see it too
  function radio(who, text, frames) { if (G && text) G.radio = { who, text, t: frames }; }
  function radioBrief() { const l = aiLines && aiLines[G.stage]; if (l && l.brief) radio('CHỈ HUY', l.brief, 480); }
  // one call per run writes the briefing and the boss taunt of every campaign stage; the daily plan carries its own
  function requestLines() {
    if (G.daily) { aiLines = { [DAILY_IDX]: { brief: daily.def.brief, taunt: daily.def.taunt } }; radioBrief(); return; }
    if (!aiOn()) return;
    const id = runId;
    postAI('api/lines', {
      team: G.players.map(p => CHARS[p.ci].name + ' (' + CHARS[p.ci].role + ')'), diff: DF().name,
      stages: LEVELS.map(l => ({ theme: l.theme, boss: l.boss, sub: l.sub })),
    }).then(o => {
      if (id !== runId || !G || !o || !Array.isArray(o.lines)) return;
      aiLines = Object.assign({}, o.lines);
      if (Lv && Lv.t < 1500 && !G.radio) radioBrief();     // arrived during the opening of the first stage
    }).catch(() => { });
  }
  function requestRecap(result) {
    if (!aiOn() || !G) return;
    const id = runId, at = state;
    postAI('api/recap', {
      result, stage: Lv ? Lv.d.name : '', diff: DF().name,
      players: G.players.map(p => ({ name: 'P' + (p.num + 1) + ' ' + CHARS[p.ci].name, score: p.score, kills: p.kills, deaths: p.deaths, bosses: p.bosses })),
    }).then(o => { if (id === runId && G && state === at && o && o.text) G.recap = o.text; }).catch(() => { });
  }
  function freeChar(used) { const c = [...CHARS.keys()].find(i => !used.includes(i)); return c === undefined ? used.length % CHARS.length : c; }

  function lobbyJoin(slot) {
    if (lobby.length >= 4 || lobby.some(l => l.slot === slot)) return;
    lobby.push({ slot, ci: freeChar(lobby.map(l => l.ci)), ready: false, auto: true }); SFX.select();
  }

  function buildLevel(i) {
    const d = levelDef(i), cols = d.cols, rows = d.rows || ROWS, vertical = !!d.vertical, map = [];
    for (let r = 0; r < rows; r++) map.push(new Uint8Array(cols));
    for (const [a, b, row] of d.ground) for (let c = a; c < b; c++) for (let r = row; r < rows; r++) map[r][c] = 1;
    for (const [c0, r0, w, h] of d.blocks || []) for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (r >= 0 && r < rows && c >= 0 && c < cols) map[r][c] = 1;
    for (const [c0, row, len] of d.plats) for (let c = c0; c < c0 + len; c++) if (!map[row][c]) map[row][c] = 2;
    // side-scrolling stages trigger spawns by column; the climbing stage triggers them by row (from the bottom up)
    const spawns = [
      ...d.enemies.map(([kind, col, row]) => ({ kind, col, row })),
      ...d.capsules.map(([at, weapon]) => (vertical ? { kind: 'capsule', col: 0, row: at, weapon } : { kind: 'capsule', col: at, weapon })),
    ].sort(vertical ? (a, b) => b.row - a.row : (a, b) => a.col - b.col);
    const last = d.ground[d.ground.length - 1];
    return {
      i, d, cols, rows, vertical, mode: d.mode || 'side', map, theme: d.theme, base: d.mode === 'base' ? {} : null,
      camX: 0, camY: vertical ? rows * T - H : 0, rockT: 120,
      arenaX: vertical ? 0 : (cols - 30) * T, groundY: vertical ? d.arenaFloor * T : last ? last[2] * T : 13 * T,
      spawns, spawnIdx: 0, enemies: [], pB: [], eB: [], parts: [], amb: [], items: [], texts: [], rings: [], trail: [], bolts: [], beams: [],
      boss: null, bossState: 'none', warnT: 0, soldierT: 200, shake: 0, introT: 170, t: 0, players: [], endT: 0, stormT: 0, flashT: 0,
    };
  }

  function startStage(i) {
    G.stage = i;
    Lv = buildLevel(i);
    if (Lv.mode === 'base') { Lv.players = G.players.map((pr, k) => newPlayer(pr, 150 + k * 60, 0)); initRoom(0); }
    else if (Lv.vertical) Lv.players = G.players.map((pr, k) => newPlayer(pr, 60 + k * 26, Lv.camY + H - 90));
    else Lv.players = G.players.map((pr, k) => newPlayer(pr, 40 + k * 20, 60));
    state = 'play'; stateT = 0; paused = false;
    SFX.music(Lv.d.music);
    G.radio = null; G.recap = '';
    radioBrief();
  }

  function newPlayer(pr, x, y) {
    return { pr, slot: pr.slot, ci: pr.ci, x, y, w: 10, h: 22, vx: 0, vy: 0, facing: 1, aimX: 1, aimY: 0, onGround: false, crouch: false,
      coyote: 0, jumpBuf: 0, jumps: 0, dropT: 0, fireCd: 0, flash: 0, dashT: 0, dashCd: 0, invuln: 150, hp: CHARS[pr.ci].hp + DF().hpBonus, maxHp: CHARS[pr.ci].hp + DF().hpBonus,
      anim: 0, dead: false, deadT: 0, shieldT: 0, jz: 0, vjz: 0, ghost: false, gx: 0, gy: 0, reviveT: 0,
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
  function tileAt(c, r) { if (r < 0 || r >= Lv.rows) return 0; if (c < 0 || c >= Lv.cols) return 1; return Lv.map[r][c]; }
  function solidTop(c) { for (let r = 0; r < Lv.rows; r++) if (tileAt(c, r) === 1) return r; return -1; }
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
  const onScreen = (e, m = 0) => e.x + (e.w || 0) > Lv.camX - m && e.x < Lv.camX + W + m && e.y + (e.h || 0) > Lv.camY - m - 20 && e.y < Lv.camY + H + m + 20;
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
  let fxZ = 0;                                          // depth tag for effects spawned in the base corridor
  function fxAt(z, fn) { const o = fxZ; fxZ = z; fn(); fxZ = o; }
  function particle(x, y, vx, vy, life, c, s = 1, gr = 0) { if (Lv.parts.length < 700) Lv.parts.push({ x, y, vx, vy, life, max: life, c, s, g: gr, z: fxZ }); }
  function spark(x, y, c = '#fff6c2') { for (let i = 0; i < 4; i++) particle(x, y, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 10, c); }
  function boom(x, y, size = 1, quiet = false) {
    const cols = ['#fff6c2', '#ffd23f', '#ff8a3d', '#ff4f4f', '#5a4a6a'];
    for (let i = 0; i < 12 * size; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * 2.4 * size;
      particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 0.4, 18 + Math.random() * 18, cols[Math.floor(Math.random() * cols.length)], Math.random() < 0.3 ? 3 : 2, 0.03);
    }
    Lv.rings.push({ x, y, life: 36, max: 36, r: 10 * size, z: fxZ });
    Lv.shake = Math.max(Lv.shake, 2 * size);
    if (!quiet) SFX.boom();
  }
  function floatText(x, y, s, c = VOLT) { Lv.texts.push({ x, y, s, c, life: 70, z: fxZ }); }
  function addScore(n, pr, x, y) {
    n = Math.round(n * DF().score);
    if (!pr) { G.players.forEach(q => q.score += Math.round(n / G.players.length)); return; }
    pr.score += n;
    if (x !== undefined && n >= 300) floatText(x, y, String(n), PCOL[pr.num]);
    if (pr.score >= pr.nextLife) {
      pr.nextLife += 20000; pr.lives++; SFX.power();
      const p = Lv.players.find(q => q.pr === pr); if (p) floatText(p.x + 5, p.y - 10, '+1 MẠNG', JADE);
    }
  }
  function chargeStorm(n) { const was = G.storm; G.storm = Math.min(100, G.storm + n); if (was < 100 && G.storm >= 100) { SFX.power(); floatText(Lv.camX + W / 2, Lv.mode === 'base' ? -70 : Lv.camY + 236, 'BÃO LỬA SẴN SÀNG', EMBER); } }

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
  // where the 3D model's gun tip is drawn. The sim muzzle sits lower so standing shots still hit turrets;
  // bullets are drawn from the tip and glide onto their real path over GLIDE frames (see updateBullets).
  const GLIDE = 30;
  function gunTip(p) {
    const len = CHARS[p.ci].id === 'mai' ? 27.5 : 21.8, feet = p.y + p.h;
    return [p.x + p.w / 2 - 2 * p.facing + p.aimX * len, feet - (p.crouch ? 19 : 26) + p.aimY * len];
  }
  function shot(x, y, a, sp, dmg, kind, own, o = {}) {
    Lv.pB.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg, kind, own, life: o.life || 100, g: o.g || 0, pierce: !!o.pierce, homing: !!o.homing, hit: new Set() });
  }
  // lightning: jitter the straight hops so the arc reads as electricity
  function zigzag(pts) {
    const out = [pts[0], pts[1]];
    for (let i = 2; i < pts.length; i += 2) {
      const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1], n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 14));
      for (let k = 1; k < n; k++) out.push(x0 + (x1 - x0) * k / n + (Math.random() - 0.5) * 9, y0 + (y1 - y0) * k / n + (Math.random() - 0.5) * 9);
      out.push(x1, y1);
    }
    return out;
  }
  // T weapon: hits the nearest target in front, then jumps to up to 3 more nearby targets
  function chainLightning(p, mx, my, dmg) {
    const hit = new Set(), pts = [mx, my];
    let cx = mx, cy = my, range = 170;
    for (let k = 0; k < 4; k++) {
      let best = null, bd = range * range;
      const consider = (x, y, enemy, part) => {
        const dx = x - cx, dy = y - cy;
        if (k === 0 && dx * p.aimX + dy * p.aimY < 0) return;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = { x, y, enemy, part }; }
      };
      for (const e of Lv.enemies) if (!e.remove && !e.passive && !hit.has(e) && onScreen(e)) consider(e.x + e.w / 2, e.y + e.h / 2, e, null);
      const boss = Lv.boss;
      if (boss && boss.alive) for (const pt of bossParts(boss)) if (!pt.armored && !hit.has(pt.id)) consider(pt.x + pt.w / 2, pt.y + pt.h / 2, null, pt);
      if (!best) break;
      pts.push(best.x, best.y); cx = best.x; cy = best.y; range = 100;
      if (best.part) { hit.add(best.part.id); damageBoss(Lv.boss, best.part, dmg, p.pr); }
      else { hit.add(best.enemy); damageEnemy(best.enemy, dmg, p.pr); }
      if (Lv.boss && !Lv.boss.alive) break;
    }
    if (pts.length === 2) for (let i = 1; i <= 4; i++) pts.push(mx + p.aimX * i * 18, my + p.aimY * i * 18);
    Lv.bolts.push({ pts: zigzag(pts), life: 7, small: true });
  }
  function fire(p) {
    const pr = p.pr, rate = pr.rapid ? 0.6 : 1, [mx, my] = muzzle(p), a = Math.atan2(p.aimY, p.aimX);
    const ch = CHARS[p.ci], mul = ch.dmgMul || 1, spd = ch.shotSpeed || 1, n0 = Lv.pB.length, bolts0 = Lv.bolts.length;
    p.flash = 4;
    switch (pr.weapon) {
      case 'S': for (const d of [-0.28, -0.14, 0, 0.14, 0.28]) shot(mx, my, a + d, 5.2 * spd, mul, 'S', pr); p.fireCd = 15 * rate; SFX.spread(); break;
      case 'L': shot(mx, my, a, 9 * spd, 4 * mul, 'L', pr, { pierce: true }); p.fireCd = 20 * rate; SFX.laser(); break;
      case 'H': shot(mx, my, a - 0.4, 2.6 * spd, 2 * mul, 'H', pr, { homing: true }); shot(mx, my, a + 0.4, 2.6 * spd, 2 * mul, 'H', pr, { homing: true }); p.fireCd = 18 * rate; SFX.missile(); break;
      case 'F':
        for (let i = 0; i < 2; i++) shot(mx, my, a + (Math.random() - 0.5) * 0.32, (3.6 + Math.random() * 1.4) * spd, 0.25 * mul, 'F', pr, { pierce: true, life: 20 + (Math.random() * 6 | 0) });
        p.fireCd = 3 * rate; SFX.flame(); p.flash = 2; break;
      case 'B': shot(mx, my, p.aimY === 0 ? a - 0.35 * p.facing : a, 4.6 * spd, 5 * mul, 'B', pr, { g: 0.16, life: 140 }); p.fireCd = 28 * rate; SFX.lob(); break;
      case 'T': chainLightning(p, mx, my, 2 * mul); p.fireCd = 13 * rate; SFX.zap(); break;
      default: shot(mx, my, a, 6.2 * spd, mul, 'P', pr); p.fireCd = 9 * rate; SFX.shoot();
    }
    const [tx, ty] = gunTip(p);
    for (let i = n0; i < Lv.pB.length; i++) { const b = Lv.pB[i]; b.ox = tx - mx; b.oy = ty - my; b.ok = GLIDE; }
    if (Lv.bolts.length > bolts0) { const bl = Lv.bolts[Lv.bolts.length - 1]; bl.pts[0] = tx; bl.pts[1] = ty; }
  }

  function updatePlayer(p, idx) {
    const I = inp(p.slot), K = I.k, PR = I.p, pr = p.pr, ch = CHARS[p.ci];
    if (p.ghost) { updateGhost(p, idx); return; }
    if (p.dead) { if (--p.deadT <= 0) respawn(p, idx); return; }
    if (p.invuln > 0) p.invuln--; if (p.fireCd > 0) p.fireCd--; if (p.flash > 0) p.flash--; if (p.dashCd > 0) p.dashCd--; if (p.dropT > 0) p.dropT--; if (p.shieldT > 0) p.shieldT--;
    const hx = (K.right ? 1 : 0) - (K.left ? 1 : 0), U = K.up, D = K.down;
    if (hx && p.dashT <= 0) p.facing = hx;
    setCrouch(p, D && p.onGround && !hx && p.dashT <= 0);

    if (PR.dash && p.dashCd <= 0 && p.dashT <= 0) {
      setCrouch(p, false);
      p.dashT = ch.dashHit ? 14 : 12; p.dashCd = ch.dashCd || 42; p.vy = 0; p.dashHits = new Set(); SFX.dash();
      for (let i = 0; i < 6; i++) particle(p.x + p.w / 2, p.y + p.h - 2, -p.facing * Math.random() * 2, -Math.random(), 14, '#d8d2f0', 2);
    }
    if (p.dashT > 0) {
      p.dashT--; p.vx = p.facing * 5; p.vy = 0;
      if (p.dashT % 2 === 0) Lv.trail.push({ ci: p.ci, x: p.x + p.w / 2, y: p.y + p.h, facing: p.facing, aimX: p.aimX, aimY: p.aimY, life: 12 });
    } else {
      const target = p.crouch ? 0 : hx * ch.speed;
      const acc = Lv.d.ice && p.onGround ? 0.085 : 0.5;
      p.vx += (target - p.vx) * acc; if (Math.abs(p.vx) < 0.05) p.vx = 0;
      p.vy = Math.min(p.vy + grav(), 7);
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
    if (p.dashT > 0 && ch.dashHit && p.dashHits) {
      const box = { x: p.x - 3, y: p.y, w: p.w + 6, h: p.h };
      for (const e of Lv.enemies) if (!e.remove && !e.passive && !p.dashHits.has(e) && overlap(box, e)) { p.dashHits.add(e); damageEnemy(e, 4, pr); spark(e.x + e.w / 2, e.y + e.h / 2, '#ff3b4f'); }
      const bs = Lv.boss;
      if (bs && bs.alive) for (const pt of bossParts(bs)) if (!pt.armored && !p.dashHits.has(pt.id) && overlap(box, pt)) { p.dashHits.add(pt.id); damageBoss(bs, pt, 4, pr); }
    }
    if (p.x < Lv.camX) { p.x = Lv.camX; if (p.vx < 0) p.vx = 0; }
    if (p.x + p.w > Lv.camX + W) p.x = Lv.camX + W - p.w;
    const b = Lv.boss;
    if (b && b.type === 'core' && b.alive && p.x + p.w > b.x - 14) p.x = b.x - 14 - p.w;

    let ax = hx, ay = U ? -1 : (D && (!p.onGround || hx) ? 1 : 0);
    if (p.crouch) { ax = p.facing; ay = 0; }
    if (!ax && !ay) ax = p.facing;
    const n = Math.hypot(ax, ay); p.aimX = ax / n; p.aimY = ay / n;
    if ((K.fire || pr.auto) && p.fireCd <= 0 && p.dashT <= 0) fire(p);   // pr.auto: tự bắn, no need to hold fire
    if (PR.super && G.storm >= 100) triggerStorm(p);
    if (p.onGround && Math.abs(p.vx) > 0.3) p.anim++;

    const deathY = Lv.vertical ? Lv.camY + H + 10 : HAZARD_Y;
    if (p.y + p.h > deathY) {
      for (let i = 0; i < 10; i++) if (!Lv.vertical) particle(p.x + p.w / 2, HAZARD_Y, (Math.random() - 0.5) * 3, -Math.random() * 3, 24, Lv.theme === 'forge' ? '#ffb43d' : Lv.theme === 'moon' ? '#c8c4e0' : '#9fc0ff', 2, 0.15);
      killPlayer(p);
    }
    for (const it of Lv.items) if (!it.remove && overlap(p, it)) applyPickup(p, it);
    updateBuddy(p);
  }

  function applyPickup(p, it) {
    const pr = p.pr;
    {
      it.remove = true; SFX.power(); addScore(it.kind in SUPPORT ? 200 : 500, pr);
      const tx = p.x + 5, ty = p.y - 8;
      if (it.kind === 'R') { pr.rapid = true; floatText(tx, ty, 'BẮN NHANH', JADE); }
      else if (it.kind === 'A') { p.hp = Math.min(p.hp + 1, p.maxHp + 1); floatText(tx, ty, 'GIÁP +1', VOLT); }
      else if (it.kind === 'Z') { p.shieldT = 480; floatText(tx, ty, 'KHIÊN NĂNG LƯỢNG', '#5fd0ff'); }
      else if (it.kind === 'M') { pr.lives++; floatText(tx, ty, '+1 MẠNG', '#ff4f86'); }
      else if (it.kind === 'E') { chargeStorm(50); floatText(tx, ty, 'PIN BÃO LỬA', EMBER); }
      else { pr.weapon = it.kind; floatText(tx, ty, WEAPON_NAME[it.kind], JADE); }
    }
  }

  function updateGhost(p, idx) {
    p.gx = clamp(p.gx, Lv.camX + 14, Lv.camX + W - 14);
    p.gy = (Lv.mode === 'base' ? -70 : Lv.camY + 74) + Math.sin(Lv.t * 0.05 + p.pr.num) * 5;
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
    if (p.shieldT > 0) { spark(p.x + 5, p.y + 10, '#9fe8ff'); return; }
    if (--p.hp > 0) { p.invuln = 90; SFX.hurt(); Lv.shake = 5; floatText(p.x + 5, p.y - 8, 'MẤT GIÁP', BLOOD); spark(p.x + 5, p.y + 8, VOLT); return; }
    killPlayer(p);
  }
  function killPlayer(p) {
    if (p.dead || p.ghost) return;
    p.dead = true; p.deadT = 80; SFX.hurt(); p.pr.deaths++;
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
      p.dead = false; p.ghost = true; p.gx = p.x + p.w / 2; p.gy = Lv.mode === 'base' ? -70 : Lv.camY + 74; p.reviveT = 0;
      if (Lv.players.every(q => q.ghost)) { saveHi(); state = 'over'; stateT = 0; SFX.music('title'); requestRecap('over'); }
      return;
    }
    pr.lives--;
    if (Lv.mode === 'base') { Lv.players[idx] = newPlayer(pr, clamp(p.x, 40, W - 50), 0); return; }
    if (Lv.vertical) {
      // drop back in above the highest ledge that is comfortably inside the view
      let pos = [W / 2, Lv.camY + 40];
      outer: for (let r = Math.floor(Lv.camY / T) + 5; r < Math.floor((Lv.camY + H) / T) - 2; r++) for (let c = 3; c < Lv.cols - 3; c++) {
        const v = tileAt(c, r); if ((v === 1 || v === 2) && !tileAt(c, r - 1) && !tileAt(c, r - 2)) { pos = [c * T + 3, r * T - 40]; break outer; }
      }
      Lv.players[idx] = newPlayer(pr, pos[0], pos[1]); return;
    }
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
    if (s.kind === 'capsule') { const base = Lv.camY + 40 + Math.random() * 30; list.push({ type: 'capsule', x: Lv.camX - 18, y: base, base, w: 16, h: 10, hp: 1, t: 0, weapon: s.weapon, flash: 0 }); return; }
    if (s.kind === 'drone') { list.push({ type: 'drone', x, y: s.row * T, base: s.row * T, w: 14, h: 10, hp: 2, t: Math.random() * 100, mode: 'patrol', vx: -0.8, vy: 0, fireT: 90 + Math.random() * 60, flash: 0 }); return; }
    if (s.kind === 'geyser') { list.push({ type: 'geyser', x: x + 4, y: 236, w: 8, h: 8, t: Math.floor(Math.random() * 80), passive: true }); return; }
    if (s.kind === 'icicle') { list.push({ type: 'icicle', x: x + 8, y: 2, w: 8, h: 16, passive: true, fallT: 0 }); return; }
    const top = Lv.vertical ? s.row : solidTop(s.col); if (top < 0) return;
    if (s.kind === 'turret') list.push({ type: 'turret', x, y: top * T - 12, w: 16, h: 12, hp: 6, ang: Math.PI, fireT: 60 + Math.random() * 60, flash: 0 });
    else if (s.kind === 'soldier') spawnSoldier(x, top * T - 20, -1);
    else if (s.kind === 'shield') list.push({ type: 'shield', x, y: top * T - 20, w: 12, h: 20, hp: 5, vx: 0, vy: 0, face: -1, turnT: 0, shootT: 80 + Math.random() * 60, stopT: 0, anim: 0, flash: 0, muzzle: 0 });
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
            if (onScreen(e) && e.onGround && --e.shootT <= 0) { e.stopT = 26; e.shootT = (110 + Math.random() * 90) * DF().eFire; }
          }
          e.vy = Math.min(e.vy + grav(), 7); physics(e, false);
          if (e.hitWall && e.onGround) e.vy = -4.6;
          if (e.dir > 0 && e.x > Lv.camX + W + 80) e.remove = true;
          break;
        case 'shield': {
          e.anim++; if (e.muzzle > 0) e.muzzle--;
          if (--e.turnT <= 0) { e.turnT = 40; e.face = px < e.x ? -1 : 1; }
          if (e.stopT > 0) {
            e.stopT--; e.vx = 0;
            if (e.stopT === 8 && alive) { enemyShot(e.x + e.w / 2 + e.face * 10, e.y + 8, px, py, 2.4); e.muzzle = 5; }
          } else {
            e.vx = onScreen(e) && Math.abs(px - e.x) > 70 ? e.face * 0.55 : 0;
            if (onScreen(e) && e.onGround && --e.shootT <= 0) { e.stopT = 22; e.shootT = (120 + Math.random() * 80) * DF().eFire; }
          }
          e.vy = Math.min(e.vy + grav(), 7); physics(e, false);
          break;
        }
        case 'icicle':
          if (!e.fallT) { if (Lv.players.some(q => !q.dead && !q.ghost && Math.abs(q.x + q.w / 2 - e.x) < 34)) e.fallT = 26; }
          else if (--e.fallT <= 0) { Lv.eB.push({ x: e.x, y: 12, vx: 0, vy: 1, g: 0.3, r: 5, kind: 'ice', life: 200 }); e.remove = true; SFX.crack(); }
          break;
        case 'turret': {
          const tx = e.x + 8, ty = e.y + 4, want = Math.atan2(py - ty, px - tx);
          let d = want - e.ang; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
          e.ang += clamp(d, -0.05, 0.05);
          if (onScreen(e) && --e.fireT <= 0) {
            e.fireT = (100 + Math.random() * 40) * DF().eFire;
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
            if (Lv.bossState !== 'none' && ((e.x < Lv.camX + 4 && e.vx < 0) || (e.x > Lv.camX + W - 18 && e.vx > 0))) e.vx = -e.vx;
          } else if (e.mode === 'dive') { e.x += e.vx; e.y += e.vy; if (--e.mt <= 0) { e.mode = 'leave'; e.vx = -1.2; e.vy = -1.4; } }
          else { e.x += e.vx; e.y += e.vy; if (e.y < -30) e.remove = true; }
          if (onScreen(e) && --e.fireT <= 0) { e.fireT = (130 + Math.random() * 60) * DF().eFire; if (alive) enemyShot(e.x + 7, e.y + 8, px, py, 2); }
          break;
        case 'hopper':
          if (e.onGround) {
            e.vx *= 0.7;
            if (--e.jumpT <= 0 && onScreen(e)) { e.face = px < e.x ? -1 : 1; e.vy = -4.3; e.vx = e.face * 1.8; e.jumpT = 45 + Math.random() * 35; }
          }
          e.vy = Math.min(e.vy + grav(), 7); physics(e, false);
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
      if (e.type !== 'capsule' && (e.x + e.w < Lv.camX - 80 || e.y > Lv.camY + H + 20)) e.remove = true;
      if (!e.passive && e.type !== 'capsule' && !e.remove) hitPlayers(e);
    }
  }

  function damageEnemy(e, dmg, own) {
    if (e.remove) return;
    e.hp -= dmg; e.flash = 3; SFX.hit();
    if (e.hp > 0) return;
    e.remove = true;
    if (own && e.type !== 'capsule') own.kills++;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    boom(cx, cy, e.type === 'turret' ? 1.6 : 1);
    addScore(SCORE[e.type] || 100, own, cx, cy - 10);
    chargeStorm((SCORE[e.type] || 100) / 40);
    if (e.type === 'capsule') Lv.items.push({ x: cx - 6, y: cy, w: 12, h: 10, vx: 0, vy: -3, kind: e.weapon, life: 0 });
    else maybeDrop(cx, cy, e.type === 'turret' ? 2 : 1);
  }
  // occasional support drop from a defeated enemy (more on Easy, fewer on Hard)
  function maybeDrop(x, y, k) {
    if (Lv.items.length >= 3) return;
    const m = k * ({ easy: 1.5, hard: 0.6 }[DF().id] || 1), r = Math.random();
    const kind = r < 0.035 * m ? 'A' : r < 0.05 * m ? 'Z' : r < 0.07 * m ? 'E' : null;
    if (kind) Lv.items.push({ x: x - 6, y, w: 12, h: 10, vx: 0, vy: -3, kind, life: 0 });
  }

  // ---------- bosses ----------
  function spawnBoss() {
    const ax = Lv.arenaX, gy = Lv.groundY, type = Lv.d.boss, mult = (1 + 0.5 * (G.players.length - 1)) * DF().boss;
    let b;
    if (type === 'crab') b = { name: DAILY.BOSS_NAMES.crab, x: ax + W + 10, y: gy - 46, w: 84, h: 46, hp: 150, vx: 0, vy: 0, mode: 'enter', modeT: 0, face: -1, shootT: 70, cycles: 0, targetX: ax + W - 130, mortarT: 160 };
    if (type === 'core') {
      const x = ax + W - 108, th = Math.round(28 * mult);
      b = { name: DAILY.BOSS_NAMES.core, x, y: gy - 170, w: 108, h: 170, hp: 170, mode: 'closed', modeT: 0, openAmt: 0, spin: 0, cx: x + 60, cy: gy - 92, rise: 170,
        turrets: [{ x: x + 2, y: gy - 146, hp: th, fireT: 40, ang: Math.PI, alive: true, flash: 0 }, { x: x + 2, y: gy - 34, hp: th, fireT: 80, ang: Math.PI, alive: true, flash: 0 }] };
    }
    if (type === 'idol') b = { name: DAILY.BOSS_NAMES.idol, cx: 240, cy: 64, hp: 220, mode: 'closed', modeT: 0, mouth: 0, fireT: 90, rise: 0,
      hands: [-1, 1].map(side => ({ side, x: 240 + side * 150, y: 110, hp: Math.round(40 * mult), alive: true, state: 'hover', t: side > 0 ? 70 : 0, flash: 0, vy: 0, tx: 240 })) };
    if (type === 'mammoth') b = { name: DAILY.BOSS_NAMES.mammoth, x: ax + W + 10, y: gy - 54, w: 104, h: 54, hp: 200, vx: 0, vy: 0, mode: 'enter', modeT: 0, face: -1, shootT: 80, cycles: 0, targetX: ax + W - 150 };
    if (type === 'eye') b = { name: DAILY.BOSS_NAMES.eye, cx: ax + W + 80, cy: 70, hp: 300, mode: 'enter', modeT: 0, rot: 0, beamT: 120, spawnT: 300, ringT: 90, lookX: ax + W / 2, lookY: 150 };
    if (type === 'serpent') b = { name: DAILY.BOSS_NAMES.serpent, hp: 240, hx: ax + W + 60, hy: 60, pt: 0, mode: 'fly', modeT: 0, hist: [], segs: [], fireT: 90, bombT: 120, face: -1, jaw: 0 };
    b.hp = Math.round(b.hp * mult);
    Object.assign(b, { type, maxHp: b.hp, t: 0, flash: 0, alive: true, dying: 0 });
    Lv.boss = b;
  }

  function bossParts(b) {
    if (b.type === 'crab') return [{ x: b.x + 6, y: b.y + 4, w: b.w - 12, h: b.h - 8, id: 'body' }];
    if (b.type === 'mammoth') return [{ x: b.x + 8, y: b.y + 4, w: b.w - 16, h: b.h - 8, id: 'body' }];
    if (b.type === 'idol') {
      const arr = b.hands.filter(hd => hd.alive).map((hd, i) => ({ x: hd.x - 16, y: hd.y - 14, w: 32, h: 28, id: 'hand' + hd.side, tur: hd }));
      arr.push({ x: b.cx - 18, y: b.cy + 14, w: 36, h: 26, id: 'mouth', armored: b.mouth < 0.8 });
      arr.push({ x: b.cx - 60, y: b.cy - 46, w: 120, h: 58, id: 'head', armored: true });
      return arr;
    }
    if (b.type === 'eye') {
      const arr = [];
      for (let i = 0; i < 4; i++) { const a = b.rot + i * Math.PI / 2; arr.push({ x: b.cx + Math.cos(a) * 46 - 12, y: b.cy + Math.sin(a) * 46 - 12, w: 24, h: 24, id: 'plate' + i, armored: true }); }
      arr.push({ x: b.cx - 24, y: b.cy - 24, w: 48, h: 48, id: 'core' });
      return arr;
    }
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
      b.hp = 0; b.alive = false; b.dying = 160; Lv.eB = []; Lv.beams = []; Lv.bossState = 'dying';
      SFX.bigBoom(); Lv.shake = 12; addScore(10000, own); if (own) own.bosses++;
    }
  }

  function bossCenter(b) {
    if (b.type === 'crab' || b.type === 'mammoth') return [b.x + b.w / 2, b.y + b.h / 2];
    if (b.type === 'core') return [b.cx, b.cy + b.rise];
    if (b.type === 'eye' || b.type === 'idol') return [b.cx, b.cy];
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

    else if (b.type === 'mammoth') {
      const cx = b.x + b.w / 2, ph2 = b.hp < b.maxHp * 0.5;
      const pickTarget = () => { b.targetX = ax + 20 + Math.random() * (W - b.w - 40); };
      b.modeT++;
      if (b.mode === 'enter') { b.vx = -1; if (b.x <= b.targetX) { b.mode = 'walk'; b.modeT = 0; pickTarget(); } }
      else if (b.mode === 'walk') {
        b.face = px < cx ? -1 : 1;
        const d = b.targetX - b.x; b.vx = Math.abs(d) < 2 ? 0 : Math.sign(d) * (ph2 ? 1.3 : 0.9);
        if (--b.shootT <= 0) {
          b.shootT = ph2 ? 55 : 80;
          if (alive) {
            const ox = cx + b.face * 48, oy = b.y + 22, n = ph2 ? 5 : 3;
            for (let i = 0; i < n; i++) Lv.eB.push({ x: ox, y: oy, vx: (px - ox) / 55 + (i - (n - 1) / 2) * 0.55, vy: -3.6 - Math.random() * 0.6, g: 0.13, r: 4, kind: 'ice', life: 300 });
            SFX.eshot();
          }
        }
        if (Math.abs(d) < 2 || b.modeT > 160) { b.cycles++; b.modeT = 0; if (b.cycles % 2 === 0) { b.mode = 'windup'; b.vx = 0; SFX.warn(); } else pickTarget(); }
      } else if (b.mode === 'windup') {
        b.vx = 0; b.face = px < cx ? -1 : 1;
        if (b.modeT % 5 === 0) particle(cx - b.face * 40, b.y + 8, -b.face * Math.random(), -Math.random() * 1.5, 30, '#dff4ff', 3, -0.01);
        if (b.modeT > 48) { b.mode = 'charge'; b.modeT = 0; }
      } else if (b.mode === 'charge') {
        b.vx = b.face * (ph2 ? 5.2 : 4.4);
        if (b.modeT % 3 === 0) particle(cx - b.face * 50, gy - 2, -b.face * 2, -Math.random() * 2, 22, '#e8f6ff', 2, 0.1);
        if ((b.face < 0 && b.x <= ax + 6) || (b.face > 0 && b.x >= ax + W - b.w - 6)) {
          b.mode = 'stun'; b.modeT = 0; b.vx = 0; Lv.shake = 12; SFX.boom();
          for (let i = 0; i < (ph2 ? 9 : 6); i++) Lv.eB.push({ x: ax + 20 + Math.random() * (W - 40), y: -10 - Math.random() * 40, vx: 0, vy: 0, g: 0.22, r: 5, kind: 'ice', life: 300 });
        }
      } else if (b.mode === 'stun') { b.vx = 0; if (b.modeT > 75) { b.mode = 'walk'; b.modeT = 0; pickTarget(); } }
      b.x += b.vx;
      if (b.mode !== 'enter') b.x = clamp(b.x, ax + 4, ax + W - b.w - 4);
      b.y = gy - b.h;
      hitPlayers({ x: b.x + 8, y: b.y + 10, w: b.w - 16, h: b.h - 10 });
    }

    else if (b.type === 'idol') {
      const ph2 = b.hp < b.maxHp * 0.5 || b.hands.every(hd => !hd.alive);
      b.modeT++;
      if (b.mode === 'closed') {
        b.mouth = Math.max(0, b.mouth - 0.05);
        if (b.modeT > (ph2 ? 150 : 210)) { b.mode = 'open'; b.modeT = 0; SFX.warn(); Lv.shake = 5; }
      } else {
        b.mouth = Math.min(1, b.mouth + 0.05);
        if (b.mouth >= 1 && b.modeT % (ph2 ? 22 : 30) === 0 && alive) {
          const ox = b.cx, oy = b.cy + 28, a0 = Math.atan2(py - oy, px - ox);
          for (let i = -2; i <= 2; i++) { const a = a0 + i * 0.2; Lv.eB.push({ x: ox, y: oy, vx: Math.cos(a) * 2.4, vy: Math.sin(a) * 2.4, r: 5, kind: 'fire', g: 0, life: 300 }); }
          SFX.eshot();
        }
        if (b.modeT % 50 === 25) Lv.eB.push({ x: b.cx + (Math.random() - 0.5) * 30, y: b.cy + 30, vx: (Math.random() - 0.5) * 2.2, vy: -1.5, g: 0.16, r: 7, kind: 'rock', life: 300 });
        if (b.modeT > 130) { b.mode = 'closed'; b.modeT = 0; }
      }
      if (--b.fireT <= 0) { b.fireT = ph2 ? 60 : 90; if (alive) for (const sd of [-1, 1]) enemyShot(b.cx + sd * 30, b.cy - 14, px, py, 2.2, { kind: 'orb', r: 3 }); }
      b.hands.forEach((hd, i) => {
        if (!hd.alive) return;
        if (hd.flash > 0) hd.flash--;
        hd.t++;
        const homeX = b.cx + hd.side * 150, homeY = b.cy + 46;
        if (hd.state === 'hover') {
          hd.x += (homeX + Math.sin(hd.t * 0.03) * 20 - hd.x) * 0.06; hd.y += (homeY + Math.sin(hd.t * 0.05 + i) * 6 - hd.y) * 0.08;
          if (hd.t > (ph2 ? 140 : 200) + i * 60) { hd.state = 'raise'; hd.t = 0; hd.tx = clamp(px, 40, W - 40); }
        } else if (hd.state === 'raise') {
          hd.x += (hd.tx - hd.x) * 0.1; hd.y += (b.cy + 52 - hd.y) * 0.1;
          if (hd.t > 34) { hd.state = 'slam'; hd.t = 0; hd.vy = 2; }
        } else if (hd.state === 'slam') {
          hd.vy += 0.6; hd.y += hd.vy;
          if (hd.y + 14 >= gy) {
            hd.y = gy - 14; hd.state = 'rest'; hd.t = 0; Lv.shake = 10; SFX.boom();
            for (const sd of [-1, 1]) Lv.eB.push({ x: hd.x + sd * 18, y: gy - 6, vx: sd * 2.6, vy: 0, r: 6, kind: 'wave', g: 0, life: 160 });
          }
        } else if (hd.t > 45) { hd.state = 'hover'; hd.t = 0; }
        hitPlayers({ x: hd.x - 14, y: hd.y - 12, w: 28, h: 24 });
      });
    }

    else if (b.type === 'eye') {
      const ph2 = b.hp < b.maxHp * 0.5;
      b.modeT++;
      const tx = ax + W / 2 + 40 + Math.cos(b.t * 0.008) * 110, ty = 74 + Math.sin(b.t * 0.016) * 26;
      b.cx += (tx - b.cx) * (b.mode === 'enter' ? 0.03 : 0.04); b.cy += (ty - b.cy) * 0.04;
      if (b.mode === 'enter' && b.modeT > 90) b.mode = 'fight';
      b.rot += ph2 ? 0.03 : 0.018;
      b.lookX += (px - b.lookX) * 0.1; b.lookY += (py - b.lookY) * 0.1;
      if (b.mode === 'fight') {
        if (--b.beamT <= 0) {
          b.beamT = ph2 ? 150 : 210;
          const targets = alivePlayers(), shots = ph2 ? 2 : 1;
          for (let k = 0; k < shots && targets.length; k++) {
            const tg = targets[k % targets.length];
            let a = Math.atan2(tg.y + tg.h / 2 - b.cy, tg.x + tg.w / 2 - b.cx);
            if (k > 0 && targets.length === 1) a += 0.35;
            Lv.beams.push({ x1: b.cx, y1: b.cy, a, len: 640, warn: 50, fire: 22 });
          }
          SFX.warn();
        }
        if (--b.spawnT <= 0) {
          b.spawnT = 420;
          if (Lv.enemies.filter(e => e.type === 'drone').length < 3) for (const sd of [-1, 1]) Lv.enemies.push({ type: 'drone', x: b.cx + sd * 30, y: b.cy, base: b.cy + 20 + Math.random() * 40, w: 14, h: 10, hp: 2, t: 0, mode: 'patrol', vx: sd * 0.8, vy: 0, fireT: 80, flash: 0 });
        }
        if (ph2 && --b.ringT <= 0) {
          b.ringT = 100;
          for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + b.rot; Lv.eB.push({ x: b.cx, y: b.cy, vx: Math.cos(a) * 1.7, vy: Math.sin(a) * 1.7, r: 3, kind: 'orb', g: 0, life: 400 }); }
        }
      }
      hitPlayers({ x: b.cx - 22, y: b.cy - 22, w: 44, h: 44 });
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
  function blast(x, y, rad, dmg, own) {
    boom(x, y, rad / 22);
    for (const e of Lv.enemies) {
      if (e.remove || e.passive) continue;
      const dx = e.x + e.w / 2 - x, dy = e.y + e.h / 2 - y, rr = rad + Math.max(e.w, e.h) / 2;
      if (dx * dx + dy * dy < rr * rr) damageEnemy(e, dmg, own);
    }
    const boss = Lv.boss;
    if (boss && boss.alive) for (const pt of bossParts(boss)) {
      if (pt.armored) continue;
      const cx = clamp(x, pt.x, pt.x + pt.w), cy = clamp(y, pt.y, pt.y + pt.h);
      if ((cx - x) ** 2 + (cy - y) ** 2 < rad * rad) { damageBoss(boss, pt, dmg, own); if (!boss.alive) break; }
    }
  }
  // B weapon: the bomb bursts, then four bomblets arc out and burst again
  function explodeBomb(b) {
    b.dead = true;
    if (b.kind === 'B') {
      blast(b.x, b.y, 30, b.dmg, b.own);
      for (let i = 0; i < 4; i++) shot(b.x, b.y - 4, -Math.PI / 2 + (i - 1.5) * 0.45, 3.2, b.dmg * 0.4, 'b', b.own, { g: 0.18, life: 70 });
    } else blast(b.x, b.y, 18, b.dmg, b.own);
  }
  const isBomb = b => b.kind === 'B' || b.kind === 'b';
  const segDist = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1, k = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(px - (x1 + dx * k), py - (y1 + dy * k));
  };

  function nearestTarget(x, y, range = 260) {
    let best = null, bd = range * range;
    for (const e of Lv.enemies) {
      if (e.remove || e.passive || !onScreen(e)) continue;
      const dx = e.x + e.w / 2 - x, dy = e.y + e.h / 2 - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { x: e.x + e.w / 2, y: e.y + e.h / 2 }; }
    }
    const b = Lv.boss;
    if (b && b.alive) for (const pt of bossParts(b)) {
      if (pt.armored && b.type === 'eye') continue;
      const cx = pt.x + pt.w / 2, cy = pt.y + pt.h / 2, dx = cx - x, dy = cy - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { x: cx, y: cy }; }
    }
    return best;
  }
  const hitsBox = (b, e) => b.x >= e.x - 3 && b.x <= e.x + e.w + 3 && b.y >= e.y - 3 && b.y <= e.y + e.h + 3;

  function updateBullets() {
    for (const b of Lv.pB) {
      if (--b.life <= 0) { if (isBomb(b)) explodeBomb(b); b.dead = true; continue; }
      if (b.ok > 0) b.ok--;
      if (b.g) b.vy += b.g;
      if (b.homing) {
        const tg = nearestTarget(b.x, b.y);
        let cur = Math.atan2(b.vy, b.vx); const sp = Math.min(5.5, Math.hypot(b.vx, b.vy) + 0.15);
        if (tg) { let d = Math.atan2(tg.y - b.y, tg.x - b.x) - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; cur += clamp(d, -0.13, 0.13); }
        b.vx = Math.cos(cur) * sp; b.vy = Math.sin(cur) * sp;
        if (frame % 2) particle(b.x, b.y, 0, 0, 12, '#8a8296', 1);
      }
      b.x += b.vx; b.y += b.vy;
      if (b.x < Lv.camX - 20 || b.x > Lv.camX + W + 20 || b.y < Lv.camY - 20 || b.y > Lv.camY + H + 20) { b.dead = true; continue; }
      if (tileAt(Math.floor(b.x / T), Math.floor(b.y / T)) === 1) { if (isBomb(b)) explodeBomb(b); else spark(b.x, b.y); b.dead = true; continue; }
      for (const e of Lv.enemies) {
        if (e.remove || e.passive || b.hit.has(e) || !hitsBox(b, e)) continue;
        if (isBomb(b)) { explodeBomb(b); break; }
        if (e.type === 'shield' && b.kind !== 'L' && Math.sign(b.vx) === -e.face && Math.abs(b.vx) > Math.abs(b.vy) * 0.5) {
          b.dead = true; spark(b.x, b.y, '#9fd8ff'); SFX.ting(); break;
        }
        damageEnemy(e, b.dmg, b.own);
        if (b.pierce) b.hit.add(e); else { b.dead = true; spark(b.x, b.y); if (b.kind === 'H') boom(b.x, b.y, 0.5, true); break; }
      }
      const boss = Lv.boss;
      if (!b.dead && boss && boss.alive) for (const pt of bossParts(boss)) {
        if (b.hit.has(pt.id) || !hitsBox(b, pt)) continue;
        if (isBomb(b)) { explodeBomb(b); break; }
        if (pt.armored) { b.dead = true; spark(b.x, b.y, '#cfd3e6'); SFX.ting(); break; }
        damageBoss(boss, pt, b.dmg, b.own);
        if (b.pierce) b.hit.add(pt.id); else { b.dead = true; spark(b.x, b.y); if (b.kind === 'H') boom(b.x, b.y, 0.5, true); }
        break;
      }
    }
    Lv.pB = Lv.pB.filter(b => !b.dead);

    for (const b of Lv.eB) {
      b.vy += b.g; b.x += b.vx; b.y += b.vy;
      if (--b.life <= 0 || b.x < Lv.camX - 40 || b.x > Lv.camX + W + 40 || b.y > Lv.camY + H + 20 || b.y < Lv.camY - 80) { b.dead = true; continue; }
      if (b.kind !== 'fire' && b.kind !== 'wave' && b.kind !== 'rock' && tileAt(Math.floor(b.x / T), Math.floor(b.y / T)) === 1) {
        b.dead = true; if (b.kind === 'bomb') boom(b.x, b.y - 4, 0.8); else spark(b.x, b.y, b.kind === 'ice' ? '#d8f4ff' : '#ff8a9a'); continue;
      }
      if (b.kind === 'wave' && frame % 3 === 0) particle(b.x, b.y + 4, -b.vx * 0.2, -Math.random(), 12, VOLT, 2);
      const box = { x: b.x - b.r + 1, y: b.y - b.r + 1, w: b.r * 2 - 2, h: b.r * 2 - 2 };
      for (const p of Lv.players) {
        if (!p.dead && !p.ghost && p.shieldT > 0 && overlap({ x: p.x - 6, y: p.y - 6, w: p.w + 12, h: p.h + 10 }, box)) { b.dead = true; spark(b.x, b.y, '#9fe8ff'); SFX.ting(); break; }
        if (p.dead || p.ghost || p.invuln > 0 || p.dashT > 0 || !overlap(hurtbox(p), box)) continue;
        b.dead = true; hurtPlayer(p); break;
      }
    }
    Lv.eB = Lv.eB.filter(b => !b.dead);
  }

  function updateItems() {
    for (const it of Lv.items) {
      it.life++; it.vy = Math.min(it.vy + 0.15, 3); physics(it, false);
      if (it.y > Lv.camY + H || it.life > 540) it.remove = true;
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
  function checkStageEnd(L) {
    if (L.bossState === 'done' && state === 'play' && --L.endT <= 0) {
      state = 'clear'; stateT = 0; SFX.music('win');
      for (const pr of G.players) pr.score += (pr.lives + 1) * 1000;
      saveHi();
    }
  }
  function stepFx(L) {
    for (const q of L.parts) { q.x += q.vx; q.y += q.vy; q.vy += q.g; q.life--; }
    L.parts = L.parts.filter(q => q.life > 0);
    for (const r of L.rings) r.life--; L.rings = L.rings.filter(r => r.life > 0);
    for (const t of L.trail) t.life--; L.trail = L.trail.filter(t => t.life > 0);
    for (const b of L.bolts) b.life--; L.bolts = L.bolts.filter(b => b.life > 0);
    for (const t of L.texts) { t.life--; t.y -= 0.4; } L.texts = L.texts.filter(t => t.life > 0);
    if (L.flashT > 0) L.flashT--;
    L.shake *= 0.86; if (L.shake < 0.3) L.shake = 0;
  }

  function stepPlay() {
    const L = Lv;
    L.t++;
    if (L.introT > 0) L.introT--;
    if (L.mode === 'base') { stepBase(L); checkStageEnd(L); stepFx(L); return; }
    for (let i = 0; i < L.players.length; i++) updatePlayer(L.players[i], i);
    if (state !== 'play' && state !== 'clear') return;

    const al = alivePlayers();
    if (L.bossState === 'none' && L.vertical) {
      // climbing: the view rises with the highest player but never leaves the lowest one behind
      if (al.length) {
        const top = Math.min(...al.map(p => p.y)), low = Math.max(...al.map(p => p.y + p.h));
        const target = Math.max(top - H * 0.42, low - H + 24);
        if (target < L.camY) L.camY = Math.max(0, target);
      }
      while (L.spawnIdx < L.spawns.length && L.spawns[L.spawnIdx].row * T > L.camY - 24) spawnEntity(L.spawns[L.spawnIdx++]);
      if (L.d.rockfall && al.length && --L.rockT <= 0) {
        L.rockT = (110 + Math.random() * 90) * DF().spawn;
        L.eB.push({ x: 40 + Math.random() * (W - 80), y: L.camY - 12, vx: (Math.random() - 0.5) * 0.6, vy: 0.5, g: 0.14, r: 7, kind: 'rock', life: 400 });
      }
      if (al.some(p => p.onGround && p.y + p.h <= L.d.arenaFloor * T + 1)) { L.bossState = 'warn'; L.warnT = 150; SFX.music('boss'); SFX.warn(); }
    } else if (L.bossState === 'none') {
      if (al.length) {
        const front = Math.max(...al.map(p => p.x)), rear = Math.min(...al.map(p => p.x));
        const target = Math.min(front - W * 0.42, rear - 6);
        if (target > L.camX) L.camX = Math.min(target, L.arenaX);
      }
      while (L.spawnIdx < L.spawns.length && L.spawns[L.spawnIdx].col * T < L.camX + W + 24) spawnEntity(L.spawns[L.spawnIdx++]);
      if (al.length && --L.soldierT <= 0) {
        L.soldierT = (150 + Math.random() * 140) / Math.sqrt(G.players.length) * DF().spawn;
        const fromLeft = Math.random() < 0.2 && L.camX > 40, x = fromLeft ? L.camX - 12 : L.camX + W + 4, top = solidTop(Math.floor((x + 5) / T));
        if (top >= 0 && L.enemies.filter(e => e.type === 'soldier').length < 4 + G.players.length) spawnSoldier(x, top * T - 20, fromLeft ? 1 : -1);
      }
      if (L.camX >= L.arenaX) { L.bossState = 'warn'; L.warnT = 150; SFX.music('boss'); SFX.warn(); }
    } else if (L.bossState === 'warn') {
      if (L.warnT % 40 === 0) SFX.warn();
      if (--L.warnT <= 0) { L.bossState = 'fight'; spawnBoss(); }
    }
    checkStageEnd(L);
    if (L.vertical && L.bossState !== 'none' && L.camY > 0) L.camY = Math.max(0, L.camY - 2);   // settle on the arena

    if (L.stormT > 0) {
      L.stormT--;
      for (let i = 0; i < 3; i++) particle(L.camX + Math.random() * W, L.camY - 4, -0.6, 4 + Math.random() * 2, 50, Math.random() < 0.5 ? EMBER : VOLT, 2);
      if (L.stormT % 10 === 0) {
        const vis = L.enemies.filter(e => !e.remove && !e.passive && onScreen(e));
        if (vis.length) { const e = vis[Math.floor(Math.random() * vis.length)]; bolt(e.x + e.w / 2, e.y + e.h / 2); damageEnemy(e, 4); }
        else bolt(L.camX + 30 + Math.random() * (W - 60), L.camY + 200);
        SFX.missile();
      }
    }

    const nB = L.eB.length;
    updateEnemies();
    if (L.boss) updateBoss(L.boss);
    // difficulty: straight enemy shots fly slower/faster (arcing ones keep their aimed trajectory)
    const ks = DF().eSpeed;
    if (ks !== 1) for (let i = nB; i < L.eB.length; i++) { const b = L.eB[i]; if (!b.g) { b.vx *= ks; b.vy *= ks; } }
    for (const bm of L.beams) {
      const eb = L.boss;
      if (eb && eb.type === 'eye' && eb.alive) { bm.x1 = eb.cx; bm.y1 = eb.cy; }
      if (bm.warn > 0) { bm.warn--; continue; }
      if (bm.fire-- === 22) { SFX.laser(); L.shake = Math.max(L.shake, 6); }
      const x2 = bm.x1 + Math.cos(bm.a) * bm.len, y2 = bm.y1 + Math.sin(bm.a) * bm.len;
      for (const p of L.players) if (!p.dead && !p.ghost && segDist(p.x + p.w / 2, p.y + p.h / 2, bm.x1, bm.y1, x2, y2) < 10) hurtPlayer(p);
    }
    L.beams = L.beams.filter(bm => bm.warn > 0 || bm.fire > 0);
    updateBullets();
    updateItems();
    L.enemies = L.enemies.filter(e => !e.remove);

    stepFx(L);
    if (L.theme === 'forge' && frame % 9 === 0) {
      const c = Math.floor((L.camX + Math.random() * W) / T);
      if (tileAt(c, ROWS - 1) !== 1) particle(c * T + Math.random() * T, 248, 0, -0.4, 20, VOLT, 2);
    }
    updateAmbient();
  }

  // =====================================================================
  // base stage: behind-the-back corridor. x runs across the screen (0..480), z is depth into the
  // corridor (0 = the players' line, BZ = the back wall), h is height above the floor.
  // =====================================================================
  const BZ = 100;
  const baseMult = () => 1 + 0.3 * (G.players.length - 1);
  function initRoom(i) {
    const B = Lv.base, spec = Lv.d.rooms[i], m = baseMult();
    Object.assign(B, {
      room: i, phase: 'fight', t: 0, barrier: !!spec.barrier, barrierOn: false, barrierT: 90, mainOpened: false, reward: spec.reward,
      cores: spec.cores.map(x => ({ x, hp: 6 * m, alive: true, flash: 0 })),
      main: { x: 240, hp: 14 * m, alive: true, flash: 0 },
      turrets: spec.turrets.map(x => ({ x, h: 82, hp: 5 * m, alive: true, flash: 0, fireT: 80 + Math.random() * 80 })),
      soldiersLeft: spec.soldiers, soldierT: 90, rollersLeft: spec.rollers, rollerT: 200,
    });
    Lv.enemies = []; Lv.eB = []; Lv.pB = []; Lv.items = [];
  }
  function initGateRoom() {
    const B = Lv.base, m = baseMult() * DF().boss;
    Object.assign(B, {
      room: Lv.d.rooms.length, phase: 'boss', t: 0, cores: [], main: null, barrier: false, barrierOn: false, reward: null,
      turrets: [[110, 92], [370, 92], [70, 34], [410, 34]].map(([x, h]) => ({ x, h, hp: 10 * m, alive: true, flash: 0, fireT: 60 + Math.random() * 90 })),
      soldiersLeft: 999, soldierT: 140, rollersLeft: 999, rollerT: 260,
    });
    Lv.enemies = []; Lv.eB = []; Lv.pB = [];
    Lv.bossState = 'warn'; Lv.warnT = 150; SFX.music('boss'); SFX.warn();
  }
  function spawnGate() {
    const hp = Math.round(120 * (1 + 0.5 * (G.players.length - 1)) * DF().boss);
    Lv.boss = { type: 'gate', name: DAILY.BOSS_NAMES.gate, hp, maxHp: hp, alive: true, dying: 0, flash: 0, t: 0, open: 0, mode: 'closed', modeT: 0 };
  }
  // everything a player shot can hit in the corridor
  function baseTargets() {
    const B = Lv.base, out = [];
    for (const e of Lv.enemies) if (e.type === 'bsol' && !e.remove) out.push({ x: e.x, z: e.z, w: 12, h: 12, kind: 'sol', ref: e });
    for (const c of B.cores) if (c.alive) out.push({ x: c.x, z: BZ, w: 28, h: 48, kind: 'wall', ref: c });
    if (B.main && B.main.alive && B.cores.every(c => !c.alive)) out.push({ x: 240, z: BZ, w: 34, h: 40, kind: 'wall', ref: B.main });
    for (const t of B.turrets) if (t.alive) out.push({ x: t.x, z: BZ, w: 24, h: t.h, kind: 'wall', ref: t });
    const b = Lv.boss;
    if (b && b.type === 'gate' && b.alive && b.open > 0.8) out.push({ x: 240, z: BZ, w: 34, h: 48, kind: 'gate', ref: b });
    return out;
  }
  function hitBaseTarget(tg, dmg, own) {
    if (tg.kind === 'gate') { damageBoss(tg.ref, { id: 'core' }, dmg, own); return; }
    const r = tg.ref; r.hp -= dmg; r.flash = 3; SFX.hit();
    if (r.hp > 0) return;
    if (own) own.kills++;
    if (tg.kind === 'sol') { r.remove = true; fxAt(r.z, () => { boom(r.x, -12, 1); addScore(150, own, r.x, -34); }); chargeStorm(3); return; }
    r.alive = false; fxAt(BZ, () => { boom(r.x, -tg.h, 1.8); addScore(500, own, r.x, -tg.h - 20); }); chargeStorm(8);
  }
  function nearestBasePlayer(x) {
    let best = null, bd = Infinity;
    for (const p of Lv.players) { if (p.dead || p.ghost) continue; const d = Math.abs(p.x + 5 - x); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function baseEnemyShot(x, z, h, tx, th, sp, kind = 'dot', r = 3) {
    sp *= DF().eSpeed; const frames = Math.max(1, z / sp);
    Lv.eB.push({ x, z, h, vx: (tx - x) / frames, vz: -sp, vh: (th - h) / frames, r, kind, life: 400 }); SFX.eshot();
  }
  function baseShot(x, slope, kind, own, o = {}) {
    const vz = o.vz || 4.5;
    Lv.pB.push({ x, y: 0, z: 4, h: 14, vx: slope * vz, vy: 0, vz, dmg: o.dmg || 1, kind, own, life: o.life || 40, pierce: !!o.pierce, homing: !!o.homing, hit: new Set() });
  }
  function fireBase(p) {
    const pr = p.pr, ch = CHARS[p.ci], mul = ch.dmgMul || 1, spd = ch.shotSpeed || 1, rate = pr.rapid ? 0.6 : 1, x = p.x + 5, a = p.aimX * 0.9;
    p.flash = 4;
    switch (pr.weapon) {
      case 'S': for (const d of [-0.5, -0.25, 0, 0.25, 0.5]) baseShot(x, a + d * 0.6, 'S', pr, { vz: 4.2 * spd, dmg: mul }); p.fireCd = 15 * rate; SFX.spread(); break;
      case 'L': baseShot(x, a, 'L', pr, { vz: 8 * spd, dmg: 4 * mul, pierce: true }); p.fireCd = 20 * rate; SFX.laser(); break;
      case 'H': for (const d of [-0.35, 0.35]) baseShot(x, a + d, 'H', pr, { vz: 3.5 * spd, dmg: 2 * mul, homing: true }); p.fireCd = 18 * rate; SFX.missile(); break;
      case 'F': for (let i = 0; i < 2; i++) baseShot(x, a + (Math.random() - 0.5) * 0.4, 'F', pr, { vz: 3 * spd, dmg: 0.25 * mul, pierce: true, life: 14 }); p.fireCd = 3 * rate; SFX.flame(); p.flash = 2; break;
      case 'B': baseShot(x, a, 'B', pr, { vz: 3 * spd, dmg: 5 * mul, life: 34 }); p.fireCd = 28 * rate; SFX.lob(); break;
      case 'T': baseLightning(p, x, 2 * mul); p.fireCd = 13 * rate; SFX.zap(); break;
      default: baseShot(x, a, 'P', pr, { vz: 4.5 * spd, dmg: mul }); p.fireCd = 9 * rate; SFX.shoot();
    }
  }
  function baseLightning(p, x, dmg) {
    const pts = [x, 16, 4], hit = new Set();
    let cx = x;
    for (let k = 0; k < 4; k++) {
      let best = null, bd = Infinity;
      for (const tg of baseTargets()) { if (hit.has(tg.ref)) continue; const d = Math.abs(tg.x - cx) + (k === 0 ? tg.z * 0.4 : 0); if (d < bd && (k === 0 || Math.abs(tg.x - cx) < 120)) { bd = d; best = tg; } }
      if (!best) break;
      hit.add(best.ref); pts.push(best.x, best.h, best.z); cx = best.x;
      hitBaseTarget(best, dmg, p.pr);
    }
    if (pts.length === 3) pts.push(x + p.aimX * 30, 30, 60);
    Lv.bolts.push({ p3: pts, life: 7, small: true });
  }
  function baseBlast(b) {
    fxAt(b.z, () => boom(b.x, -20, 1.4));
    for (const tg of baseTargets()) if (Math.abs(tg.x - b.x) < 46 + tg.w / 2 && Math.abs(tg.z - b.z) < 30) hitBaseTarget(tg, b.dmg, b.own);
  }
  function triggerStormBase(p) {
    G.storm = 0; Lv.stormT = 90; Lv.flashT = 12; Lv.shake = 10; Lv.eB = [];
    SFX.bigBoom(); SFX.laser(); floatText(p.x + 5, -50, 'BÃO LỬA!', EMBER);
    for (const tg of baseTargets()) {
      Lv.bolts.push({ p3: [tg.x + (Math.random() - 0.5) * 20, 140, tg.z, tg.x, tg.h, tg.z], life: 14 });
      if (tg.kind === 'gate') damageBoss(tg.ref, { id: 'core' }, Math.ceil(tg.ref.maxHp * 0.12), p.pr, true);
      else hitBaseTarget(tg, 8, p.pr);
    }
  }

  function updateBasePlayer(p, idx) {
    const I = inp(p.slot), K = I.k, PR = I.p, pr = p.pr, ch = CHARS[p.ci], B = Lv.base;
    if (p.ghost) { updateGhost(p, idx); return; }
    if (p.dead) { if (--p.deadT <= 0) respawn(p, idx); return; }
    if (p.invuln > 0) p.invuln--; if (p.fireCd > 0) p.fireCd--; if (p.flash > 0) p.flash--; if (p.dashCd > 0) p.dashCd--; if (p.shieldT > 0) p.shieldT--;
    const hx = (K.right ? 1 : 0) - (K.left ? 1 : 0), active = B.phase !== 'advance';
    p.onGround = p.jz <= 0;
    p.crouch = !!K.down && p.onGround && p.dashT <= 0;
    if (PR.dash && p.dashCd <= 0 && p.dashT <= 0) {
      p.dashT = ch.dashHit ? 14 : 12; p.dashCd = ch.dashCd || 42; p.dashHits = new Set(); if (hx) p.facing = hx; SFX.dash();
    }
    if (p.dashT > 0) {
      p.dashT--; p.vx = p.facing * 5;
      if (p.dashT % 2 === 0) Lv.trail.push({ ci: p.ci, x: p.x + p.w / 2, y: -p.jz, facing: p.facing, aimX: 0, aimY: 0, life: 12, base: true });
      if (ch.dashHit) for (const e of Lv.enemies) if (e.type === 'bsol' && !e.remove && e.z < 14 && Math.abs(e.x - p.x - 5) < 16 && !p.dashHits.has(e)) { p.dashHits.add(e); hitBaseTarget({ kind: 'sol', ref: e, h: 12 }, 4, pr); }
    } else {
      p.vx = p.crouch || !active ? 0 : hx * ch.speed * 1.1;
      if (hx) p.facing = hx;
    }
    p.x = clamp(p.x + p.vx, 24, W - 34);
    if (PR.jump && active) {
      if (p.onGround && !p.crouch) { p.vjz = 5.2; SFX.jump(); }
      else if (!p.onGround && ch.dj && !p.dj2) { p.vjz = 4.6; p.dj2 = true; SFX.jump(); }
    }
    p.jz += p.vjz; p.vjz -= 0.3;
    if (p.jz <= 0) { p.jz = 0; p.vjz = 0; p.dj2 = false; }
    p.h = p.crouch ? 14 : 22; p.y = -(p.jz + p.h); p.onGround = p.jz <= 0;
    if (p.onGround && Math.abs(p.vx) > 0.3) p.anim++;
    p.aimX = K.up && hx ? hx : 0; p.aimY = 0;
    if ((K.fire || pr.auto) && p.fireCd <= 0 && p.dashT <= 0 && active) fireBase(p);
    if (PR.super && G.storm >= 100 && active) triggerStormBase(p);
    for (const it of Lv.items) if (!it.remove && Math.abs(it.x - p.x - 5) < 16 && p.jz < 14) { it.y = p.y; applyPickup(p, it); }
    const d = p.drone;
    if (d) {
      d.x += (p.x + 5 - p.facing * 14 - d.x) * 0.12; d.y = -40 + Math.sin(Lv.t * 0.08) * 3;
      if (--d.fireT <= 0 && active) { d.fireT = 32; baseShot(d.x, 0, 'D', pr, { vz: 4, dmg: 1 }); }
    }
  }

  function updateBaseEnemies() {
    const B = Lv.base;
    for (const e of Lv.enemies) {
      if (e.flash > 0) e.flash--;
      if (e.type === 'bsol') {
        e.anim++; if (e.muzzle > 0) e.muzzle--;
        const tp = nearestBasePlayer(e.x);
        const goto = (sp) => { const dx = e.tx - e.x, dz = e.tz - e.z, dd = Math.hypot(dx, dz); if (dd < 2) return true; e.x += dx / dd * sp; e.z += dz / dd * sp; e.face = dx < 0 ? -1 : 1; return false; };
        if (e.mode === 'walk') { if (goto(1)) { e.mode = 'aim'; e.t = 0; } }
        else if (e.mode === 'aim') {
          e.t++;
          if ((e.t === 26 || e.t === 46) && tp) { baseEnemyShot(e.x, e.z, 16, tp.x + 5, 16, 2.2); e.muzzle = 5; }
          if (e.t > 62) { if (Math.random() < 0.3) e.mode = 'charge'; else { e.mode = 'leave'; e.tx = e.x < 240 ? 30 : 450; e.tz = 96; } }
        } else if (e.mode === 'charge') {
          e.z -= 1.6; if (tp) e.x += clamp(tp.x + 5 - e.x, -0.8, 0.8);
          if (e.z <= 2) { e.mode = 'leave'; e.tx = e.x < 240 ? -30 : 510; e.tz = 2; }
        } else if (goto(1.3)) e.remove = true;
        if (e.z < 6) for (const p of Lv.players) if (!p.dead && !p.ghost && Math.abs(p.x + 5 - e.x) < 10 && p.jz < 20) hurtPlayer(p);
      } else if (e.type === 'broll') {
        e.z -= e.vz; e.spin += 0.3;
        if (e.z <= 2) {
          e.remove = true; fxAt(1, () => boom(e.x, -6, 0.9));
          for (const p of Lv.players) if (!p.dead && !p.ghost && Math.abs(p.x + 5 - e.x) < 16 && p.jz < 10) hurtPlayer(p);
        }
      }
    }
    const al = alivePlayers();
    if (al.length && B.soldiersLeft > 0 && --B.soldierT <= 0 && Lv.enemies.filter(e => e.type === 'bsol').length < 2 + G.players.length) {
      B.soldiersLeft--; B.soldierT = (70 + Math.random() * 70) * DF().spawn;
      const left = Math.random() < 0.5;
      Lv.enemies.push({ type: 'bsol', x: left ? 40 : 440, z: 96, hp: 2, mode: 'walk', tx: 70 + Math.random() * 340, tz: 25 + Math.random() * 45, t: 0, anim: 0, face: left ? 1 : -1, flash: 0, muzzle: 0, vx: 1 });
    }
    if (al.length && B.rollersLeft > 0 && --B.rollerT <= 0) {
      B.rollersLeft--; B.rollerT = (160 + Math.random() * 120) * DF().spawn;
      const tp = al[Math.floor(Math.random() * al.length)];
      Lv.enemies.push({ type: 'broll', x: clamp(tp.x + 5 + (Math.random() - 0.5) * 30, 30, 450), z: 96, vz: 1.5 * DF().eSpeed, spin: 0, passive: true });
    }
    for (const t of B.turrets) if (t.alive) {
      if (t.flash > 0) t.flash--;
      if (--t.fireT <= 0) { t.fireT = (110 + Math.random() * 60) * DF().eFire; const tp = nearestBasePlayer(t.x); if (tp) baseEnemyShot(t.x, BZ - 2, t.h, tp.x + 5, 16, 2.4); }
    }
    for (const c of B.cores) if (c.flash > 0) c.flash--;
    if (B.main && B.main.flash > 0) B.main.flash--;
    if (B.barrier && --B.barrierT <= 0) { B.barrierOn = !B.barrierOn; B.barrierT = B.barrierOn ? 110 : 90; }
  }

  function updateBaseBullets() {
    const B = Lv.base;
    for (const b of Lv.pB) {
      if (--b.life <= 0) { if (b.kind === 'B') baseBlast(b); b.dead = true; continue; }
      if (b.homing) {
        let best = null, bd = Infinity;
        for (const tg of baseTargets()) { const d = Math.abs(tg.x - b.x) + Math.max(0, tg.z - b.z) * 0.3; if (tg.z > b.z && d < bd) { bd = d; best = tg; } }
        if (best) { const want = (best.x - b.x) / Math.max(8, best.z - b.z) * b.vz; b.vx += clamp(want - b.vx, -0.25, 0.25); }
      }
      b.x += b.vx; b.z += b.vz;
      if (B.barrierOn && b.z >= 70 && b.z - b.vz < 70 && b.kind !== 'L') { b.dead = true; fxAt(70, () => spark(b.x, -40, '#7ab8ff')); continue; }
      if (b.x < -20 || b.x > W + 20) { b.dead = true; continue; }
      if (b.kind === 'B' && b.z >= 62) { baseBlast(b); b.dead = true; continue; }
      for (const tg of baseTargets()) {
        if (b.hit.has(tg.ref)) continue;
        const inZ = tg.kind === 'sol' ? Math.abs(b.z - tg.z) < 6 : b.z >= BZ - 4;
        if (!inZ || Math.abs(b.x - tg.x) > tg.w / 2 + 3) continue;
        if (b.kind === 'B') { baseBlast(b); b.dead = true; break; }
        hitBaseTarget(tg, b.dmg, b.own);
        if (b.pierce) b.hit.add(tg.ref); else { b.dead = true; fxAt(tg.z, () => spark(b.x, -tg.h)); break; }
      }
      if (!b.dead && b.z >= BZ) { b.dead = true; fxAt(BZ, () => spark(b.x, -40, '#cfd3e6')); }
    }
    Lv.pB = Lv.pB.filter(b => !b.dead);
    for (const b of Lv.eB) {
      b.x += b.vx; b.z += b.vz; b.h += b.vh || 0;
      if (--b.life <= 0 || b.z < -14) { b.dead = true; continue; }
      if (b.z <= 4 && !b.checked) {
        b.checked = true;
        for (const p of Lv.players) {
          if (p.dead || p.ghost || Math.abs(b.x - p.x - 5) > 9) continue;
          const bottom = p.jz, top = p.jz + (p.crouch ? 12 : 24);
          if (b.h < bottom - 3 || b.h > top + 2) continue;
          if (p.shieldT > 0) { b.dead = true; fxAt(0, () => spark(b.x, -b.h, '#9fe8ff')); break; }
          if (p.invuln > 0 || p.dashT > 0) continue;
          b.dead = true; hurtPlayer(p); break;
        }
      }
    }
    Lv.eB = Lv.eB.filter(b => !b.dead);
  }

  function updateGate(b) {
    b.t++; if (b.flash > 0) b.flash--;
    const ph2 = b.hp < b.maxHp * 0.5; b.modeT++;
    if (b.mode === 'closed') {
      b.open = Math.max(0, b.open - 0.05);
      if (b.modeT > (ph2 ? 110 : 150)) { b.mode = 'open'; b.modeT = 0; SFX.warn(); }
    } else {
      b.open = Math.min(1, b.open + 0.05);
      if (b.open >= 1 && b.modeT % (ph2 ? 26 : 36) === 0) {
        const tp = nearestBasePlayer(240);
        if (tp) for (const d of ph2 ? [-60, -30, 0, 30, 60] : [-40, 0, 40]) baseEnemyShot(240, BZ - 2, 48, tp.x + 5 + d, 18, 2.0, 'fire', 6);
      }
      if (b.modeT > 170) { b.mode = 'closed'; b.modeT = 0; }
    }
  }

  function stepBase(L) {
    const B = L.base; B.t++;
    for (let i = 0; i < L.players.length; i++) updateBasePlayer(L.players[i], i);
    if (state !== 'play' && state !== 'clear') return;
    if (B.phase === 'fight') {
      if (!B.mainOpened && B.cores.every(c => !c.alive)) { B.mainOpened = true; SFX.warn(); fxAt(BZ, () => floatText(240, -90, 'LÕI CHÍNH LỘ RA!', EMBER)); }
      if (!B.main.alive) {
        B.phase = 'clear'; B.t = 0; L.eB = []; L.shake = 10; SFX.bigBoom();
        for (const e of L.enemies) if (e.type === 'bsol') { e.remove = true; fxAt(e.z, () => boom(e.x, -12, 1, true)); }
        if (B.reward) L.items.push({ x: 240, y: -10, z: 12, w: 12, h: 10, vx: 0, vy: 0, kind: B.reward, life: 0 });
        fxAt(BZ, () => floatText(240, -110, 'PHÒNG ' + (B.room + 1) + ' ĐÃ PHÁ', VOLT));
      }
    } else if (B.phase === 'clear') {
      if (B.t % 8 === 0 && B.t < 50) fxAt(BZ, () => boom(80 + Math.random() * 320, -20 - Math.random() * 60, 1.4, B.t % 16 !== 0));
      if (B.t > 120) { B.phase = 'advance'; B.t = 0; L.items = []; }
    } else if (B.phase === 'advance') {
      if (B.t > 90) { if (B.room + 1 < L.d.rooms.length) initRoom(B.room + 1); else initGateRoom(); }
    } else if (B.phase === 'boss') {
      if (L.bossState === 'warn') { if (L.warnT % 40 === 0) SFX.warn(); if (--L.warnT <= 0) { L.bossState = 'fight'; spawnGate(); } }
      const b = L.boss;
      if (b && b.alive) updateGate(b);
      else if (b && !b.alive) {
        if (--b.dying % 7 === 0) fxAt(BZ, () => boom(60 + Math.random() * 360, -10 - Math.random() * 100, 1.8, b.dying % 21 !== 0));
        if (b.dying <= 0) { L.boss = null; L.bossState = 'done'; L.endT = 90; L.enemies = []; }
      }
    }
    if (B.phase === 'fight' || (B.phase === 'boss' && L.bossState === 'fight' && L.boss && L.boss.alive)) updateBaseEnemies();
    else L.enemies = L.enemies.filter(e => e.type !== 'broll');
    updateBaseBullets();
    L.enemies = L.enemies.filter(e => !e.remove);
    L.items = L.items.filter(i => !i.remove);
    if (L.stormT > 0) {
      L.stormT--;
      if (L.stormT % 10 === 0) {
        const vis = baseTargets().filter(tg => tg.kind !== 'gate');
        if (vis.length) { const tg = vis[Math.floor(Math.random() * vis.length)]; L.bolts.push({ p3: [tg.x, 140, tg.z, tg.x, tg.h, tg.z], life: 12 }); hitBaseTarget(tg, 4); }
        SFX.missile();
      }
    }
  }

  // ---------- step per state ----------
  function setDifficulty(d) {
    d = clamp(d, 0, DIFFS.length - 1);
    if (d === difficulty) return;
    difficulty = d; lobbyT = 0; SFX.select();
  }
  // a click/tap on a difficulty button; LAN guests nudge the host one step at a time with up/down
  function pickDifficulty(d) {
    SFX.init();
    if (state !== 'select') return;
    if (netRole === 'guest') {
      if (d === difficulty) return;
      const k = d < difficulty ? 'up' : 'down', slot = playerSlots()[0] || 'kb';
      netSend({ t: 'in', slot, k: { [k]: true } }); netSend({ t: 'in', slot, k: { [k]: false } });
      return;
    }
    setDifficulty(d);
  }
  function stepSelect() {
    const sys = inp('sys').p;
    for (const id of playerSlots()) {
      const P = inputs[id].p, i = lobby.findIndex(l => l.slot === id), l = lobby[i];
      if (!l) { if (P.fire || P.jump || P.start) lobbyJoin(id); continue; }
      if (P.super) { l.auto = !l.auto; SFX.select(); }   // the Bão Lửa key toggles tự bắn for this player
      if (P.up) setDifficulty(difficulty - 1);
      if (P.down) setDifficulty(difficulty + 1);
      if (!l.ready) {
        if (P.left) { l.ci = (l.ci + CHARS.length - 1) % CHARS.length; SFX.select(); }
        if (P.right) { l.ci = (l.ci + 1) % CHARS.length; SFX.select(); }
        if ((P.fire || P.jump || P.start) && stateT > 8) { l.ready = true; SFX.power(); }
        else if (P.dash) { lobby.splice(i, 1); SFX.select(); }
      } else if (P.dash) { l.ready = false; SFX.select(); }
    }
    if (sys.split && netRole !== 'guest') setSplit(!splitKb);
    if (sys.mode) setMode(mode === 'daily' ? 'campaign' : 'daily');
    if (mode === 'daily' && daily.status === 'idle') loadDaily(localDate());
    if (sys.back) { if (lobby.length) lobby = []; else { state = 'title'; stateT = 0; } }
    const waiting = mode === 'daily' && daily.status !== 'ready';   // the countdown holds until the daily stage is in
    if (lobby.length && lobby.every(l => l.ready) && !waiting) { if (++lobbyT > 50) { newRun(lobby); startStage(G.stage); requestLines(); } }
    else lobbyT = 0;
    titleX += 0.3;
  }

  // the radio fades out by itself; the boss taunt cuts in when the warning sirens start
  function tickRadio() {
    if (G.radio && --G.radio.t <= 0) G.radio = null;
    if (Lv && Lv.bossState === 'warn' && !Lv.taunted) {
      Lv.taunted = true;
      const l = aiLines && aiLines[G.stage];
      if (l && l.taunt) radio(DAILY.BOSS_NAMES[Lv.d.boss] || 'TRÙM', l.taunt, 420);
    }
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
        if (!paused) { stepPlay(); tickRadio(); }
        break;
      }
      case 'clear':
        stepPlay(); tickRadio();
        if ((stateT > 60 && anyPressed('start', 'fire')) || stateT > 420) {
          if (!G.daily && G.stage + 1 < CAMPAIGN) startStage(G.stage + 1);
          else { state = 'victory'; stateT = 0; saveHi(); if (G.daily) saveDailyBest(); requestRecap('victory'); }
        }
        break;
      case 'over':
        if (stateT > 40 && (sys.start || anyPressed('fire', 'start')) && !sys.back) {
          for (const pr of G.players) Object.assign(pr, { lives: DF().lives, score: 0, nextLife: 20000, weapon: 'P', rapid: false, kills: 0, deaths: 0, bosses: 0 });
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

  // Online (Cloudflare): each room has a code, shared as ?room=CODE in the link. LAN (server.js): one room.
  const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const cleanRoom = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  let room = cleanRoom(new URLSearchParams(location.search).get('room'));
  const roomLink = () => `${location.origin}${location.pathname}?room=${room}`;
  function lanStart(role) {
    if (netInfo.online) {
      const typed = cleanRoom((document.getElementById('lanRoom') || {}).value);
      if (role === 'host') room = typed.length >= 4 ? typed : Array.from({ length: 4 }, () => ROOM_CHARS[Math.random() * ROOM_CHARS.length | 0]).join('');
      else if (typed.length >= 4) room = typed;
      else { netStatus = 'error'; netError = 'Nhập mã phòng (4 ký tự) do chủ phòng gửi.'; lanUpdate(); return; }
      history.replaceState(null, '', roomLink());
    }
    netStatus = 'connecting'; netError = ''; lanUpdate();
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${netInfo.online ? '?room=' + room : ''}`);
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
    const s = { t: 'snap', state, stateT, frame, paused, lobby, lobbyT, difficulty, mode, daily: state === 'select' ? dailyInfo() : null, hiscore, titleX, music: curMusic, sfx: sfxQueue.splice(0), G };
    if (Lv && G && (state === 'play' || state === 'clear' || state === 'over')) {
      const L = Lv, b = L.boss;
      s.lv = {
        i: L.i, camX: L.camX, camY: L.camY, base: L.base, t: L.t, shake: L.shake, introT: L.introT, bossState: L.bossState, warnT: L.warnT, stormT: L.stormT, flashT: L.flashT,
        players: L.players.map(p => { const { pr, ...o } = p; o.num = pr.num; return o; }),
        enemies: L.enemies, pB: L.pB.map(q => ({ x: q.x, y: q.y, z: q.z, vx: q.vx, vy: q.vy, vz: q.vz, kind: q.kind, life: q.life, ox: q.ox, oy: q.oy, ok: q.ok })), beams: L.beams, eB: L.eB, items: L.items,
        parts: L.parts.slice(-350), texts: L.texts, rings: L.rings, trail: L.trail, bolts: L.bolts,
        boss: b ? (({ hist, ...o }) => o)(b) : null,
      };
    }
    netWs.send(JSON.stringify(s, round1));
  }

  function applySnap(m) {
    state = m.state; stateT = m.stateT; frame = m.frame; paused = m.paused; lobby = m.lobby || []; lobbyT = m.lobbyT; if (m.difficulty !== undefined) difficulty = m.difficulty; titleX = m.titleX;
    hiscore = Math.max(hiscore, m.hiscore || 0); G = m.G || null;
    mode = m.mode || 'campaign'; if (m.daily) hostDaily = m.daily;
    if (m.lv && G) {
      if (G.daily) loadDaily(G.daily.date, G.daily.src);     // same plan as the host: fetched from the Worker or rolled locally
      const def = levelDef(m.lv.i);
      if (!def) Lv = null;
      else {
        if (!Lv || Lv.i !== m.lv.i || Lv.d !== def) Lv = buildLevel(m.lv.i);
        const amb = Lv.amb;
        Object.assign(Lv, m.lv); Lv.amb = amb;
        for (const p of Lv.players) p.pr = G.players[p.num];
      }
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
    if (netInfo.online) return onlineUpdate();
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
  function onlineUpdate() {
    let h;
    if (netRole === 'host') h = `<b>CHỦ PHÒNG · ${room}</b><p>${netGuests ? netGuests + ' máy khác đã vào phòng.' : 'Chưa có máy nào vào.'} Gửi link này cho bạn bè:</p><p class="addr">${roomLink()}</p>`
      + `<div class="row"><button id="lanCopy" type="button" class="ghost">Sao chép link</button></div><p>Máy này chạy trận đấu, hãy để cửa sổ luôn mở.</p>`;
    else if (netRole === 'guest') h = netStatus === 'waiting'
      ? `<b>PHÒNG ${room}</b><p>Đang chờ chủ phòng bấm “Tạo phòng”…</p>`
      : `<b>ĐÃ VÀO PHÒNG ${room}</b><p>Bấm phím Bắn (J, Z, Enter hoặc nút A/X trên tay cầm) để tham gia.</p>`;
    else if (netStatus === 'connecting') h = `<b>CHƠI ONLINE</b><p>Đang kết nối phòng ${room}…</p>`;
    else h = `<b>CHƠI ONLINE</b><p>${room ? 'Bạn được mời vào phòng <b>' + room + '</b>. Bấm “Vào phòng”.' : 'Tạo phòng rồi gửi link cho bạn bè, hoặc nhập mã phòng để vào.'}</p>`
      + `<input id="lanRoom" type="text" maxlength="8" autocomplete="off" spellcheck="false" placeholder="MÃ PHÒNG" value="${room}" aria-label="Mã phòng">`
      + (netStatus === 'error' ? `<p class="err">${netError}</p>` : netStatus === 'closed' ? `<p class="err">Mất kết nối với máy chủ.</p>` : '')
      + `<div class="row"><button id="lanJoin" type="button"${room ? '' : ' class="ghost"'}>Vào phòng</button><button id="lanHost" type="button"${room ? ' class="ghost"' : ''}>Tạo phòng</button></div>`;
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
    if (id === 'lanCopy' && navigator.clipboard) navigator.clipboard.writeText(roomLink()).then(() => { e.target.textContent = 'Đã sao chép'; }, () => { });
  });
  lanEl.addEventListener('keydown', e => { if (e.target.id === 'lanRoom' && e.key === 'Enter') { e.target.blur(); SFX.init(); lanStart('guest'); } });
  fetch('lan-info', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(info => { if (info && (info.online || Array.isArray(info.ips))) { netInfo = info; lanUpdate(); if (info.online) loadDaily(localDate()); } })
    .catch(() => { });

  // ---------- loop ----------
  let last = performance.now(), acc = 0;
  const V = { isTouch, slotName };
  UI.init(document.getElementById('ui'), tap, pickDifficulty, m => { SFX.init(); if (state === 'select') setMode(m); });
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
    V.hiscore = hiscore; V.team = teamScore(); V.netRole = netRole; V.splitKb = splitKb; V.difficulty = G && G.diff !== undefined ? G.diff : difficulty;
    V.mode = mode; V.daily = state === 'select' ? dailyInfo() : null; V.dailyBest = dailyBest; V.lastStage = !!(G && (G.daily || G.stage + 1 >= CAMPAIGN));
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
    setDiff(d) { difficulty = d; },
  };
  function boot(data) {
    if (data && data.playing && data.G && data.G.players && LEVELS[data.G.stage]) { G = data.G; startStage(G.stage); }
    else SFX.music('title');
    requestAnimationFrame(t => { last = t; loop(t); });
  }
  if (hot && hot.ready) hot.ready(boot); else boot(hot && hot.data || {});
})();
