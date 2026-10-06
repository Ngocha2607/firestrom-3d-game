// worker/index.js — Cloudflare deployment of Bão Lửa: static files + one Durable Object per room.
// Same relay protocol as server.js: guests --(inputs)--> host browser --(snapshots)--> guests
// Workers AI (optional, binding AI): the daily stage (/api/daily), radio lines (/api/lines), match recap (/api/recap).
import { DurableObject } from 'cloudflare:workers';
import DAILY from '../src/daily.js';

const ROOM_RE = /^[A-Z0-9]{4,8}$/;
const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';   // supports JSON mode
// Language of everything the AI writes, from AI_LANG in wrangler.toml: "en" (default, the model writes it best) or "vi".
// Prompts are in English either way; each language brings its style rule, examples and a sanity check on the output.
const VI_MARKS = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/gi;
const viMarks = s => (s.match(VI_MARKS) || []).length;
const LANGS = {
  en: {
    voice: 'Write every text field in natural English. Action-movie tone, light humour, no profanity, no emoji.',
    ok: s => /[a-z]{3}/i.test(s) && viMarks(s) < 4,   // hero names like BẢO may appear, whole Vietnamese sentences may not
    line: { brief: 'MAI, lightning keeps frying our radar. Follow the pipes, clear out the guards and find the core that is draining the grid!', taunt: 'Ten thousand volts are waiting for you. Hold still while I cook you crispy!' },
    recap: 'BẢO dashed like a whirlwind, wiping out 57 enemies and falling only once! TOBI hit the floor 5 times, probably too busy fixing that drone. Train a little more and no boss will stand a chance!',
    name: ['STORM DOCKS', 'GHOST PIER'], sub: 'Cross a battleship in the eye of the storm',
  },
  vi: {
    voice: 'Write every text field in Vietnamese WITH full diacritics ("Pháo đài", never "Phao dai"). Action-movie tone, light humour, no profanity, no emoji.',
    ok: s => viMarks(s) > 0,
    line: { brief: 'MAI, sét đánh liên tục làm nhiễu radar rồi. Bám theo đường ống, dọn đám lính gác và tìm cái lõi đang hút điện!', taunt: 'Một vạn vôn đang chờ các ngươi. Đứng yên đó cho ta nướng giòn!' },
    recap: 'BẢO lướt như cơn lốc, quét sạch 57 kẻ địch mà chỉ ngã đúng một lần! TOBI thì nằm đất 5 lần, chắc tại mải sửa drone. Đội hình này mà tập thêm chút nữa thì trùm nào cũng phải dè chừng!',
    name: ['VỰC MÂY GIÔNG', 'BẾN TÀU MA'], sub: 'Vượt qua chiến hạm giữa bão mây',
  },
};
const lang = env => LANGS[env.AI_LANG] || LANGS.en;
// what the model is told about each world and boss (English describes them best, whatever the output language)
const THEME_EN = { harbor: 'a neon harbour drowning in night rain', base: 'an underground fortress beneath the harbour, fought in corridors',
  forge: 'a weapons foundry inside a volcano, lava pits and fire jets', falls: 'a vertical climb up a roaring waterfall in a canyon, falling rocks',
  sky: 'a fortress floating above a sea of clouds', ice: 'an eternal ice mine under the aurora, slippery floors and falling icicles',
  moon: 'a lunar orbital station, low gravity' };
const BOSS_EN = { crab: 'a giant steel crab firing mortars', gate: 'an armoured fortress gate with an energy core and turrets',
  core: 'a colossal forge with turrets that spits molten cores', idol: 'a stone idol with two giant slamming hands',
  mammoth: 'an ice-plated mech mammoth that charges and sprays frost', serpent: 'a dragon-shaped flying warship dropping bombs',
  eye: 'a giant orbital eye that fires laser beams' };
const NO_STORE = { 'cache-control': 'no-store' };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if ((req.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      const room = (url.searchParams.get('room') || '').toUpperCase();
      if (!ROOM_RE.test(room)) return new Response('Bad room code', { status: 400 });
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(req);
    }
    if (url.pathname === '/lan-info') return Response.json({ online: true, ai: !!env.AI }, { headers: NO_STORE });
    if (url.pathname === '/api/daily') return env.DAILY.get(env.DAILY.idFromName('daily')).fetch(req);
    if (url.pathname === '/api/lines' || url.pathname === '/api/recap') {
      if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
      if (!env.AI) return Response.json({ error: 'AI chưa được bật' }, { status: 503, headers: NO_STORE });
      if (env.AI_LIMIT) {
        const { success } = await env.AI_LIMIT.limit({ key: req.headers.get('cf-connecting-ip') || 'anon' });
        if (!success) return Response.json({ error: 'Gọi AI quá nhanh, thử lại sau ít phút' }, { status: 429, headers: NO_STORE });
      }
      let body;
      try { const raw = await req.text(); if (raw.length > 4096) throw 0; body = JSON.parse(raw); } catch (e) { return new Response('Bad request', { status: 400 }); }
      try {
        const out = url.pathname === '/api/lines' ? await stageLines(env, body) : await recap(env, body);
        return Response.json(out, { headers: NO_STORE });
      } catch (e) {
        console.log('AI call failed:', e && e.message);
        return Response.json({ error: 'AI không trả lời được' }, { status: 502, headers: NO_STORE });
      }
    }
    return env.ASSETS.fetch(req);
  },
};

// ---------- Workers AI ----------
async function askJSON(env, system, user, schema, maxTokens) {
  const out = await env.AI.run(AI_MODEL, {
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    response_format: { type: 'json_schema', json_schema: schema },
    max_tokens: maxTokens, temperature: 0.8,
  });
  const r = out && out.response;
  return typeof r === 'string' ? JSON.parse(r) : r;
}

const clean = DAILY.clean;
const team = b => (Array.isArray(b.team) ? b.team : []).slice(0, 4).map(p => clean(p, 40)).filter(Boolean);

// radio lines for every stage of a run: a briefing from command and the boss's taunt
async function stageLines(env, b) {
  const stages = (Array.isArray(b.stages) ? b.stages : []).slice(0, 8).filter(s => s && typeof s === 'object')
    .map(s => ({ setting: THEME_EN[s.theme] || clean(s.sub, 70), boss: BOSS_EN[s.boss] || clean(s.boss, 30) }));
  if (!stages.length) throw new Error('no stages');
  const L = lang(env);
  const n = stages.length;
  const system = `You write radio dialogue for "Bão Lửa" (Firestorm), a Contra-style side-scrolling shooter. ${L.voice}
The "lines" array must hold exactly ${n} items, one per stage, stages 1 to ${n} in order. Each item has:
- stage: the stage number from the list
- setting: that stage's setting restated in 3–6 words
- brief: the Commander (the speaker) gives the squad its orders over the radio, 15–30 words. Mention concrete details of that
  stage's setting (night rain, lava, waterfall, sea of clouds, ice, the Moon…) and the danger ahead; may call one squad member by name.
- taunt: the boss taunts the squad as it appears, 8–20 words, based on what the boss is (crab, forge, stone idol…).
Do NOT repeat the stage or boss names. Vary the sentence shape from stage to stage.
Example of the shape, for a 2-stage list whose stage 1 is "Abandoned power plant in a thunderstorm" with boss "a giant transformer robot":
{"lines":[${JSON.stringify({ stage: 1, setting: 'power plant in a storm', ...L.line })},{"stage":2,"setting":"…","brief":"…","taunt":"…"}]}`;
  const user = `Squad: ${team(b).join(', ')}. Difficulty: ${clean(b.diff, 12)}.\nWrite ${n} items for these ${n} stages:\n` +
    stages.map((s, i) => `${i + 1}. Setting: ${s.setting}. Boss: ${s.boss}.`).join('\n');
  const schema = { type: 'object', properties: { lines: { type: 'array', minItems: n, maxItems: n, items: { type: 'object', properties: {
    stage: { type: 'integer' }, setting: { type: 'string' }, brief: { type: 'string' }, taunt: { type: 'string' } }, required: ['stage', 'setting', 'brief', 'taunt'] } } }, required: ['lines'] };
  const usable = o => o && Array.isArray(o.lines) && o.lines.length >= n - 1 && L.ok(JSON.stringify(o));
  let out = await askJSON(env, system, user, schema, 180 * n + 100);
  if (!usable(out)) out = await askJSON(env, system, user, schema, 180 * n + 100);
  // place each line by its stage number, so a skipped stage leaves a hole instead of shifting every line after it
  const lines = stages.map(() => null);
  for (const l of out && Array.isArray(out.lines) ? out.lines : []) {
    const i = (l && l.stage | 0) - 1;
    if (i >= 0 && i < lines.length && !lines[i]) lines[i] = { brief: clean(l.brief, 200), taunt: clean(l.taunt, 140) };
  }
  return { lines };
}

// a short commentary once the run ends, from the real numbers only
async function recap(env, b) {
  const players = (Array.isArray(b.players) ? b.players : []).filter(p => p && typeof p === 'object').slice(0, 4).map(p => ({
    name: clean(p.name, 16), score: +p.score | 0, kills: +p.kills | 0, times_down: +p.deaths | 0, bosses_killed: +p.bosses | 0 }));
  if (!players.length) throw new Error('no players');
  const L = lang(env);
  const result = { victory: 'victory, campaign cleared', over: 'the whole squad fell' }[b.result] || 'ended';
  const system = `You are the commentator of the shooter "Bão Lửa" (Firestorm). ${L.voice}
Write a 2–3 sentence match recap (at most 300 characters), lively like sports commentary: praise the standout player with a fun image,
gently tease whoever was taken down the most, if anyone. Use only the numbers given, invent nothing. Call players by their hero name (drop the "P1") and never use he/she for them.
Example: "${L.recap}"`;
  const user = JSON.stringify({ result, difficulty: clean(b.diff, 12), players });
  const out = await askJSON(env, system, user, { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }, 260);
  return { text: clean(out && out.text, 360) };
}

// ---------- the daily stage: generated once per date, stored, the same for everyone ----------
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' }, sub: { type: 'string' }, brief: { type: 'string' }, taunt: { type: 'string' },
    segments: { type: 'array', items: { type: 'object', properties: {
      terrain: { type: 'string', enum: DAILY.TERRAIN }, length: { type: 'integer' },
      enemies: { type: 'array', items: { type: 'string', enum: DAILY.ENEMIES } }, item: { type: 'string' } }, required: ['terrain', 'length', 'enemies'] } },
  },
  required: ['name', 'sub', 'brief', 'taunt', 'segments'],
};

export class Daily extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.pending = new Map();
  }

  async fetch(req) {
    const date = new URL(req.url).searchParams.get('d') || '';
    const at = Date.parse(date + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(at)) return Response.json({ error: 'Ngày không hợp lệ' }, { status: 400 });
    let rec = await this.ctx.storage.get('plan:' + date);
    if (!rec) {
      // only today's stage (± time zones) is generated, so nobody can burn the AI quota with made-up dates
      if (Math.abs(at - Date.now()) > 38 * 3600e3) return Response.json({ error: 'Chưa có màn cho ngày này' }, { status: 404 });
      if (!this.pending.has(date)) this.pending.set(date, this.generate(date).finally(() => this.pending.delete(date)));
      rec = await this.pending.get(date);
    }
    return Response.json(rec, { headers: { 'cache-control': 'public, max-age=300' } });
  }

  async generate(date) {
    const theme = DAILY.themeFor(date), boss = DAILY.PAIR[theme];
    let plan = null;
    if (this.env.AI) {
      const L = lang(this.env);
      const system = `You design stages for "Bão Lửa" (Firestorm), a Contra-style side-scrolling shooter. ${L.voice}
A stage is a chain of 10–13 terrain segments, running left to right. Each segment has:
- terrain: flat, up (step up), down (step down), gap (a pit to jump), islands (small islands separated by pits), platforms (flat ground with ledges above)
- length: 6–20 tiles
- enemies: 0–4 of soldier, shield (shield trooper), turret, hopper (jumping bug), drone (small flyer), geyser (fire jet in a pit, only with gap or islands), icicle (falling icicle, only for ice stages)
- item (optional): one letter: S spread, L laser, H homing missiles, F flamethrower, B cluster bomb, T lightning, R rapid fire, A armour, Z shield, M extra life, E storm charge
Start easy and ramp up, mix the terrain for a fun rhythm, scatter 5–7 items, preferably an M near the end.
Also write:
- name: stage name in CAPITALS, a natural evocative phrase of 2–4 words, at most 22 characters, e.g. "${L.name[0]}", "${L.name[1]}"
- sub: one line describing the setting, at most 60 characters, e.g. "${L.sub}"
- brief: the Commander (the speaker) orders the squad over the radio, 2 sentences, 18–30 words, with concrete details of the setting and the danger
- taunt: the final boss taunts the squad in one full sentence, 50–100 characters`;
      const user = `Date ${date}. Setting: ${THEME_EN[theme]}. Final boss: ${BOSS_EN[boss]}. Give the stage a fresh name.`;
      // two tries: the model now and then breaks the JSON or (in Vietnamese) drops the accents
      for (let i = 0; i < 2 && !plan; i++) {
        try {
          const p = DAILY.sanitize({ ...(await askJSON(this.env, system, user, PLAN_SCHEMA, 1400)), theme, boss });
          DAILY.build(p, date);                                   // make sure it builds before storing it
          if (L.ok(p.name + p.sub + p.taunt)) plan = p;
          else console.log('daily stage: wrong language, retrying', p.name);
        } catch (e) { console.log('daily stage: AI failed', e && e.message); }
      }
    }
    const rec = plan ? { date, source: 'ai', plan } : { date, source: 'seed', plan: DAILY.randomPlan(date) };
    await this.ctx.storage.put('plan:' + date, rec);
    return rec;
  }
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.host = null;
    this.guests = new Map();
    this.nextId = 1;
  }

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const c = { id: this.nextId++, ws: server, role: null };
    server.addEventListener('message', e => { if (typeof e.data === 'string') this.onMessage(c, e.data); });
    server.addEventListener('close', () => this.drop(c));
    server.addEventListener('error', () => this.drop(c));
    return new Response(null, { status: 101, webSocket: client });
  }

  send(c, obj) { try { c.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch (e) { this.drop(c); } }

  onMessage(c, msg) {
    // host snapshots are relayed verbatim without parsing
    if (c === this.host && msg.startsWith('{"t":"snap"')) {
      for (const g of this.guests.values()) this.send(g, msg);
      return;
    }
    let m; try { m = JSON.parse(msg); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello' && !c.role) {
      if (m.role === 'host') {
        if (this.host) { this.send(c, { t: 'error', msg: 'Phòng đã có chủ. Hãy bấm “Vào phòng”.' }); return; }
        this.host = c; c.role = 'host';
        this.send(c, { t: 'welcome', id: c.id, role: 'host' });
        for (const g of this.guests.values()) { this.send(c, { t: 'join', id: g.id }); this.send(g, { t: 'hostup' }); }
      } else {
        c.role = 'guest'; this.guests.set(c.id, c);
        this.send(c, { t: 'welcome', id: c.id, role: 'guest', hostReady: !!this.host });
        if (this.host) this.send(this.host, { t: 'join', id: c.id });
      }
      return;
    }
    if (c.role === 'guest' && this.host && m.t === 'in' && typeof m.slot === 'string' && m.slot.length < 16 && m.k && typeof m.k === 'object') {
      this.send(this.host, { t: 'in', from: c.id, slot: m.slot, k: m.k });
    }
  }

  drop(c) {
    if (c.dropped) return;
    c.dropped = true;
    try { c.ws.close(1000); } catch (e) { }
    if (c === this.host) {
      this.host = null;
      for (const g of this.guests.values()) this.send(g, { t: 'hostgone' });
    } else if (this.guests.delete(c.id) && this.host) {
      this.send(this.host, { t: 'leave', id: c.id });
    }
  }
}
