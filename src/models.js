// models.js — low-poly 3D models built from primitives. Every model is a THREE.Group whose
// userData.animate(state) poses it from simulation state, so host and LAN guests draw the same thing.
'use strict';
const MODELS = (() => {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({
    color, roughness: o.r ?? 0.5, metalness: o.m ?? 0.3, flatShading: o.flat ?? true,
    emissive: new THREE.Color(o.ec || (o.e ? color : '#000000')), emissiveIntensity: o.e || (o.ec ? 1 : 0),
  });
  const glow = (color, o = {}) => new THREE.MeshBasicMaterial({
    color, toneMapped: false, transparent: !!o.add || o.op !== undefined, opacity: o.op ?? 1,
    blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.add, side: o.side || THREE.FrontSide,
  });
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const S = (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs);
  const CY = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
  const CO = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
  const UNIT_Y = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3();

  function mesh(geo, mat, x = 0, y = 0, z = 0, parent, shadow = true) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = shadow; if (parent) parent.add(m); return m;
  }
  function group(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; }
  // a unit-length box along +y, stretched between two points each frame (legs, limbs)
  function strut(parent, thick, mat) { return mesh(B(thick, 1, thick), mat, 0, 0, 0, parent); }
  function placeStrut(m, a, b) {
    tmpV.subVectors(b, a); const len = tmpV.length() || 0.001;
    m.position.copy(a).addScaledVector(tmpV, 0.5); m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(UNIT_Y, tmpV.divideScalar(len));
  }

  // hit flash: every standard material on the model is unique, so it can be tinted white per model
  function prepFlash(root) {
    const list = [];
    root.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) list.push({ m: o.material, e: o.material.emissive.clone(), i: o.material.emissiveIntensity }); });
    root.userData.flashList = list; root.userData.flashOn = false;
  }
  function setFlash(root, on, k = 0.85) {
    if (root.userData.flashOn === on) return;
    root.userData.flashOn = on;
    for (const it of root.userData.flashList || []) {
      if (on) { it.m.emissive.setRGB(1, 1, 1); it.m.emissiveIntensity = k; }
      else { it.m.emissive.copy(it.e); it.m.emissiveIntensity = it.i; }
    }
  }
  function face(root, dir, turn = 0.32) { root.scale.x = dir < 0 ? -1 : 1; root.rotation.y = dir < 0 ? turn : -turn; }

  function letterTexture(ch, color) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = color; g.font = '900 92px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18; g.fillText(ch, 64, 70); g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.fillText(ch, 64, 70);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function stripeTexture(a, b, n = 6) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); g.fillStyle = a; g.fillRect(0, 0, 64, 64); g.fillStyle = b;
    for (let i = -64; i < 128; i += 64 / n * 2) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64 / n, 0); g.lineTo(i + 64 / n - 64, 64); g.lineTo(i - 64, 64); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  // ---------- heroes ----------
  function hero(ci, ghostMat) {
    const ch = CHARS[ci], p = ch.pal, id = ch.id, k = id === 'rex' ? 1.14 : id === 'linh' ? 0.9 : 1;
    const M = c => ghostMat || c;
    const main = M(std(p.main, { r: 0.42, m: 0.35, ec: p.main })), dark = M(std(p.dark, { r: 0.6, m: 0.3 })), light = M(std(p.light, { r: 0.35, m: 0.3, ec: p.light }));
    if (!ghostMat) { main.emissiveIntensity = 0.3; light.emissiveIntensity = 0.25; }
    const trim = M(std(p.trim, { r: 0.65, m: 0.5 })), visor = M(glow(p.visor)), gunMat = M(std('#b9bfd6', { m: 0.8, r: 0.25 }));
    const root = new THREE.Group(), body = group(root), hips = group(body, 0, 0.8, 0);
    const legs = [];
    for (const z of [-0.14 * k, 0.14 * k]) {
      const thigh = group(hips, 0, 0, z);
      mesh(B(0.22 * k, 0.44, 0.22), z < 0 ? dark : main, 0, -0.2, 0, thigh);
      const knee = group(thigh, 0, -0.42, 0);
      mesh(B(0.2 * k, 0.36, 0.2), z < 0 ? dark : main, 0, -0.17, 0, knee);
      mesh(B(0.12, 0.13, 0.22), light, 0.1, -0.02, 0, knee);
      mesh(B(0.34, 0.13, 0.26), trim, 0.05, -0.36, 0, knee);
      legs.push({ thigh, knee });
    }
    const torso = group(hips);
    mesh(B(0.46 * k, 0.52, 0.42 * k), main, 0, 0.31, 0, torso);
    mesh(B(0.28 * k, 0.26, 0.44 * k), light, 0.1, 0.4, 0, torso);
    mesh(B(0.5 * k, 0.1, 0.46 * k), trim, 0, 0.06, 0, torso);
    mesh(B(0.06, 0.07, 0.12), M(glow('#ffd23f')), 0.25 * k, 0.06, 0, torso);
    const head = group(torso, 0, 0.74, 0);
    mesh(B(0.4, 0.38, 0.38), main, 0, 0, 0, head);
    mesh(B(0.44, 0.08, 0.42), dark, 0, 0.18, 0, head);
    mesh(B(0.3, 0.12, 0.3), trim, -0.04, -0.2, 0, head);
    let tipLight = null; const scarf = [];
    if (id === 'tobi') {
      for (const z of [-0.09, 0.09]) { const g = mesh(CY(0.075, 0.075, 0.1, 12), visor, 0.2, 0.04, z, head); g.rotation.z = Math.PI / 2; }
      mesh(B(0.04, 0.05, 0.38), trim, 0.2, 0.04, 0, head);
      mesh(B(0.22, 0.44, 0.36), dark, -0.33, 0.33, 0, torso);
      mesh(B(0.08, 0.3, 0.3), light, -0.45, 0.33, 0, torso);
      mesh(CY(0.015, 0.015, 0.5, 6), gunMat, -0.38, 0.8, 0.1, torso);
      tipLight = mesh(S(0.05, 8, 6), M(glow('#ff4f6a')), -0.38, 1.06, 0.1, torso, false);
    } else {
      mesh(B(0.07, 0.12, 0.32), visor, 0.2, 0.03, 0, head);
    }
    if (id === 'rex') {
      for (const z of [-0.32, 0.32]) { mesh(B(0.34, 0.18, 0.2), light, 0, 0.58, z, torso); mesh(B(0.3, 0.06, 0.22), dark, 0, 0.68, z, torso); }
      mesh(B(0.24, 0.08, 0.05), M(glow(p.visor)), -0.02, 0.26, 0, head);
      mesh(B(0.18, 0.2, 0.46), dark, -0.1, 0.32, 0, torso);
    }
    if (id === 'linh') {
      mesh(B(0.12, 0.3, 0.12), dark, -0.24, -0.08, 0, head);
      const sm = M(std(p.scarf, { r: 0.5, m: 0.1 }));
      for (let i = 0; i < 7; i++) scarf.push(mesh(B(0.14, 0.09, 0.16 - i * 0.012), sm, 0, 0, 0, torso));
    }
    // arms: the gun arm sits on the camera side (+z), the support arm behind
    const backArm = group(torso, 0.02, 0.5, -0.3 * k);
    mesh(B(0.36, 0.13, 0.13), dark, 0.16, 0, 0, backArm);
    const gunArm = group(torso, 0.02, 0.5, 0.3 * k);
    mesh(B(0.34, 0.14, 0.14), main, 0.15, 0, 0, gunArm);
    mesh(B(0.12, 0.12, 0.12), trim, 0.34, -0.02, 0, gunArm);
    const gun = group(gunArm, 0.34, 0.02, -0.06);
    mesh(B(0.5, 0.15, 0.12), trim, 0.18, 0, 0, gun);
    mesh(B(0.3, 0.05, 0.13), gunMat, 0.2, 0.09, 0, gun);
    const barrel = mesh(CY(0.045, 0.045, 0.32, 8), gunMat, 0.56, 0.01, 0, gun); barrel.rotation.z = Math.PI / 2;
    mesh(B(0.04, 0.05, 0.14), M(glow(p.visor)), 0.05, 0.04, 0, gun);
    const flash = group(gun, 0.8, 0.01, 0);
    const fm = glow('#fff2a8', { add: true });
    for (let i = 0; i < 2; i++) { const pl = mesh(new THREE.PlaneGeometry(0.55, 0.26), fm, 0, 0, 0, flash, false); pl.rotation.x = i * Math.PI / 2; }
    mesh(S(0.12, 8, 6), fm, -0.08, 0, 0, flash, false);
    flash.visible = false;
    if (!ghostMat) prepFlash(root);

    const pose = { t0: 0, t1: 0, k0: 0, k1: 0, hip: 0.8, lean: 0 };
    root.userData.animate = s => {
      const L0 = { thigh: { rotation: {} }, knee: { rotation: {} } }, L1 = { thigh: { rotation: {} }, knee: { rotation: {} } };
      let hipY = 0.8, lean = 0;
      if (s.crouch) {
        hipY = 0.46; L0.thigh.rotation.z = 1.35; L0.knee.rotation.z = -2.1; L1.thigh.rotation.z = 0.25; L1.knee.rotation.z = -1.55;
      } else if (!s.onGround) {
        L0.thigh.rotation.z = 0.95; L0.knee.rotation.z = -1.4; L1.thigh.rotation.z = -0.25; L1.knee.rotation.z = -0.8;
      } else if (s.running) {
        const a = s.phase, sa = Math.sin(a);
        L0.thigh.rotation.z = sa * 0.8; L1.thigh.rotation.z = -sa * 0.8;
        L0.knee.rotation.z = -Math.max(0, -Math.cos(a)) * 1.2 - 0.1; L1.knee.rotation.z = -Math.max(0, Math.cos(a)) * 1.2 - 0.1;
        hipY += Math.abs(Math.cos(a)) * 0.06; lean = -0.12;
      } else {
        L0.thigh.rotation.z = 0.05; L1.thigh.rotation.z = -0.05; L0.knee.rotation.z = L1.knee.rotation.z = -0.06;
        torso.scale.y = 1 + Math.sin(s.t * 0.08) * 0.015;
      }
      if (s.dash) lean = -0.5;
      // ease toward the target pose; running and crouching respond faster than landing/idle
      const k = s.running || s.crouch || s.dash ? 0.6 : 0.35;
      pose.t0 += (L0.thigh.rotation.z - pose.t0) * k; pose.t1 += (L1.thigh.rotation.z - pose.t1) * k;
      pose.k0 += (L0.knee.rotation.z - pose.k0) * k; pose.k1 += (L1.knee.rotation.z - pose.k1) * k;
      pose.hip += (hipY - pose.hip) * k; pose.lean += (lean - pose.lean) * k;
      legs[0].thigh.rotation.z = pose.t0; legs[1].thigh.rotation.z = pose.t1;
      legs[0].knee.rotation.z = pose.k0; legs[1].knee.rotation.z = pose.k1;
      lean = pose.lean;
      hips.position.y = pose.hip; body.rotation.z = lean;
      gunArm.rotation.z = s.aim - lean; backArm.rotation.z = s.aim - lean - 0.18;
      head.rotation.z = Math.max(-0.35, Math.min(0.45, s.aim * 0.35));
      flash.visible = s.flash > 0;
      if (flash.visible) { flash.scale.setScalar(0.7 + Math.random() * 0.6); flash.rotation.x = Math.random() * 3; }
      if (tipLight) tipLight.visible = s.t % 30 < 15;
      for (let i = 0; i < scarf.length; i++) {
        const sw = Math.sin(s.t * 0.3 + i * 0.9) * 0.05 * i, drag = s.running || s.dash ? 0.15 : 0.07;
        scarf[i].position.set(-0.12 - i * 0.12, 0.66 - i * drag * 0.3 + sw, 0.05);
        scarf[i].rotation.z = Math.sin(s.t * 0.3 + i) * 0.3;
      }
      if (!ghostMat) setFlash(root, s.hit > 0);
    };
    return root;
  }

  // ---------- enemies ----------
  function soldier() {
    const metal = std('#5d6a8c', { m: 0.6, r: 0.35 }), dm = std('#262b3d', { m: 0.5, r: 0.5 }), lm = std('#a3b0d0', { m: 0.6, r: 0.3 });
    const root = new THREE.Group(), hips = group(root, 0, 0.62, 0), legs = [];
    for (const z of [-0.12, 0.12]) {
      const th = group(hips, 0, 0, z); mesh(B(0.16, 0.34, 0.16), z < 0 ? dm : metal, 0, -0.16, 0, th);
      const kn = group(th, 0, -0.32, 0); mesh(B(0.15, 0.3, 0.15), dm, 0, -0.14, 0, kn); mesh(B(0.26, 0.09, 0.2), dm, 0.05, -0.3, 0, kn);
      legs.push({ th, kn });
    }
    const torso = group(hips);
    mesh(B(0.38, 0.42, 0.36), metal, 0, 0.24, 0, torso);
    mesh(B(0.22, 0.22, 0.38), lm, 0.08, 0.3, 0, torso);
    mesh(B(0.16, 0.3, 0.26), dm, -0.24, 0.26, 0, torso);
    mesh(B(0.06, 0.18, 0.12), glow('#ff3b4f'), -0.33, 0.26, 0, torso);
    const head = group(torso, 0, 0.6, 0);
    mesh(B(0.3, 0.24, 0.28), metal, 0, 0, 0, head); mesh(B(0.06, 0.06, 0.24), glow('#ff2a44'), 0.15, 0.02, 0, head);
    mesh(CY(0.012, 0.012, 0.22, 5), lm, -0.06, 0.22, 0.06, head);
    const arm = group(torso, 0.02, 0.38, 0.24);
    mesh(B(0.3, 0.12, 0.12), dm, 0.12, 0, 0, arm); mesh(B(0.55, 0.11, 0.1), dm, 0.42, 0.02, 0, arm); mesh(B(0.14, 0.04, 0.11), glow('#ff6070'), 0.3, 0.08, 0, arm);
    const fl = mesh(S(0.13, 8, 6), glow('#ffb0b8', { add: true }), 0.76, 0.02, 0, arm, false); fl.visible = false;
    prepFlash(root);
    root.userData.animate = (e, t) => {
      face(root, e.face);
      const run = e.vx !== 0, a = e.anim * 0.35;
      legs[0].th.rotation.z = run ? Math.sin(a) * 0.7 : 0; legs[1].th.rotation.z = run ? -Math.sin(a) * 0.7 : 0;
      legs[0].kn.rotation.z = run ? -Math.max(0, -Math.cos(a)) : 0; legs[1].kn.rotation.z = run ? -Math.max(0, Math.cos(a)) : 0;
      hips.position.y = 0.62 + (run ? Math.abs(Math.cos(a)) * 0.04 : 0);
      arm.rotation.z = e.stopT > 0 ? 0 : -0.5;
      fl.visible = e.muzzle > 0;
      setFlash(root, e.flash > 0);
    };
    return root;
  }

  function turret() {
    const dm = std('#2e3346', { m: 0.6, r: 0.45 }), metal = std('#56607e', { m: 0.7, r: 0.3 });
    const root = new THREE.Group();
    mesh(CY(0.55, 0.62, 0.26, 12), dm, 0, 0.13, 0, root);
    const ring = mesh(new THREE.TorusGeometry(0.5, 0.035, 6, 24), glow('#ff3b4f'), 0, 0.27, 0, root, false); ring.rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal, 0, 0.26, 0, root);
    const pivot = group(root, 0, 0.48, 0);
    mesh(B(0.24, 0.22, 0.26), dm, 0.05, 0, 0, pivot);
    const bar = mesh(CY(0.07, 0.08, 0.7, 10), metal, 0.45, 0, 0, pivot); bar.rotation.z = Math.PI / 2;
    const tip = mesh(CY(0.09, 0.09, 0.08, 10), glow('#ff3b4f'), 0.82, 0, 0, pivot, false); tip.rotation.z = Math.PI / 2;
    prepFlash(root);
    root.userData.animate = (e, t) => {
      pivot.rotation.z = -e.ang;
      tip.material.color.set(e.fireT < 20 ? '#ff3b4f' : '#4a1018');
      ring.material.color.set(t % 40 < 20 ? '#ff3b4f' : '#6b1e2a');
      setFlash(root, e.flash > 0);
    };
    return root;
  }

  function drone(color = '#8d95b5', eyeCol = '#ff3b4f', scale = 1) {
    const body = std(color, { m: 0.65, r: 0.3 }), dm = std('#2f3446', { m: 0.5, r: 0.5 });
    const root = new THREE.Group(), hull = group(root);
    const shell = mesh(S(0.42, 16, 10), body, 0, 0, 0, hull); shell.scale.set(1, 0.48, 1);
    const ring = mesh(new THREE.TorusGeometry(0.43, 0.05, 6, 20), dm, 0, 0, 0, hull); ring.rotation.x = Math.PI / 2;
    const eye = mesh(S(0.1, 10, 8), glow(eyeCol), 0.3, -0.08, 0.12, hull, false);
    const rotors = [];
    for (const z of [-0.36, 0.36]) {
      mesh(B(0.06, 0.18, 0.06), dm, 0, 0.18, z, hull);
      const r = group(hull, 0, 0.29, z); rotors.push(r);
      mesh(B(0.62, 0.02, 0.08), std('#c9cfe6', { m: 0.5 }), 0, 0, 0, r, false);
      mesh(B(0.08, 0.02, 0.62), std('#c9cfe6', { m: 0.5 }), 0, 0, 0, r, false);
    }
    const under = mesh(new THREE.CircleGeometry(0.22, 16), glow(eyeCol, { add: true, op: 0.6 }), 0, -0.2, 0, hull, false); under.rotation.x = Math.PI / 2;
    root.scale.setScalar(scale);
    prepFlash(root);
    root.userData.animate = (e, t) => {
      for (const r of rotors) r.rotation.y = t * 0.9;
      hull.rotation.z = Math.max(-0.4, Math.min(0.4, -(e.vx || 0) * 0.15));
      hull.rotation.x = Math.sin(t * 0.07) * 0.08;
      eye.visible = t % 20 < 14;
      setFlash(root, (e.flash || 0) > 0);
    };
    return root;
  }

  function hopper() {
    const shell = std('#7a3fb0', { m: 0.35, r: 0.18 }), dm = std('#2a1838', { m: 0.3, r: 0.6 });
    const root = new THREE.Group(), bodyG = group(root, 0, 0.36, 0);
    const sh = mesh(S(0.5, 16, 10), shell, 0, 0, 0, bodyG); sh.scale.set(1.05, 0.62, 0.82);
    mesh(B(0.9, 0.05, 0.05), glow('#e08aff'), 0, 0.3, 0, bodyG);
    const hd = mesh(S(0.22, 10, 8), dm, 0.48, -0.04, 0, bodyG); hd.scale.set(1, 0.8, 1);
    for (const z of [-0.1, 0.1]) mesh(S(0.06, 8, 6), glow('#ffd23f'), 0.64, 0.02, z, bodyG, false);
    const legs = [];
    for (const z of [-1, 1]) for (let i = 0; i < 3; i++) legs.push({ m: strut(root, 0.05, dm), x: -0.3 + i * 0.3, z });
    prepFlash(root);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    root.userData.animate = (e, t) => {
      face(root, e.face || -1, 0.2);
      const air = !e.onGround;
      bodyG.rotation.z = air ? Math.max(-0.5, Math.min(0.5, -(e.vy || 0) * 0.08)) : 0;
      for (const L of legs) {
        a.set(L.x, 0.3, L.z * 0.25);
        b.set(L.x + (air ? -0.15 : 0.05), air ? -0.05 : 0.0, L.z * (air ? 0.4 : 0.55));
        placeStrut(L.m, a, b);
      }
      setFlash(root, e.flash > 0);
    };
    return root;
  }

  function capsule() {
    const root = new THREE.Group(), hull = group(root);
    const body = mesh(S(0.4, 16, 10), std('#c9cfe6', { m: 0.8, r: 0.2 }), 0, 0, 0, hull); body.scale.set(1.3, 0.75, 0.8);
    mesh(S(0.2, 12, 8), glow('#ff4f86'), 0.12, 0, 0.18, hull, false);
    const wings = [];
    for (const z of [-1, 1]) {
      const w = group(hull, -0.1, 0.1, z * 0.25); wings.push(w);
      mesh(B(0.5, 0.04, 0.6), std('#7c849e', { m: 0.6 }), 0, 0, z * 0.3, w);
      mesh(B(0.4, 0.05, 0.05), glow('#ffd23f'), 0.05, 0.03, z * 0.58, w, false);
    }
    prepFlash(root);
    root.userData.animate = (e, t) => {
      wings[0].rotation.x = -0.4 + Math.sin(t * 0.5) * 0.5; wings[1].rotation.x = 0.4 - Math.sin(t * 0.5) * 0.5;
      hull.rotation.z = Math.sin(t * 0.07) * 0.2;
      setFlash(root, e.flash > 0);
    };
    return root;
  }

  const POWER_COL = { S: '#ff6a3d', L: '#38d6b4', H: '#c18af0', R: '#ffd23f' };
  function power(kind) {
    const col = POWER_COL[kind] || '#ffd23f';
    const root = new THREE.Group(), spin = group(root, 0, 0.35, 0);
    const coin = mesh(CY(0.4, 0.4, 0.12, 6), std('#ffcf4a', { m: 0.9, r: 0.2, ec: '#7a4a00' }), 0, 0, 0, spin); coin.rotation.x = Math.PI / 2;
    const tex = letterTexture(kind, col);
    for (const s of [1, -1]) { const pl = mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }), 0, 0, s * 0.07, spin, false); if (s < 0) pl.rotation.y = Math.PI; }
    for (const s of [-1, 1]) { const w = mesh(B(0.42, 0.08, 0.06), glow(col), s * 0.55, 0.12, 0, spin, false); w.rotation.z = s * 0.35; }
    const halo = mesh(S(0.55, 12, 8), glow(col, { add: true, op: 0.25 }), 0, 0.35, 0, root, false);
    root.userData.animate = (e, t) => {
      spin.rotation.y = t * 0.06; spin.position.y = 0.35 + Math.sin(t * 0.1) * 0.08;
      halo.scale.setScalar(0.9 + Math.sin(t * 0.2) * 0.12);
      root.visible = !(e.life > 420 && Math.floor(t / 4) % 2);
    };
    return root;
  }

  // ---------- bosses ----------
  function crab() {
    const red = std('#c23a2a', { m: 0.55, r: 0.32 }), red2 = std('#ff7a52', { m: 0.45, r: 0.3 }), dm = std('#3a1820', { m: 0.5, r: 0.5 }), iron = std('#3a3448', { m: 0.7, r: 0.35 });
    const root = new THREE.Group(), body = group(root, 0, 2.0, 0);
    const shell = mesh(S(1, 20, 14), red, 0, 0, 0, body); shell.scale.set(2.5, 1.0, 1.55);
    const top = mesh(S(1, 16, 10), red2, -0.3, 0.45, 0, body); top.scale.set(1.6, 0.45, 1.0);
    for (let i = 0; i < 5; i++) mesh(B(0.12, 0.5, 2.6), dm, -1.6 + i * 0.8, 0.25, 0, body);
    mesh(B(4.4, 0.35, 2.4), dm, 0, -0.75, 0, body);
    const eyes = [];
    for (const z of [-0.45, 0.45]) {
      mesh(CY(0.07, 0.07, 0.9, 6), dm, 1.4, 0.95, z, body);
      eyes.push(mesh(S(0.2, 12, 8), glow('#ffd23f'), 1.45, 1.42, z, body, false));
    }
    const can = group(body, -0.4, 1.0, 0);
    mesh(B(1.1, 0.45, 0.7), iron, 0, 0, 0, can);
    const cb = mesh(CY(0.14, 0.16, 1.1, 10), iron, 0.8, 0.12, 0, can); cb.rotation.z = Math.PI / 2 - 0.25;
    const muzzle = mesh(S(0.16, 10, 8), glow('#ffd23f'), 1.35, 0.27, 0, can, false);
    const claws = [];
    for (const z of [-1.05, 1.05]) {
      const arm = group(body, 2.0, -0.3, z), big = z > 0;
      const sc = big ? 1.15 : 0.8;
      mesh(B(0.9, 0.3, 0.3), dm, 0.35, 0, 0, arm);
      const pinch = group(arm, 0.95, 0, 0);
      const up = mesh(B(1.1 * sc, 0.36 * sc, 0.5 * sc), red, 0.5 * sc, 0.2 * sc, 0, pinch);
      const upJ = group(pinch); up.removeFromParent(); upJ.add(up);
      const lo = mesh(B(0.9 * sc, 0.28 * sc, 0.45 * sc), red2, 0.42 * sc, -0.18 * sc, 0, pinch);
      claws.push({ arm, upJ, lo, sc });
    }
    const legs = [];
    for (const z of [-1, 1]) for (let i = 0; i < 3; i++) legs.push({ a: strut(root, 0.2, dm), b: strut(root, 0.16, red), x: -1.3 + i * 1.1, z, i });
    prepFlash(root);
    const h = new THREE.Vector3(), kn = new THREE.Vector3(), ft = new THREE.Vector3();
    root.userData.animate = (b, t) => {
      face(root, b.face, 0.22);
      const crouch = b.mode === 'crouch' ? 0.35 + (t % 4 < 2 ? 0.05 : 0) : 0, leap = b.mode === 'leap', walk = b.vx ? t * 0.25 : 0;
      body.position.y = 2.0 - crouch;
      for (const L of legs) {
        const lift = leap ? 0.4 : Math.max(0, Math.sin(walk + L.i * 2.1 + (L.z > 0 ? Math.PI : 0))) * 0.35;
        h.set(L.x, 1.75 - crouch, L.z * 1.0);
        kn.set(L.x * 1.15, 2.5 - crouch - lift * 0.3, L.z * 2.0);
        ft.set(L.x * 1.25 + (leap ? 0 : Math.sin(walk + L.i) * 0.2), lift, L.z * 2.5);
        placeStrut(L.a, h, kn); placeStrut(L.b, kn, ft);
      }
      const open = b.mode === 'crouch' ? 0.6 : (Math.sin(t * 0.12) + 1) * 0.18;
      for (const c of claws) { c.upJ.rotation.z = open; c.lo.rotation.z = -open * 0.4; c.arm.rotation.z = b.mode === 'crouch' ? 0.4 : Math.sin(t * 0.05) * 0.1; }
      const ph2 = b.hp < b.maxHp * 0.5;
      for (const e of eyes) e.material.color.set(ph2 ? '#ff3b4f' : '#ffd23f');
      muzzle.visible = b.shootT < 14;
      setFlash(root, b.flash > 0 && t % 6 < 2, 0.4);
    };
    return root;
  }

  function core() {
    const iron = std('#2a2532', { m: 0.7, r: 0.45 }), iron2 = std('#40384c', { m: 0.7, r: 0.4 }), rust = std('#5a3328', { m: 0.4, r: 0.7 });
    const root = new THREE.Group();
    // geometry in boss-local units: origin = (b.x, ground), x to the right, y up
    mesh(B(6.2, 9.4, 4.2), iron, 3.6, 4.7, -0.6, root);
    mesh(B(6.6, 0.5, 4.6), iron2, 3.6, 9.5, -0.6, root);
    mesh(B(0.7, 10.2, 4.6), iron2, 0.6, 5.1, -0.6, root);
    for (let y = 1.4; y < 9; y += 1.1) { mesh(B(0.14, 0.14, 0.14), rust, 0.92, y, 1.65, root); }
    for (let i = 0; i < 2; i++) { mesh(CY(0.65, 0.8, 2.2, 12), iron2, 4.6 + i * 1.7, 10.8, -1.2, root); }
    const flames = [];
    for (let i = 0; i < 2; i++) for (let k = 0; k < 3; k++) {
      const f = mesh(CO(0.45 - k * 0.1, 1.4, 8), glow(k === 0 ? '#ff6a2a' : k === 1 ? '#ffb43d' : '#fff3c4', { add: true, op: 0.85 }), 4.6 + i * 1.7, 12.4, -1.2, root, false);
      flames.push({ f, k, i });
    }
    const vents = [];
    for (let k = 0; k < 5; k++) vents.push(mesh(B(1.5, 0.16, 0.1), glow('#ff5a1f'), 2.2, 1.0 + k * 0.42, 1.55, root, false), mesh(B(1.5, 0.16, 0.1), glow('#ff5a1f'), 5.2, 1.0 + k * 0.42, 1.55, root, false));
    const cx = 60 / 16, cy = 92 / 16;
    const ring = mesh(new THREE.TorusGeometry(1.75, 0.3, 10, 28), iron2, cx, cy, 1.55, root);
    mesh(new THREE.CircleGeometry(1.6, 28), std('#120d14', { m: 0.2, r: 0.9 }), cx, cy, 1.52, root);
    const coreMesh = mesh(S(1.2, 20, 14), glow('#ff6a2a'), cx, cy, 1.4, root, false);
    const coreHalo = mesh(S(1.55, 16, 10), glow('#ff8a3d', { add: true, op: 0.35 }), cx, cy, 1.4, root, false);
    const stripes = new THREE.MeshStandardMaterial({ map: stripeTexture('#ffd23f', '#1a141e'), metalness: 0.5, roughness: 0.5 });
    const shutters = [-1, 1].map(s => mesh(B(1.65, 3.4, 0.3), stripes, cx + s * 0.83, cy, 1.85, root));
    const turrets = [0, 1].map(() => {
      const g = group(root);
      mesh(S(0.62, 14, 10), iron2, 0, 0, 0, g);
      const piv = group(g); const br = mesh(CY(0.12, 0.14, 1.0, 10), iron, 0.6, 0, 0, piv); br.rotation.z = Math.PI / 2;
      const eye = mesh(S(0.14, 8, 6), glow('#ff3b4f'), 0.3, 0.3, 0.4, g, false);
      return { g, piv, eye, mat: g.children[0].material };
    });
    prepFlash(root);
    root.userData.animate = (b, t, toLocal) => {
      root.position.y = -b.rise / 16;
      const ph2 = b.hp < b.maxHp * 0.4, pulse = (Math.sin(t * 0.12) + 1) / 2;
      coreMesh.material.color.set(b.openAmt > 0.5 ? (ph2 ? '#ff2a4a' : '#ffb43d') : '#7a2410');
      coreMesh.scale.setScalar(0.9 + pulse * 0.12); coreHalo.visible = b.openAmt > 0.3; coreHalo.scale.setScalar(1 + pulse * 0.25);
      shutters[0].position.x = cx - 0.83 - b.openAmt * 1.7; shutters[1].position.x = cx + 0.83 + b.openAmt * 1.7;
      for (const v of vents) v.material.color.setRGB(1, 0.3 + pulse * 0.3, 0.1);
      for (const fl of flames) { const s = 0.8 + Math.sin(t * 0.4 + fl.k * 2 + fl.i) * 0.25 + Math.random() * 0.1; fl.f.scale.set(s, s * (1.2 - fl.k * 0.15), s); fl.f.position.y = 12.3 + fl.k * 0.15; }
      b.turrets.forEach((tr, i) => {
        const T = turrets[i], p = toLocal(tr.x, tr.y);
        T.g.position.set(p.x, p.y + b.rise / 16, 2.2);
        T.piv.rotation.z = -tr.ang;
        T.eye.visible = tr.alive && t % 20 < 12;
        T.mat.color.set(tr.alive ? (tr.flash > 0 ? '#ffffff' : '#40384c') : '#141016');
        T.piv.visible = tr.alive;
      });
      setFlash(root, b.flash > 0 && t % 6 < 2, 0.4);
    };
    return root;
  }

  function serpent() {
    const jade = std('#2fa58f', { m: 0.45, r: 0.3 }), jade2 = std('#1f6f62', { m: 0.45, r: 0.35 }), gold = std('#f2c45a', { m: 0.9, r: 0.25 }), pink = std('#ff4f86', { m: 0.2, r: 0.5 });
    const root = new THREE.Group();
    const head = group(root);
    const skull = mesh(S(0.95, 16, 12), jade, 0, 0, 0, head); skull.scale.set(1.05, 0.75, 0.8);
    mesh(B(1.5, 0.5, 0.75), jade, -1.25, -0.05, 0, head);
    mesh(B(1.4, 0.12, 0.7), gold, -1.25, 0.24, 0, head);
    const jaw = group(head, -0.4, -0.3, 0);
    mesh(B(1.4, 0.24, 0.65), jade2, -0.75, -0.1, 0, jaw);
    for (let i = 0; i < 4; i++) mesh(CO(0.06, 0.18, 4), std('#ffffff', { r: 0.3 }), -1.3 + i * 0.3, 0.06, 0.25, jaw, false);
    const mouthGlow = mesh(B(1.2, 0.08, 0.5), glow('#ff6a2a'), -0.95, -0.42, 0, head, false);
    for (const z of [-0.35, 0.35]) {
      const h1 = mesh(CO(0.13, 1.2, 6), gold, 0.35, 0.95, z, head); h1.rotation.z = -0.6;
      mesh(S(0.15, 10, 8), glow('#ffd23f'), -0.55, 0.28, z * 1.15, head, false);
      const wh = mesh(CY(0.02, 0.01, 1.3, 4), gold, -2.0, -0.2, z * 1.1, head); wh.rotation.z = 1.2;
    }
    const mane = [];
    for (let i = 0; i < 6; i++) { const m = mesh(CO(0.12, 0.7, 4), pink, 0.55 + i * 0.18, 0.55, 0, head); m.rotation.z = -0.9; mane.push(m); }
    const segs = [];
    for (let i = 0; i < 11; i++) {
      const g = group(root), r = 0.72 - i * 0.035;
      const ball = mesh(S(r, 14, 10), i % 2 ? jade2 : jade, 0, 0, 0, g);
      const belly = mesh(S(r * 0.8, 10, 8), gold, 0, -r * 0.45, 0, g); belly.scale.set(1, 0.45, 0.8);
      const fin = mesh(CO(0.16, 0.6, 4), gold, 0, r + 0.2, 0, g);
      if (i === 10) { const tail = mesh(CO(0.5, 1.4, 4), gold, 0.9, 0, 0, g); tail.rotation.z = -Math.PI / 2; tail.scale.z = 0.3; }
      segs.push({ g, ball, belly, fin });
    }
    prepFlash(head);
    root.userData.animate = (b, t, toW) => {
      const hp = toW(b.hx, b.hy);
      head.position.set(hp.x, hp.y, 0.3);
      head.scale.x = b.face > 0 ? -1 : 1; head.rotation.y = b.face > 0 ? 0.25 : -0.25;
      jaw.rotation.z = (b.jaw || 0) * 0.12; mouthGlow.visible = (b.jaw || 0) > 0;
      mane.forEach((m, i) => { m.rotation.z = -0.9 + Math.sin(t * 0.3 + i) * 0.2; });
      for (let i = 0; i < segs.length; i++) {
        const s = b.segs[i] || { x: b.hx, y: b.hy }, p = toW(s.x, s.y);
        const sg = segs[i]; sg.g.position.set(p.x, p.y, 0.1 - i * 0.05);
        const prev = i === 0 ? hp : toW((b.segs[i - 1] || s).x, (b.segs[i - 1] || s).y);
        sg.g.rotation.z = Math.atan2(prev.y - p.y, prev.x - p.x) + Math.PI;
      }
      setFlash(head, b.flash > 0 && t % 6 < 2, 0.4);
    };
    return root;
  }

  // ---------- props ----------
  function pedestal(color) {
    const root = new THREE.Group();
    mesh(CY(1.1, 1.3, 0.5, 24), std('#1d1a2c', { m: 0.7, r: 0.35 }), 0, 0.25, 0, root);
    const ring = mesh(new THREE.TorusGeometry(1.15, 0.05, 8, 40), glow(color), 0, 0.52, 0, root, false); ring.rotation.x = Math.PI / 2;
    const beam = mesh(new THREE.CylinderGeometry(1.0, 1.1, 5, 24, 1, true), glow(color, { add: true, op: 0.08, side: THREE.DoubleSide }), 0, 2.9, 0, root, false);
    root.userData.ring = ring; root.userData.beam = beam;
    return root;
  }

  return { hero, soldier, turret, drone, hopper, capsule, power, crab, core, serpent, pedestal, face, glow, std, mesh, group, B, S, CY, CO, placeStrut };
})();
