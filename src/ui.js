// ui.js — DOM interface over the 3D view: title, character select, HUD, banners, floating text.
// Reads the simulation view each frame and only touches the DOM when something changed.
'use strict';
const UI = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const pad = (n, k = 7) => String(Math.max(0, Math.floor(n))).padStart(k, '0');
  let root, el = {}, cache = new Map(), onTap = () => { }, onDiff = () => { };

  function set(node, key, val, fn) {
    const k = node.__id + key;
    if (cache.get(k) === val) return;
    cache.set(k, val); fn(val);
  }
  let idc = 0; const id = n => (n.__id = n.__id || 'n' + (idc++), n);
  const text = (node, v) => { id(node); set(node, 't', v, x => { node.textContent = x; }); };
  const html = (node, v) => { id(node); set(node, 'h', v, x => { node.innerHTML = x; }); };
  const cls = (node, c, on) => { id(node); set(node, 'c' + c, on, x => node.classList.toggle(c, x)); };
  const style = (node, p, v) => { id(node); set(node, 's' + p, v, x => node.style.setProperty(p, x)); };

  function init(r, tap, pickDiff) {
    root = r; onTap = tap; onDiff = pickDiff || onDiff;
    root.innerHTML = `
      <section class="scr scr-title">
        <div class="title-block">
          <p class="eyebrow">Biệt đội Sấm Sét</p>
          <h1 class="logo" data-text="BÃO LỬA">BÃO LỬA</h1>
          <p class="tagline">Ba chiến binh. Ba vùng đất. Tối đa bốn người cùng chơi.</p>
          <p class="press"></p>
          <p class="hi"></p>
        </div>
        <div class="keys">
          <div><h3>Bàn phím</h3><p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> hoặc <kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> di chuyển, ngắm</p><p><kbd>J</kbd>/<kbd>Z</kbd> bắn <kbd>K</kbd>/<kbd>X</kbd>/<kbd>Space</kbd> nhảy <kbd>L</kbd>/<kbd>C</kbd>/<kbd>Shift</kbd> lướt <kbd>I</kbd>/<kbd>V</kbd> Bão Lửa</p></div>
          <div><h3>Tay cầm</h3><p>Cần trái hoặc D-pad</p><p><kbd>X</kbd> bắn <kbd>A</kbd> nhảy <kbd>B</kbd> lướt <kbd>Y</kbd> Bão Lửa</p></div>
          <div><h3>Nhiều người</h3><p>Mỗi người một máy, vào chung phòng qua mạng LAN. Hoặc cắm thêm tay cầm vào cùng máy.</p></div>
        </div>
      </section>
      <section class="scr scr-select">
        <header><h2>Chọn chiến binh</h2><p>1 đến 4 người. Mỗi thiết bị bấm nút <b>Bắn</b> để vào đội.</p>
          <div class="diffs"><span class="dlabel">Độ khó</span><div class="dbtns">${DIFFS.map((d, i) => `<button type="button" class="dbtn" data-diff="${i}" style="--dc:${['#38d6b4', '#ffd23f', '#ff3b4f'][i]}">${d.name}</button>`).join('')}</div></div>
          <p class="ddesc"></p></header>
        <div class="cards"></div>
        <footer class="sel-hint"></footer>
      </section>
      <section class="hud">
        <div class="pps"></div>
        <div class="joinhint">Thêm người: bấm <b>Bắn</b> trên thiết bị mới</div>
        <div class="boss"><span class="bname"></span><div class="bbar"><i></i><b></b></div></div>
        <div class="bottom">
          <div class="hi2"></div>
          <div class="storm"><span class="slabel">Bão Lửa</span><div class="sbar"><i></i></div><span class="skey">I · V · Y</span></div>
          <div class="team"></div>
        </div>
      </section>
      <div class="floaters"></div>
      <section class="banner"></section>`;
    el = {
      press: $('.press', root), hi: $('.scr-title .hi', root), cards: $('.cards', root), selHint: $('.sel-hint', root),
      pps: $('.pps', root), joinhint: $('.joinhint', root), boss: $('.boss', root), bname: $('.bname', root), bfill: $('.bbar i', root), bghost: $('.bbar b', root),
      storm: $('.storm', root), dbtns: [...root.querySelectorAll('.dbtn')], ddesc: $('.ddesc', root), sfill: $('.sbar i', root), team: $('.team', root), hi2: $('.hi2', root), floaters: $('.floaters', root), banner: $('.banner', root),
    };
    for (let i = 0; i < 4; i++) {
      const c = h('article', 'card'); c.dataset.card = i; c.style.setProperty('--pc', PCOL[i]);
      c.innerHTML = `<div class="join"><span class="pn">P${i + 1}</span><b>Tham gia</b><span class="how"></span></div>
        <div class="who"><p class="slot"></p><h3 class="nm"></h3><p class="ttl"></p><p class="desc"></p>
          <dl class="stats"><dt>Tốc độ</dt><dd><i></i></dd><dt>Giáp</dt><dd><i></i></dd><dt>Kỹ thuật</dt><dd><i></i></dd></dl>
          <p class="state"></p></div>`;
      el.cards.appendChild(c);
    }
    for (let i = 0; i < 4; i++) {
      const p = h('div', 'pp'); p.style.setProperty('--pc', PCOL[i]);
      p.innerHTML = `<span class="badge">P${i + 1}</span><div class="pinfo"><div class="r1"><b class="pnm"></b><span class="psc"></span></div><div class="r2"><span class="lives"></span><span class="armor"></span><span class="wp"></span></div></div>`;
      el.pps.appendChild(p);
    }
    root.addEventListener('pointerdown', e => {
      const db = e.target.closest && e.target.closest('[data-diff]');
      if (db) { e.preventDefault(); onDiff(+db.dataset.diff); return; }
      const card = e.target.closest && e.target.closest('.card');
      onTap(card ? +card.dataset.card : -1, e.pointerType === 'touch');
    });
  }

  const floaterPool = [];
  function floater(i) {
    while (floaterPool.length <= i) { const f = h('span', 'fl'); el.floaters.appendChild(f); floaterPool.push(f); }
    return floaterPool[i];
  }

  function bannerHTML(V) {
    const G = V.G, L = V.Lv, st = V.state;
    if (st === 'victory' && G) return ['victory', `<div class="bx"><p class="k">Hoàn thành chiến dịch</p><h2>Chiến thắng</h2>
      <p>Cua Thép, Lò Rèn, Long Hạm, Voi Băng và Mắt Thần đều đã sụp đổ. Độ khó: <b>${DIFFS[G.diff || 0].name}</b></p>
      <ul>${G.players.map(p => `<li style="--pc:${PCOL[p.num]}"><span>P${p.num + 1} ${CHARS[p.ci].name}</span><b>${pad(p.score, 6)}</b></li>`).join('')}</ul>
      <p class="big">Đội ${pad(V.team)}</p>${V.stateT > 90 ? '<p class="cta">Bấm Bắn hoặc Enter để về màn hình chính</p>' : ''}</div>`];
    if (!L || !G) return ['', ''];
    if (st === 'over') return ['over', `<div class="bx"><h2>Cả đội đã ngã</h2><p>Điểm đội ${pad(V.team)} · Màn ${G.stage + 1}</p>${V.stateT > 40 ? `<p class="cta">${V.isTouch ? 'Chạm để chơi lại màn này' : 'Bắn hoặc Enter: chơi lại màn này · Esc: về màn hình chính'}</p>` : ''}</div>`];
    if (st === 'clear') return ['clear', `<div class="bx"><p class="k">Màn ${G.stage + 1} · ${L.d.name}</p><h2>Hoàn thành</h2>
      <ul>${G.players.map(p => `<li style="--pc:${PCOL[p.num]}"><span>P${p.num + 1} thưởng mạng +${(p.lives + 1) * 1000}</span><b>${pad(p.score, 6)}</b></li>`).join('')}</ul>
      ${V.stateT > 60 ? `<p class="cta">${G.stage + 1 < LEVELS.length ? 'Bấm Bắn hoặc Enter để sang màn tiếp' : 'Bấm Bắn hoặc Enter để xem kết thúc'}</p>` : ''}</div>`];
    if (V.paused) return ['pause', `<div class="bx"><h2>Tạm dừng</h2><p class="cta">${V.isTouch ? 'Chạm màn hình để chơi tiếp' : 'P, Esc hoặc Start để chơi tiếp'}</p></div>`];
    if (L.bossState === 'warn') return ['warn', `<div class="stripes"></div><h2>Cảnh báo</h2><p>Trùm đang tới</p><div class="stripes"></div>`];
    if (L.introT > 0) return ['intro', `<p class="k">Màn ${G.stage + 1}</p><h2>${L.d.name}</h2><p>${L.d.sub}</p>`];
    return ['', ''];
  }

  function render(V) {
    const st = V.state, inGame = st === 'play' || st === 'clear' || st === 'over';
    root.dataset.state = (st === 'play' || st === 'clear' || st === 'over') && (!V.Lv || !V.G) ? 'title' : st;

    if (st === 'title') {
      text(el.press, V.isTouch ? 'Chạm để bắt đầu' : 'Nhấn Enter hoặc J để bắt đầu');
      text(el.hi, V.hiscore ? 'Kỷ lục đội ' + pad(V.hiscore) : '');
    }

    if (st === 'select') {
      const cards = el.cards.children;
      for (let i = 0; i < 4; i++) {
        const c = cards[i], l = V.lobby[i];
        cls(c, 'on', !!l); cls(c, 'ready', !!(l && l.ready));
        if (!l) { text(c.querySelector('.how'), V.isTouch ? 'Chạm màn hình' : V.splitKb ? 'F · Enter · A/X tay cầm' : 'J · Enter · A/X tay cầm'); continue; }
        const ch = CHARS[l.ci];
        text(c.querySelector('.slot'), `P${i + 1} · ${V.slotName(l.slot)}`);
        text(c.querySelector('.nm'), ch.name); style(c, '--hc', ch.pal.main);
        text(c.querySelector('.ttl'), ch.title + ' · ' + ch.role);
        text(c.querySelector('.desc'), ch.desc);
        c.querySelectorAll('.stats dd i').forEach((b, k) => style(b, 'width', ch.stats[k] * 20 + '%'));
        text(c.querySelector('.state'), l.ready ? 'Sẵn sàng' : (V.isTouch ? 'Chạm thẻ để sẵn sàng' : '◀ ▶ đổi nhân vật · Bắn để chọn'));
      }
      el.dbtns.forEach((b, i) => cls(b, 'on', i === V.difficulty));
      html(el.ddesc, DIFFS[V.difficulty].desc + (V.isTouch ? '' : ' <span class="dk"><kbd>↑</kbd><kbd>↓</kbd> đổi độ khó</span>'));
      const all = V.lobby.length && V.lobby.every(l => l.ready);
      cls(el.selHint, 'go', !!all);
      text(el.selHint, all ? 'Vào trận!' : V.isTouch ? 'Chạm thẻ của bạn để sẵn sàng' : 'Lướt: rời đội hoặc huỷ sẵn sàng · Esc: quay lại · Tab: ' + (V.splitKb ? 'tắt chế độ 2 người chung bàn phím' : '2 người chung một bàn phím'));
    }

    if (inGame && V.G && V.Lv) {
      const G = V.G, L = V.Lv, pps = el.pps.children;
      for (let i = 0; i < 4; i++) {
        const pr = G.players[i], node = pps[i];
        cls(node, 'show', !!pr); if (!pr) continue;
        const p = L.players[i], ch = CHARS[pr.ci];
        text(node.querySelector('.pnm'), ch.name); style(node, '--hc', ch.pal.main);
        text(node.querySelector('.psc'), pad(pr.score, 6));
        const ghost = p && p.ghost;
        cls(node, 'ghost', !!ghost);
        html(node.querySelector('.lives'), ghost ? '' : '<i></i>'.repeat(Math.min(pr.lives, 6)) + (pr.lives > 6 ? `<em>+${pr.lives - 6}</em>` : ''));
        const mh = p ? (p.maxHp || ch.hp) : ch.hp;
        html(node.querySelector('.armor'), !ghost && mh > 1 && p && !p.dead ? Array.from({ length: mh }, (_, k) => `<i class="${k < p.hp ? 'on' : ''}"></i>`).join('') : '');
        text(node.querySelector('.wp'), ghost ? (p.reviveT > 0 ? 'Đang hồi sinh…' : 'Đứng cạnh để cứu') : (WEAPONS[pr.weapon] || WEAPONS.P).name + (pr.rapid ? ' +' : ''));
        if (!ghost) style(node.querySelector('.wp'), 'color', pr.weapon === 'P' ? '' : (WEAPONS[pr.weapon] || WEAPONS.P).col);
        cls(node.querySelector('.wp'), 'hot', !ghost && pr.weapon !== 'P');
      }
      cls(el.joinhint, 'show', st === 'play' && G.players.length < 4 && L.t % 480 < 240);
      const b = L.boss, fight = !!(b && L.bossState === 'fight');
      cls(el.boss, 'show', fight);
      if (fight) {
        text(el.bname, b.name);
        const k = Math.max(0, b.hp / b.maxHp);
        style(el.bfill, 'width', (k * 100).toFixed(1) + '%'); cls(el.boss, 'low', k < 0.4);
        style(el.bghost, 'width', (k * 100).toFixed(1) + '%');
      }
      const full = G.storm >= 100;
      style(el.sfill, 'width', G.storm.toFixed(1) + '%'); cls(el.storm, 'full', full);
      text(el.storm.querySelector('.skey'), V.splitKb ? 'R · L · Y' : 'I · V · Y');
      text(el.team, 'Đội ' + pad(V.team));
      text(el.hi2, 'Độ khó ' + DIFFS[V.difficulty].name + ' · Kỷ lục ' + pad(Math.max(V.hiscore, V.team)));

      // floating texts and player tags
      let n = 0;
      for (const t of L.texts) {
        const f = floater(n++), p = VIEW3D.project(t.x, t.y, 0.5);
        f.textContent = t.s; f.style.color = t.c; f.style.opacity = Math.min(1, t.life / 20);
        f.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`; f.className = 'fl';
      }
      if (G.players.length > 1) for (const p of L.players) {
        if (!p || p.dead || p.ghost) continue;
        const f = floater(n++), q = VIEW3D.project(p.x + p.w / 2, p.y - 18, 0);
        f.textContent = 'P' + (p.pr.num + 1); f.style.color = PCOL[p.pr.num]; f.style.opacity = 1;
        f.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px) translate(-50%, -50%)`; f.className = 'fl tag';
      }
      for (let i = n; i < floaterPool.length; i++) if (floaterPool[i].style.opacity !== '0') floaterPool[i].style.opacity = 0;
    } else for (const f of floaterPool) if (f.style.opacity !== '0') f.style.opacity = 0;

    const [kind, body] = bannerHTML(V);
    cls(el.banner, 'show', !!kind);
    id(el.banner); set(el.banner, 'kind', kind, k => { el.banner.dataset.kind = k; });
    html(el.banner, body);
  }

  return { init, render };
})();
