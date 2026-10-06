// daily.js — "Màn của ngày": turns a short level plan into a stage in the same format as levels.js.
// The plan is written by Workers AI (worker/index.js) or rolled from the date when AI is unavailable.
// It is only a list of terrain segments: every gap, step and platform is placed here, so the stage stays
// reachable whatever the model writes. Loaded by the browser as a plain script and imported by the Worker.
'use strict';
const DAILY = (() => {
  const THEMES = ['harbor', 'forge', 'sky', 'ice', 'moon'];
  const PAIR = { harbor: 'crab', forge: 'core', sky: 'serpent', ice: 'mammoth', moon: 'eye' };
  const BOSS_NAMES = { crab: 'CUA THÉP K-9', core: 'LÒ RÈN VÔ CỰC', idol: 'THẦN ĐÁ THÁC SẤM', mammoth: 'VOI BĂNG MK-II',
    eye: 'MẮT THẦN NGUYỆT', serpent: 'LONG HẠM THIÊN VÂN', gate: 'CỔNG PHÁO ĐÀI' };
  const TERRAIN = ['flat', 'up', 'down', 'gap', 'islands', 'platforms'];
  const ENEMIES = ['soldier', 'shield', 'turret', 'hopper', 'drone', 'geyser', 'icicle'];
  const ITEM_RE = /^[SLHFBTRAZME]$/;
  const NAMES = {
    harbor: ['BẾN CẢNG SƯƠNG MÙ', 'CẦU TÀU ĐÈN ĐỎ', 'KHO HÀNG BỎ HOANG'], forge: ['MỎ LÒ XUYÊN NÚI', 'XƯỞNG ĐÚC ĐỎ LỬA', 'VỰC DUNG NHAM'],
    sky: ['ĐẢO MÂY TRÔI', 'TRẠM GIÓ THƯỢNG TẦNG', 'CẦU VỒNG THÉP'], ice: ['HANG TUYẾT TRẮNG', 'ĐÈO BĂNG GIÁ', 'LÒNG SÔNG ĐÓNG BĂNG'],
    moon: ['MIỆNG HỐ THIÊN THẠCH', 'TRẠM KHAI MỎ NGUYỆT', 'BÃI ĐÁP TÀU SAO'],
  };
  const SUBS = { harbor: 'Đột kích bến cảng trong đêm mưa', forge: 'Băng qua lò đúc giữa dòng dung nham', sky: 'Nhảy qua những hòn đảo trên mây',
    ice: 'Trượt qua mỏ băng dưới cực quang', moon: 'Tung hoành trong trọng lực thấp' };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const int = (v, a, b, d) => (Number.isFinite(+v) ? clamp(Math.round(+v), a, b) : d);
  // plain one-line text: no markup, no control characters (it ends up in innerHTML and in prompts),
  // no stray CJK characters (the model now and then slips one into Vietnamese)
  const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>&"`]/g, ' ').replace(/[⺀-鿿가-힯豈-﫿＀-￯]/g, '').replace(/\s+/g, ' ').trim().slice(0, n) : '');

  function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    let a = hash(seed);
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // the theme rotates by date so the model does not pick the same world every day
  const themeFor = date => THEMES[hash('theme:' + date) % THEMES.length];

  function sanitize(p) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.segments)) return null;
    const segments = p.segments.slice(0, 16).filter(s => s && typeof s === 'object').map(s => ({
      terrain: TERRAIN.includes(s.terrain) ? s.terrain : 'flat',
      length: int(s.length, 6, 20, 10),
      enemies: (Array.isArray(s.enemies) ? s.enemies : []).filter(e => ENEMIES.includes(e)).slice(0, 5),
      item: typeof s.item === 'string' && ITEM_RE.test(s.item.trim().toUpperCase()) ? s.item.trim().toUpperCase() : '',
    }));
    if (segments.length < 6) return null;
    const theme = THEMES.includes(p.theme) ? p.theme : 'harbor';
    return { name: str(p.name, 26).toUpperCase() || NAMES[theme][0], sub: str(p.sub, 70) || SUBS[theme], theme,
      boss: Object.values(PAIR).includes(p.boss) ? p.boss : PAIR[theme], segments, brief: str(p.brief, 200), taunt: str(p.taunt, 140) };
  }

  function randomPlan(date) {
    const r = rng('plan:' + date), pick = a => a[Math.floor(r() * a.length)], theme = themeFor(date);
    const pool = ['soldier', 'soldier', 'soldier', 'turret', 'hopper', 'drone', 'shield', ...(theme === 'forge' ? ['geyser', 'geyser'] : theme === 'ice' ? ['icicle', 'icicle'] : [])];
    const segments = [];
    for (let i = 0, n = 10 + Math.floor(r() * 3); i < n; i++) {
      const k = Math.min(4, 1 + Math.floor(r() * (2 + i / 3)));
      segments.push({ terrain: i === 0 ? 'flat' : pick(TERRAIN), length: 8 + Math.floor(r() * 9), enemies: Array.from({ length: k }, () => pick(pool)), item: i % 2 ? pick([...'SLHFBTRAZE']) : '' });
    }
    segments[segments.length - 1].item = 'M';
    return { name: pick(NAMES[theme]), sub: SUBS[theme], theme, boss: PAIR[theme], segments, brief: '', taunt: '' };
  }

  // Jump reach (gravity 0.27, jump 5.7): about 3.7 tiles up and 5 tiles across for the slowest hero.
  // Steps are at most 2 tiles, gaps at most 3 (2 when the far side is higher), platforms 3 tiles above the floor.
  function build(plan, date) {
    const r = rng('build:' + date), ri = (a, b) => a + Math.floor(r() * (b - a + 1));
    const { theme } = plan, ground = [], plats = [], enemies = [], capsules = [], top = [];
    let c = 0, row = 13;
    const lay = (len, rw) => { ground.push([c, c + len, rw]); for (let i = 0; i < len; i++) top[c + i] = rw; c += len; };
    const hole = w => { const at = c; for (let i = 0; i < w; i++) top[c + i] = -1; c += w; return at + (w >> 1); };
    lay(14, 13);                                                    // safe start
    let lap = 0;
    while (c < 120 && lap < 3) {
      for (const s of plan.segments) {
        if (c > 190) break;
        const start = c, gaps = [], len = s.length;
        if (s.terrain === 'up') { row = Math.max(9, row - ri(1, 2)); lay(len, row); }
        else if (s.terrain === 'down') { row = Math.min(13, row + ri(1, 2)); lay(len, row); }
        else if (s.terrain === 'gap') {
          const nr = clamp(row + ri(-1, 1), 9, 13);
          gaps.push(hole(nr < row ? 2 : 3)); row = nr; lay(len, row);
        } else if (s.terrain === 'islands') {
          for (let i = 0, k = clamp(Math.round(len / 5), 2, 4); i < k; i++) { gaps.push(hole(2)); lay(ri(3, 4), row); }
        } else {
          lay(len, row);
          if (s.terrain === 'platforms') {
            plats.push([start + 1, row - 3, ri(3, 5)]);
            if (len >= 11) plats.push([start + len - 5, row - 3, ri(3, 4)]);
          } else if (len >= 10 && r() < 0.5) plats.push([start + ri(2, len - 6), row - 3, 4]);
        }
        // enemies spread over the floor of the segment; geysers go in its gaps, icicles only in the ice mine
        const floor = []; for (let x = start; x < c; x++) if (top[x] >= 0) floor.push(x);
        const walkers = s.enemies.filter(e => e !== 'geyser' && (e !== 'icicle' || theme === 'ice'));
        walkers.forEach((kind, i) => {
          const col = floor[Math.floor(((i + 0.5) / walkers.length) * floor.length)];
          if (col === undefined) return;
          if (kind === 'drone') enemies.push([kind, col, Math.max(2, top[col] - ri(6, 8))]);
          else enemies.push([kind, col]);
        });
        for (const e of s.enemies) if (e === 'geyser' && gaps.length) enemies.push(['geyser', gaps.shift()]);
        if (s.item) capsules.push([start + 1, s.item]);
      }
      lap++;
    }
    for (const [i, it] of ['S', 'A', 'L', 'M'].entries()) if (capsules.length < 4) capsules.push([Math.round(20 + i * (c - 30) / 4), it]);
    capsules.sort((a, b) => a[0] - b[0]);
    lay(34, clamp(row, 11, 13));                                    // boss arena: the last 30 columns, flat
    return {
      name: plan.name, sub: plan.sub, theme, music: theme, boss: plan.boss, cols: c, ground, plats, enemies, capsules,
      daily: date, brief: plan.brief, taunt: plan.taunt,
      ...(theme === 'ice' ? { ice: true } : {}), ...(theme === 'moon' ? { gravity: 0.2 } : {}),
    };
  }

  return { THEMES, PAIR, BOSS_NAMES, TERRAIN, ENEMIES, themeFor, sanitize, randomPlan, build, clean: str };
})();
if (typeof module === 'object' && module.exports) module.exports = DAILY;
