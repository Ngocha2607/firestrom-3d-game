// world3d.js — Three.js renderer. Reads the simulation view each frame and draws it in 2.5D:
// themed environments, level blocks, shader water/lava/clouds, entity models, particles, explosions,
// dynamic lights, shadows, bloom and a final colour grade. Holds no gameplay state of its own.
'use strict';
const VIEW3D = (() => {
  THREE.ColorManagement.legacyMode = false;
  const U = 1 / 16;
  const X = x => x * U, Y = y => (H - y) * U;
  const toW = (x, y) => ({ x: X(x), y: Y(y) });
  const col = c => new THREE.Color(c);
  const hot = (c, k) => new THREE.Color(c).multiplyScalar(k);

  let renderer, scene, camera, composer, bloom, grade, cssW = 1, cssH = 1, quality = 'high';
  let env = null, envKey = '';
  const ents = new THREE.Group();
  let sun, hemi, under, lights = [];
  let time = 0;

  function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------- textures ----------
  function canvasTex(size, draw, o = {}) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = o.linear ? THREE.LinearEncoding : THREE.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }
  function speckle(g, s, n, cols, r) { for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2); } }
  const glowTex = canvasTex(128, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });

  const TEX = {};
  function textures(theme) {
    if (TEX[theme]) return TEX[theme];
    const r = rng(theme.length * 97 + 5), o = {};
    if (theme === 'harbor') {
      o.wall = canvasTex(256, (g, s) => {
        g.fillStyle = '#262c48'; g.fillRect(0, 0, s, s); speckle(g, s, 900, ['#2c3352', '#20263e', '#303a5c'], r);
        g.fillStyle = '#171c30'; for (let i = 0; i <= s; i += 64) { g.fillRect(i, 0, 3, s); g.fillRect(0, i, s, 3); }
        g.fillStyle = '#4a5884'; for (let x = 8; x < s; x += 32) for (let y = 8; y < s; y += 32) g.fillRect(x, y, 3, 3);
      });
      o.top = canvasTex(256, (g, s) => {
        g.fillStyle = '#4a5578'; g.fillRect(0, 0, s, s);
        for (let x = 0; x < s; x += 16) for (let y = 0; y < s; y += 16) { g.fillStyle = (x + y) % 32 ? '#56628a' : '#3f4a6c'; g.fillRect(x + 2, y + 6, 10, 3); }
        g.fillStyle = '#ffd23f'; for (let x = 0; x < s; x += 32) { g.save(); g.translate(x, 0); g.fillRect(0, 0, 16, 10); g.restore(); }
      });
      o.plat = canvasTex(128, (g, s) => {
        g.fillStyle = '#7a4e2c'; g.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 16) { g.fillStyle = '#4a2c16'; g.fillRect(0, y, s, 2); g.fillStyle = '#9a6a3c'; g.fillRect(0, y + 2, s, 2); }
        speckle(g, s, 300, ['#6a4224', '#8a5a32'], r);
      });
    } else if (theme === 'forge') {
      const cracks = (g, s, colr, w) => { g.strokeStyle = colr; g.lineWidth = w; for (let k = 0; k < 9; k++) { let x = r() * s, y = r() * s; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 6; j++) { x += (r() - 0.5) * 50; y += r() * 30; g.lineTo(x, y); } g.stroke(); } };
      const rr = r;
      o.wall = canvasTex(256, (g, s) => { g.fillStyle = '#2a1c1c'; g.fillRect(0, 0, s, s); speckle(g, s, 1500, ['#332222', '#221616', '#3e2a26'], rr); cracks(g, s, '#170c0c', 3); });
      o.wallE = canvasTex(256, (g, s) => { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); cracks(g, s, '#ff5a1f', 2); speckle(g, s, 60, ['#ff8a3d'], rr); });
      o.top = canvasTex(256, (g, s) => { g.fillStyle = '#3a2828'; g.fillRect(0, 0, s, s); speckle(g, s, 1800, ['#4a3030', '#2c1e1e', '#5a2a1a'], r); });
      o.plat = canvasTex(128, (g, s) => {
        g.fillStyle = '#3c3a44'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#16141a'; for (let x = 6; x < s; x += 16) for (let y = 6; y < s; y += 16) g.fillRect(x, y, 8, 8);
        g.fillStyle = '#6a6676'; for (let i = 0; i < s; i += 16) { g.fillRect(i, 0, 2, s); g.fillRect(0, i, s, 2); }
      });
    } else if (theme === 'base') {
      o.wall = canvasTex(256, (g, s) => {
        g.fillStyle = '#2c3142'; g.fillRect(0, 0, s, s); speckle(g, s, 500, ['#323849', '#262a38'], r);
        g.fillStyle = '#1a1d28'; for (let i = 0; i <= s; i += 64) { g.fillRect(i, 0, 4, s); g.fillRect(0, i, s, 4); }
        g.fillStyle = '#4a5068'; for (let x = 10; x < s; x += 32) for (let y = 10; y < s; y += 32) g.fillRect(x, y, 3, 3);
        g.fillStyle = '#ffd23f'; for (let x = 0; x < s; x += 32) g.fillRect(x, s - 14, 16, 10);
      });
      o.top = canvasTex(256, (g, s) => {
        g.fillStyle = '#3a4054'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#20242f'; for (let x = 0; x < s; x += 16) for (let y = 0; y < s; y += 16) g.fillRect(x + 2, y + 2, 12, 12);
      });
      o.topE = canvasTex(256, (g, s) => { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); g.fillStyle = '#38e0ff'; for (let x = 0; x < s; x += 128) g.fillRect(x + 62, 0, 4, s); });
      o.plat = o.top;
    } else if (theme === 'falls') {
      o.wall = canvasTex(256, (g, s) => {
        g.fillStyle = '#6a6255'; g.fillRect(0, 0, s, s); speckle(g, s, 1800, ['#756c5e', '#5a5348', '#827866', '#4f6a3a'], r);
        g.strokeStyle = '#3e392f'; g.lineWidth = 3; for (let k = 0; k < 7; k++) { let x = r() * s, y = r() * s; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (r() - 0.5) * 60; y += r() * 30; g.lineTo(x, y); } g.stroke(); }
      });
      o.top = canvasTex(256, (g, s) => { g.fillStyle = '#4f8a3a'; g.fillRect(0, 0, s, s); speckle(g, s, 2400, ['#5fa046', '#3f7030', '#6fb050', '#8ac860'], r); });
      o.plat = canvasTex(128, (g, s) => {
        g.fillStyle = '#6a4a2a'; g.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 20) { g.fillStyle = '#3e2a16'; g.fillRect(0, y, s, 3); g.fillStyle = '#86603a'; g.fillRect(0, y + 3, s, 2); }
        g.fillStyle = '#4f8a3a'; for (let x = 0; x < s; x += 9) if (r() < 0.6) g.fillRect(x, 0, 6, 4 + r() * 6);
      });
    } else if (theme === 'ice') {
      o.wall = canvasTex(256, (g, s) => {
        g.fillStyle = '#5a7a9c'; g.fillRect(0, 0, s, s); speckle(g, s, 1400, ['#6a8cb0', '#4a6a8a', '#8aaccc'], r);
        g.strokeStyle = 'rgba(235,248,255,0.7)'; g.lineWidth = 2;
        for (let k = 0; k < 10; k++) { let x = r() * s, y = r() * s; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (r() - 0.5) * 40; y += r() * 26; g.lineTo(x, y); } g.stroke(); }
      });
      o.top = canvasTex(256, (g, s) => { g.fillStyle = '#eef6ff'; g.fillRect(0, 0, s, s); speckle(g, s, 2000, ['#dbe9f7', '#ffffff', '#c8dcf0'], r); });
      o.plat = canvasTex(128, (g, s) => {
        g.fillStyle = '#9fd4f0'; g.fillRect(0, 0, s, s); g.strokeStyle = '#e8f8ff'; g.lineWidth = 1.5;
        for (let k = 0; k < 8; k++) { g.beginPath(); let x = r() * s, y = r() * s; g.moveTo(x, y); for (let j = 0; j < 3; j++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
      });
    } else if (theme === 'moon') {
      o.wall = canvasTex(256, (g, s) => {
        g.fillStyle = '#3a3e4c'; g.fillRect(0, 0, s, s); speckle(g, s, 600, ['#424656', '#33363f'], r);
        g.fillStyle = '#24262f'; for (let i = 0; i <= s; i += 64) { g.fillRect(i, 0, 3, s); g.fillRect(0, i, s, 3); }
        g.fillStyle = '#5a5f72'; for (let x = 6; x < s; x += 32) for (let y = 6; y < s; y += 32) g.fillRect(x, y, 3, 3);
      });
      o.wallE = canvasTex(256, (g, s) => { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); g.fillStyle = '#7a5aff'; for (let y = 28; y < s; y += 64) g.fillRect(0, y, s, 4); g.fillStyle = '#38e0ff'; for (let x = 20; x < s; x += 128) g.fillRect(x, 0, 3, s); });
      o.top = canvasTex(256, (g, s) => { g.fillStyle = '#5a5e6c'; g.fillRect(0, 0, s, s); g.fillStyle = '#3a3d48'; for (let x = 0; x < s; x += 12) for (let y = 0; y < s; y += 12) g.fillRect(x + 3, y + 3, 6, 6); });
      o.plat = canvasTex(128, (g, s) => { g.fillStyle = '#6a7088'; g.fillRect(0, 0, s, s); g.fillStyle = '#ffd23f'; for (let x = 0; x < s; x += 24) g.fillRect(x, 0, 12, 6); g.fillStyle = '#4a4f62'; g.fillRect(0, s / 2, s, 3); });
      o.lunar = canvasTex(512, (g, s) => {
        g.fillStyle = '#6a6a72'; g.fillRect(0, 0, s, s); speckle(g, s, 6000, ['#76767e', '#5e5e66', '#828289'], r);
        for (let k = 0; k < 60; k++) { const x = r() * s, y = r() * s, rad = 4 + r() * 40; g.fillStyle = 'rgba(40,40,48,0.35)'; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); g.strokeStyle = 'rgba(160,160,170,0.4)'; g.lineWidth = 2; g.beginPath(); g.arc(x - 1, y - 1, rad, 3.6, 5.8); g.stroke(); }
      });
      o.earth = canvasTex(512, (g, s) => {
        g.fillStyle = '#1a4a9a'; g.fillRect(0, 0, s, s);
        for (let k = 0; k < 18; k++) { g.fillStyle = r() < 0.6 ? '#3a8a4a' : '#9a8a5a'; g.beginPath(); g.ellipse(r() * s, r() * s, 20 + r() * 60, 12 + r() * 40, r() * 3, 0, 7); g.fill(); }
        g.fillStyle = 'rgba(255,255,255,0.7)'; for (let k = 0; k < 40; k++) { g.beginPath(); g.ellipse(r() * s, r() * s, 10 + r() * 50, 3 + r() * 8, r() * 0.5, 0, 7); g.fill(); }
      });
      o.panel = canvasTex(128, (g, s) => { g.fillStyle = '#0a1a40'; g.fillRect(0, 0, s, s); g.fillStyle = '#3a7aff'; for (let x = 0; x < s; x += 16) for (let y = 0; y < s; y += 16) g.fillRect(x + 1, y + 1, 14, 14); g.fillStyle = '#0a1a40'; for (let x = 0; x < s; x += 16) g.fillRect(x + 7, 0, 1, s); });
    } else {
      o.wall = canvasTex(256, (g, s) => {
        g.fillStyle = '#2f7d74'; g.fillRect(0, 0, s, s); speckle(g, s, 900, ['#3a8f85', '#2a6e66', '#4aa596'], r);
        g.fillStyle = '#1f5a54'; for (let y = 0; y < s; y += 32) { g.fillRect(0, y, s, 3); for (let x = (y / 32 % 2) * 32; x < s; x += 64) g.fillRect(x, y, 3, 32); }
        g.strokeStyle = '#7fd6c4'; g.lineWidth = 1.5; for (let k = 0; k < 6; k++) { g.beginPath(); let x = r() * s, y = r() * s; g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
      });
      o.top = canvasTex(256, (g, s) => { g.fillStyle = '#5fb86a'; g.fillRect(0, 0, s, s); speckle(g, s, 2200, ['#6fcf78', '#4e9e58', '#82dc84', '#3f8a4a'], r); });
      o.plat = canvasTex(128, (g, s) => {
        g.fillStyle = '#a83232'; g.fillRect(0, 0, s, s);
        g.fillStyle = '#f2c45a'; g.fillRect(0, 0, s, 6); g.fillRect(0, s - 6, s, 6);
        for (let x = 0; x < s; x += 32) g.fillRect(x, 0, 4, s);
        speckle(g, s, 200, ['#922828', '#b83c3c'], r);
      });
    }
    // city facade: window grid; the emissive copy holds only the lit windows
    o.facade = canvasTex(256, (g, s) => {
      g.fillStyle = theme === 'harbor' ? '#120e26' : theme === 'forge' ? '#1a0a08' : '#5a3370'; g.fillRect(0, 0, s, s);
      g.fillStyle = theme === 'harbor' ? '#1d1838' : '#2a1410'; for (let x = 0; x < s; x += 16) for (let y = 0; y < s; y += 20) g.fillRect(x + 4, y + 5, 8, 10);
    });
    o.windows = canvasTex(256, (g, s) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
      const pal = theme === 'harbor' ? ['#ffcf6a', '#6ad8ff', '#ff6aa8', '#ffe9b0'] : ['#ff8a3d', '#ffb43d'];
      for (let x = 0; x < s; x += 16) for (let y = 0; y < s; y += 20) if (r() < 0.2) { g.fillStyle = pal[Math.floor(r() * pal.length)]; g.fillRect(x + 4, y + 5, 8, 10); }
    });
    o.container = canvasTex(64, (g, s) => { g.fillStyle = '#888'; g.fillRect(0, 0, s, s); for (let x = 0; x < s; x += 6) { g.fillStyle = '#6a6a6a'; g.fillRect(x, 0, 2, s); } g.fillStyle = '#555'; g.fillRect(0, 0, s, 3); g.fillRect(0, s - 3, s, 3); });
    o.lavaStreak = canvasTex(256, (g, s) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, s, s); g.strokeStyle = '#ff5a1f';
      for (let k = 0; k < 14; k++) { g.lineWidth = 1 + r() * 3; let x = r() * s, y = 0; g.beginPath(); g.moveTo(x, y); while (y < s) { x += (r() - 0.5) * 18; y += 10 + r() * 14; g.lineTo(x, y); } g.stroke(); }
    });
    o.rock = canvasTex(256, (g, s) => { g.fillStyle = '#2a1414'; g.fillRect(0, 0, s, s); speckle(g, s, 2000, ['#3a1c1a', '#1e0e0e', '#4a2420'], r); });
    o.islandRock = canvasTex(256, (g, s) => { g.fillStyle = '#5a4470'; g.fillRect(0, 0, s, s); speckle(g, s, 2000, ['#6a5282', '#4a3860', '#7a6094'], r); });
    TEX[theme] = o;
    return o;
  }

  // ---------- geometry helpers ----------
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  function place(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    tmpM.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), tmpS.set(sx, sy, sz));
    return geo.applyMatrix4(tmpM);
  }
  function worldUV(geo, s) {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      let u, v;
      if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
      uv.setXY(i, u * s, v * s);
    }
    uv.needsUpdate = true; return geo;
  }
  function merge(geos) {
    const parts = geos.map(g => (g.index ? g.toNonIndexed() : g));
    let n = 0; for (const g of parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  }
  function meshOf(geos, mat, shadow = true) {
    if (!geos.length) return new THREE.Group();
    const m = new THREE.Mesh(merge(geos), mat); m.castShadow = shadow; m.receiveShadow = true; return m;
  }
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // ---------- shader surfaces ----------
  const NOISE = `
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }`;
  const VERT = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const FOG = `uniform vec3 uFog; uniform float uFogNear, uFogFar;
    vec3 fogged(vec3 c){ float d = length(vW - cameraPosition); return mix(c, uFog, smoothstep(uFogNear, uFogFar, d)); }`;
  function surface(kind, fog) {
    const uniforms = { uT: { value: 0 }, uFog: { value: col(fog.color) }, uFogNear: { value: fog.near }, uFogFar: { value: fog.far } };
    let frag;
    if (kind === 'water') frag = `uniform float uT; varying vec3 vW; ${NOISE} ${FOG}
      void main(){
        vec2 p = vW.xz;
        float w = noise(p*vec2(0.8,2.4) + vec2(uT*0.35, uT*0.12))*0.6 + noise(p*vec2(2.6,6.0) - vec2(uT*0.6, 0.0))*0.4;
        vec3 c = mix(vec3(0.004,0.008,0.03), vec3(0.02,0.05,0.16), w);
        float hue = noise(vec2(floor(p.x*0.25), 3.0));
        vec3 neon = hue < 0.33 ? vec3(1.0,0.12,0.45) : hue < 0.66 ? vec3(0.1,0.75,1.0) : vec3(1.0,0.75,0.2);
        float streak = smoothstep(0.62, 0.95, noise(vec2(p.x*0.9 + sin(p.y*2.0 + uT)*0.25, p.y*0.06)));
        c += neon * streak * (0.35 + w*0.9) * smoothstep(-160.0, -20.0, p.y) * 0.9;
        c += vec3(0.5,0.6,1.0) * pow(w, 7.0) * 1.6;
        gl_FragColor = vec4(fogged(c), 1.0);
      }`;
    else if (kind === 'lava') frag = `uniform float uT; varying vec3 vW; ${NOISE} ${FOG}
      void main(){
        vec2 p = vW.xz*0.35;
        float n = fbm(p + vec2(uT*0.05, uT*0.02) + fbm(p*1.7 - uT*0.04));
        vec3 c = mix(vec3(0.05,0.006,0.002), vec3(0.9,0.12,0.01), smoothstep(0.32, 0.55, n));
        c = mix(c, vec3(2.4,0.75,0.08), smoothstep(0.55, 0.72, n));
        c += vec3(3.0,2.0,0.6) * smoothstep(0.78, 0.9, n);
        gl_FragColor = vec4(fogged(c), 1.0);
      }`;
    else if (kind === 'ice') frag = `uniform float uT; varying vec3 vW; ${NOISE} ${FOG}
      void main(){
        vec2 p = vW.xz * 0.16;
        float n = fbm(p), floe = smoothstep(0.52, 0.56, n);
        vec3 water = mix(vec3(0.004, 0.02, 0.04), vec3(0.02, 0.09, 0.14), noise(vW.xz * 0.7 + vec2(uT * 0.15, 0.0)));
        vec3 ice = mix(vec3(0.5, 0.7, 0.86), vec3(0.92, 0.97, 1.0), fbm(vW.xz * 0.5));
        vec3 c = mix(water, ice, floe);
        c += vec3(0.1, 0.9, 0.6) * 0.12 * (1.0 - floe) * smoothstep(-200.0, -40.0, vW.z) * (0.5 + 0.5 * sin(vW.x * 0.05 + uT * 0.01));
        gl_FragColor = vec4(fogged(c), 1.0);
      }`;
    else frag = `uniform float uT; varying vec3 vW; ${NOISE} ${FOG}
      void main(){
        vec2 p = vW.xz*0.12 + vec2(uT*0.01, 0.0);
        float n = fbm(p) * 0.7 + fbm(p*3.0 + 4.0) * 0.3;
        vec3 c = mix(vec3(0.55,0.28,0.45), vec3(1.2,1.05,1.1), smoothstep(0.35, 0.7, n));
        gl_FragColor = vec4(fogged(c), 1.0);
      }`;
    return new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: frag });
  }
  function skyDome(top, mid, bot) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uTop: { value: col(top) }, uMid: { value: col(mid) }, uBot: { value: col(bot) } },
      vertexShader: VERT, side: THREE.BackSide, depthWrite: false,
      fragmentShader: `uniform vec3 uTop, uMid, uBot; varying vec3 vW;
        void main(){ float h = normalize(vW - cameraPosition).y;
          vec3 c = h > 0.12 ? mix(uMid, uTop, smoothstep(0.12, 0.6, h)) : mix(uBot, uMid, smoothstep(-0.05, 0.12, h));
          gl_FragColor = vec4(c, 1.0); }`,
    });
    const d = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), m); d.renderOrder = -10; d.frustumCulled = false;
    return d;
  }
  function starField(r, n, color, size) {
    const sg = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, e = 0.02 + r() * 1.45; sp.push(Math.cos(a) * Math.cos(e) * 600, Math.sin(e) * 600, -Math.abs(Math.sin(a) * Math.cos(e) * 600) - 50); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    return new THREE.Points(sg, new THREE.PointsMaterial({ color: hot(color, 1.4), size, sizeAttenuation: false, fog: false, toneMapped: false }));
  }
  function aurora(y, z, hue) {
    const m = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uA: { value: col(hue[0]) }, uB: { value: col(hue[1]) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `uniform float uT; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.z += sin(p.x * 0.02 + uT * 0.01) * 30.0; p.y += sin(p.x * 0.035 + uT * 0.015) * 8.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float uT; uniform vec3 uA, uB; varying vec2 vUv;
        void main(){ float band = sin(vUv.x * 40.0 + uT * 0.02) * 0.5 + 0.5; float a = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.45, vUv.y) * (0.35 + band * 0.65);
          gl_FragColor = vec4(mix(uA, uB, vUv.y) * a * 1.6, a); }`,
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(900, 90, 96, 1), m); p.position.set(0, y, z); p.frustumCulled = false;
    return p;
  }
  function sprite(color, size, opacity = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hot(color, 1), blending: THREE.AdditiveBlending, transparent: true, opacity, depthWrite: false, toneMapped: false, fog: false }));
    s.scale.set(size, size, 1); return s;
  }

  // ---------- environments ----------
  const THEMES = {
    harbor: { fog: { color: '#1c1442', near: 18, far: 165 }, dome: ['#04031a', '#24195a', '#5a2366'], hemi: ['#7a86ff', '#2a1638', 0.9], sun: ['#b8c8ff', 1.5, [-0.5, 1, 0.7]], under: ['#ff3d8b', 0.35], exposure: 1.15, grade: [1.0, 0.96, 1.08], bloom: [0.85, 0.82] },
    forge: { fog: { color: '#3a0e08', near: 28, far: 210 }, dome: ['#100303', '#4a0f08', '#c2461a'], hemi: ['#ffb08a', '#3a0a05', 0.8], sun: ['#ffc8a0', 1.6, [0.6, 0.9, 0.6]], under: ['#ff5a1f', 1.0], exposure: 1.1, grade: [1.06, 0.98, 0.92], bloom: [0.8, 0.88] },
    base: { fog: { color: '#07080e', near: 45, far: 130 }, dome: ['#02030a', '#06070e', '#0a0c16'], hemi: ['#9ab0ff', '#101018', 0.75], sun: ['#ffffff', 0.9, [0.2, 1, 0.6]], under: ['#38e0ff', 0.3], exposure: 1.15, grade: [1.0, 1.0, 1.05], bloom: [0.9, 0.85] },
    falls: { fog: { color: '#2e4a44', near: 40, far: 260 }, dome: ['#1a3a5a', '#4a8a7a', '#f0b070'], hemi: ['#cfffe0', '#2a3a20', 1.0], sun: ['#fff0c8', 1.9, [-0.5, 0.85, 0.6]], under: ['#6af0d0', 0.2], exposure: 1.0, grade: [1.0, 1.02, 0.98], bloom: [0.6, 1.0] },
    ice: { fog: { color: '#18304a', near: 30, far: 230 }, dome: ['#030818', '#0e2a48', '#3a7aa0'], hemi: ['#bfe4ff', '#1a2a40', 0.95], sun: ['#e0f0ff', 1.4, [-0.4, 0.9, 0.6]], under: ['#40d0ff', 0.35], exposure: 1.05, grade: [0.96, 1.0, 1.08], bloom: [0.75, 0.9] },
    moon: { fog: { color: '#05050c', near: 220, far: 900 }, dome: ['#000002', '#04030c', '#0c0a1e'], hemi: ['#9aa8ff', '#141018', 0.6], sun: ['#ffffff', 2.0, [0.7, 0.6, 0.5]], under: ['#7a5aff', 0.3], exposure: 1.1, grade: [1.0, 1.0, 1.06], bloom: [0.85, 0.85] },
    sky: { fog: { color: '#e7a3bc', near: 45, far: 320 }, dome: ['#2a2070', '#b45a9a', '#ffc07a'], hemi: ['#ffe6f0', '#6a4a8a', 1.0], sun: ['#ffe0b0', 2.2, [-0.6, 0.8, 0.6]], under: ['#ff9ac0', 0.25], exposure: 0.92, grade: [1.03, 1.0, 1.02], bloom: [0.5, 1.15] },
  };

  function buildEnv(theme, def, showcase) {
    const th = THEMES[theme], tx = textures(theme), g = new THREE.Group(), anim = [];
    const r = rng((def ? def.cols : 7) * 31 + theme.length);
    const cols = def ? def.cols : 60, x0 = -70, x1 = cols + 90;
    scene.fog = new THREE.Fog(col(th.fog.color), th.fog.near, th.fog.far);
    g.add(skyDome(...th.dome));
    // celestial body + far decoration (follows the camera with slight parallax)
    const celestial = new THREE.Group(); g.add(celestial);
    if (theme === 'harbor') {
      const moon = new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshBasicMaterial({ color: hot('#ffe3f0', 1.6), toneMapped: false, fog: false }));
      moon.position.set(90, 120, -500); celestial.add(moon);
      const halo = sprite('#ff9ed2', 120, 0.5); halo.position.copy(moon.position); celestial.add(halo);
      const sg = new THREE.BufferGeometry(), sp = [];
      for (let i = 0; i < 700; i++) { const a = r() * Math.PI * 2, e = 0.15 + r() * 1.3; sp.push(Math.cos(a) * Math.cos(e) * 600, Math.sin(e) * 600, -Math.abs(Math.sin(a) * Math.cos(e) * 600) - 50); }
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      celestial.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: hot('#d8d0ff', 1.4), size: 1.6, sizeAttenuation: false, fog: false, toneMapped: false })));
    } else if (theme === 'forge') {
      const s = sprite('#ff7a2a', 220, 0.55); s.position.set(-60, 60, -500); celestial.add(s);
      const d = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshBasicMaterial({ color: hot('#ffb35a', 1.4), toneMapped: false, fog: false })); d.position.set(-60, 60, -510); celestial.add(d);
    } else if (theme === 'falls') {
      const s1 = sprite('#ffd8a0', 260, 0.6); s1.position.set(-120, 120, -520); celestial.add(s1);
    } else if (theme === 'base') {
      // underground: no sky
    } else if (theme === 'ice') {
      celestial.add(starField(r, 500, '#d8e8ff', 1.4));
      const a1 = aurora(110, -420, ['#2affb0', '#7a5aff']), a2 = aurora(150, -470, ['#40d0ff', '#ff6ad5']);
      celestial.add(a1, a2); anim.push(() => { a1.material.uniforms.uT.value = time; a2.material.uniforms.uT.value = time + 300; });
    } else if (theme === 'moon') {
      celestial.add(starField(r, 1400, '#ffffff', 1.5));
      const earth = new THREE.Mesh(new THREE.SphereGeometry(42, 40, 28), new THREE.MeshStandardMaterial({ map: tx.earth, roughness: 0.8, emissiveMap: tx.earth, emissive: col('#ffffff'), emissiveIntensity: 0.75, fog: false }));
      earth.position.set(140, 120, -520); celestial.add(earth);
      const atm = sprite('#5aa0ff', 150, 0.45); atm.position.copy(earth.position); celestial.add(atm);
      anim.push(() => { earth.rotation.y = time * 0.0008; });
      const sunS = sprite('#fff2d8', 160, 0.6); sunS.position.set(-260, 160, -560); celestial.add(sunS);
    } else {
      const s = sprite('#ffe3a1', 300, 0.7); s.position.set(-40, 40, -520); celestial.add(s);
      const d = new THREE.Mesh(new THREE.CircleGeometry(34, 32), new THREE.MeshBasicMaterial({ color: hot('#fff0c8', 1.8), toneMapped: false, fog: false })); d.position.set(-40, 40, -530); celestial.add(d);
    }

    // hazard surface spanning the whole level and the far distance
    if (theme === 'base' || theme === 'falls') {
      // no hazard surface: the corridor has a floor, the climb has a bottomless drop
    } else if (theme === 'moon') {
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 900, 900), new THREE.MeshStandardMaterial({ map: tx.lunar, roughness: 1, color: '#9a9aa4' }));
      tx.lunar.repeat.set(12, 9); ground.rotation.x = -Math.PI / 2; ground.position.set((x0 + x1) / 2, -34, -300); ground.receiveShadow = true; g.add(ground);
    } else {
      const kind = theme === 'harbor' ? 'water' : theme === 'forge' ? 'lava' : theme === 'ice' ? 'ice' : 'clouds';
      const surf = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 400, 760), surface(kind, th.fog));
      surf.rotation.x = -Math.PI / 2; surf.position.set((x0 + x1) / 2, theme === 'sky' ? 1.0 : 1.55, -310);
      g.add(surf); anim.push(() => { surf.material.uniforms.uT.value = time; });
    }

    if (theme === 'harbor') {
      const layers = [[-46, 8, 22], [-85, 16, 40], [-145, 26, 70]];
      const facade = new THREE.MeshStandardMaterial({ map: tx.facade, emissiveMap: tx.windows, emissive: col('#ffffff'), emissiveIntensity: 1.25, roughness: 0.8, metalness: 0.2 });
      const neon = { '#ff3d8b': [], '#38e0ff': [], '#ffd23f': [] }, beacons = [];
      for (const [z, hMin, hRange] of layers) {
        const geos = [];
        for (let x = x0; x < x1;) {
          const w = 4 + r() * 7, h = hMin + r() * hRange, d = 6 + r() * 8, zz = z - r() * 10;
          geos.push(worldUV(place(box(w, h, d), x + w / 2, h / 2, zz), 0.11));
          if (r() < 0.5) { const nc = Object.keys(neon)[Math.floor(r() * 3)], vert = r() < 0.5; neon[nc].push(place(box(vert ? 0.5 : w * 0.6, vert ? h * 0.3 : 0.6, 0.2), x + w / 2 + (r() - 0.5) * w * 0.3, h * (0.4 + r() * 0.45), zz + d / 2 + 0.15)); }
          if (r() < 0.35) beacons.push(new THREE.Vector3(x + w / 2, h + 1.2, zz));
          if (r() < 0.25) geos.push(worldUV(place(box(0.25, 2.4, 0.25), x + w / 2, h + 1.2, zz), 0.25));
          x += w + 0.6 + r() * 2;
        }
        g.add(meshOf(geos, facade, false));
      }
      for (const c in neon) g.add(meshOf(neon[c], new THREE.MeshBasicMaterial({ color: hot(c, 3), toneMapped: false }), false));
      const bg = new THREE.BufferGeometry().setFromPoints(beacons);
      const bm = new THREE.PointsMaterial({ color: hot('#ff3b4f', 4), size: 0.9, toneMapped: false }); g.add(new THREE.Points(bg, bm));
      anim.push(() => { bm.color.copy(hot('#ff3b4f', Math.sin(time * 0.06) > 0 ? 4 : 0.6)); });
      // cranes and containers on the water
      const iron = new THREE.MeshStandardMaterial({ color: '#141226', metalness: 0.6, roughness: 0.6 }), cg = [];
      for (let x = x0 + 10; x < x1; x += 34 + r() * 20) {
        const z = -14 - r() * 6;
        cg.push(place(box(0.8, 20, 0.8), x, 10, z), place(box(16, 0.8, 0.8), x + 4, 20, z), place(box(0.08, 6, 0.08), x + 10, 17, z), place(box(1, 0.7, 1), x + 10, 13.8, z), place(box(3, 1, 3), x, 0.6, z));
      }
      g.add(meshOf(cg, iron));
      const cMats = ['#2d4a6a', '#7a2a2a', '#2a6a5a', '#8a6a2a'].map(c => new THREE.MeshStandardMaterial({ color: c, map: tx.container, roughness: 0.6, metalness: 0.4 }));
      const cGeo = [[], [], [], []];
      for (let x = x0; x < x1; x += 4 + r() * 6) {
        const z = -7 - r() * 4, n = 1 + Math.floor(r() * 3);
        for (let s = 0; s < n; s++) cGeo[Math.floor(r() * 4)].push(worldUV(place(box(3.2, 1.4, 1.4), x, 1.55 + 0.7 + s * 1.4, z, 0, (r() - 0.5) * 0.2), 0.6));
      }
      cGeo.forEach((gs, i) => g.add(meshOf(gs, cMats[i])));
    } else if (theme === 'forge') {
      const volc = new THREE.MeshStandardMaterial({ color: '#2a1210', map: tx.rock, emissiveMap: tx.lavaStreak, emissive: col('#ffffff'), emissiveIntensity: 1.6, roughness: 0.9, flatShading: true });
      const vg = [];
      for (let x = x0; x < x1 + 60; x += 50 + r() * 50) {
        const rad = 30 + r() * 25, h = 35 + r() * 30, z = -130 - r() * 50;
        vg.push(place(new THREE.CylinderGeometry(rad * 0.12, rad, h, 9, 1, true), x, h / 2 + 1.5, z));
        const cr = sprite('#ff7a2a', rad * 0.9, 0.8); cr.position.set(x, h + 4, z); g.add(cr);
        smokeEmitters.push({ x, y: h + 3, z, rate: 0.5, big: true });
      }
      g.add(meshOf(vg, volc, false));
      const ridge = new THREE.MeshStandardMaterial({ color: '#2a0e0c', roughness: 1, flatShading: true }), rg = [];
      for (let x = x0; x < x1; x += 10 + r() * 14) rg.push(place(new THREE.ConeGeometry(8 + r() * 10, 12 + r() * 16, 6), x, 6 + r() * 4, -60 - r() * 20));
      g.add(meshOf(rg, ridge, false));
      const iron = new THREE.MeshStandardMaterial({ color: '#1e1418', metalness: 0.6, roughness: 0.55 }), fg = [], vents = [];
      for (let x = x0; x < x1; x += 14 + r() * 16) {
        const z = -26 - r() * 18, w = 4 + r() * 5, h = 8 + r() * 14;
        fg.push(place(box(w, h, 5), x, h / 2 + 1.5, z));
        if (r() < 0.7) { const cx = x + (r() - 0.5) * w * 0.6, ch = h + 6 + r() * 6; fg.push(place(new THREE.CylinderGeometry(0.7, 0.9, ch, 10), cx, ch / 2 + 1.5, z)); smokeEmitters.push({ x: cx, y: ch + 1.6, z, rate: 0.25 }); }
        for (let k = 0; k < 3; k++) if (r() < 0.7) vents.push(place(box(w * 0.7, 0.3, 0.1), x, 3 + k * 2.2 + r(), z + 2.55));
      }
      g.add(meshOf(fg, iron));
      g.add(meshOf(vents, new THREE.MeshBasicMaterial({ color: hot('#ff6a2a', 3), toneMapped: false }), false));
      const pg = [];
      for (let x = x0; x < x1; x += 22) {
        pg.push(place(new THREE.CylinderGeometry(0.45, 0.45, 22, 10), x + 11, 12.5, -9, 0, 0, Math.PI / 2));
        pg.push(place(box(0.5, 11, 0.5), x, 7, -9));
        if (r() < 0.6) for (let y = 18; y > 12 - r() * 4; y -= 0.5) pg.push(place(new THREE.TorusGeometry(0.16, 0.05, 4, 8), x + 6, y, -5.5, 0, (y * 2) % 2 ? 0 : Math.PI / 2));
      }
      g.add(meshOf(pg, iron));
    } else if (theme === 'base') {
      buildCorridor(g, anim, tx);
    } else if (theme === 'falls') {
      const rows = def ? def.rows : 40, yTop = 17 + 10, yBot = 17 - rows - 6, hgt = yTop - yBot, ym = (yTop + yBot) / 2;
      const fallMat = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uFog: { value: col(th.fog.color) }, uFogNear: { value: th.fog.near }, uFogFar: { value: th.fog.far } },
        vertexShader: VERT,
        fragmentShader: `uniform float uT; varying vec3 vW; ${NOISE} ${FOG}
          void main(){
            vec2 p = vec2(vW.x * 1.3, vW.y * 0.22 + uT * 0.07);
            float n = noise(vec2(p.x, p.y * 3.0)) * 0.6 + noise(vec2(p.x * 3.0, p.y * 7.0)) * 0.4;
            vec3 c = mix(vec3(0.03, 0.17, 0.2), vec3(0.5, 0.72, 0.78), smoothstep(0.45, 0.9, n));
            c += vec3(0.7, 0.95, 1.0) * pow(noise(vec2(vW.x * 6.0, vW.y * 0.8 + uT * 0.3)), 6.0) * 0.8;
            gl_FragColor = vec4(fogged(c), 1.0);
          }`,
      });
      for (const [x, z, w] of [[15, -5.5, 22], [-30, -60, 14], [62, -70, 18], [20, -120, 26]]) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), fallMat); f.position.set(x, ym, z); g.add(f);
      }
      anim.push(() => { fallMat.uniforms.uT.value = time; });
      const rock = new THREE.MeshStandardMaterial({ map: tx.wall, color: '#a8a090', roughness: 0.95, flatShading: true }), rg = [];
      for (let y = yBot; y < yTop; y += 4 + r() * 4) {
        for (const sd of [-1, 1]) {
          const w = 4 + r() * 5, hh = 5 + r() * 6, xx = sd < 0 ? 1 - w / 2 - r() * 2 : 29 + w / 2 + r() * 2;
          rg.push(worldUV(place(box(w, hh, 6 + r() * 4), xx, y, -3 - r() * 4, 0, (r() - 0.5) * 0.4, (r() - 0.5) * 0.2), 0.25));
        }
        for (const sd of [-1, 1]) rg.push(worldUV(place(box(18, 10 + r() * 8, 10), sd < 0 ? -22 - r() * 10 : 52 + r() * 10, y, -28 - r() * 20), 0.15));
      }
      g.add(meshOf(rg, rock));
      const leaf = new THREE.MeshStandardMaterial({ color: '#2f6a34', roughness: 0.9, flatShading: true }), vine = new THREE.MeshStandardMaterial({ color: '#3f7a30', roughness: 0.9 }), tg = [], vg = [];
      for (let y = yBot; y < yTop; y += 3 + r() * 5) for (const sd of [-1, 1]) {
        const xx = sd < 0 ? -1.5 - r() * 4 : 31.5 + r() * 4;
        if (r() < 0.5) tg.push(place(new THREE.ConeGeometry(0.9 + r() * 0.8, 2.6 + r() * 2, 7), xx, y + 2, -4 - r() * 3));
        if (r() < 0.6) vg.push(place(new THREE.CylinderGeometry(0.05, 0.05, 2 + r() * 4, 5), sd < 0 ? 1.6 : 28.4, y - 1, 1.2));
      }
      g.add(meshOf(tg, leaf), meshOf(vg, vine, false));
    } else if (theme === 'ice') {
      const glacier = new THREE.MeshStandardMaterial({ color: '#d4e6f8', roughness: 0.55, metalness: 0.1, flatShading: true, emissive: col('#1a4a7a'), emissiveIntensity: 0.25 });
      const gg = [];
      for (let x = x0; x < x1 + 60; x += 30 + r() * 40) gg.push(place(new THREE.ConeGeometry(18 + r() * 22, 30 + r() * 45, 5 + Math.floor(r() * 3)), x, 14 + r() * 8, -120 - r() * 60, 0, r() * 3));
      for (let x = x0; x < x1; x += 12 + r() * 16) gg.push(place(new THREE.ConeGeometry(6 + r() * 8, 10 + r() * 16, 5), x, 5 + r() * 4, -55 - r() * 20, 0, r() * 3));
      g.add(meshOf(gg, glacier, false));
      const crystal = new THREE.MeshStandardMaterial({ color: '#7fd8ff', roughness: 0.1, metalness: 0.2, emissive: col('#3aa8ff'), emissiveIntensity: 0.9, flatShading: true });
      const cg = [];
      for (let x = x0; x < x1; x += 6 + r() * 10) { const z = -18 - r() * 22, n = 2 + Math.floor(r() * 3); for (let k = 0; k < n; k++) cg.push(place(new THREE.OctahedronGeometry(0.8 + r() * 1.4), x + (r() - 0.5) * 3, 2 + r() * 3, z, 0, r() * 3, (r() - 0.5) * 0.6, 0.6, 1.6 + r() * 1.6, 0.6)); }
      g.add(meshOf(cg, crystal, false));
      const pine = new THREE.MeshStandardMaterial({ color: '#1f4a44', roughness: 0.9, flatShading: true }), snowM = new THREE.MeshStandardMaterial({ color: '#f4f9ff', roughness: 0.9, flatShading: true });
      const pg = [], sg = [];
      for (let x = x0; x < x1; x += 2.5 + r() * 4) {
        const z = -7 - r() * 7, h = 2.5 + r() * 3;
        pg.push(place(new THREE.ConeGeometry(h * 0.35, h, 7), x, 1.6 + h / 2, z));
        sg.push(place(new THREE.ConeGeometry(h * 0.22, h * 0.4, 7), x, 1.6 + h * 0.82, z));
      }
      g.add(meshOf(pg, pine), meshOf(sg, snowM));
      const rig = new THREE.MeshStandardMaterial({ color: '#2a3446', metalness: 0.6, roughness: 0.5 }), rg = [];
      for (let x = x0 + 20; x < x1; x += 50 + r() * 30) {
        const z = -24 - r() * 8;
        rg.push(place(box(1, 16, 1), x, 9, z), place(box(5, 0.6, 0.6), x + 1.5, 16.5, z), place(new THREE.CylinderGeometry(0.4, 0.1, 5, 8), x + 3.5, 13.5, z));
        const l = sprite('#ffb43d', 3, 0.9); l.position.set(x, 17.4, z); g.add(l);
      }
      g.add(meshOf(rg, rig));
    } else if (theme === 'moon') {
      const hull = new THREE.MeshStandardMaterial({ color: '#c8ccd8', metalness: 0.7, roughness: 0.35 }), dark = new THREE.MeshStandardMaterial({ color: '#3a3e4c', metalness: 0.7, roughness: 0.4 });
      const winM = new THREE.MeshBasicMaterial({ color: hot('#ffe2a8', 2.2), toneMapped: false });
      const panel = new THREE.MeshStandardMaterial({ map: tx.panel, emissiveMap: tx.panel, emissive: col('#3a7aff'), emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.3 });
      const hg = [], dg = [], wg = [], pg = [];
      for (let x = x0; x < x1; x += 26 + r() * 22) {
        const z = -34 - r() * 50, y = 8 + r() * 22, L = 10 + r() * 10;
        hg.push(place(new THREE.CylinderGeometry(2.6, 2.6, L, 16), x, y, z, 0, 0, Math.PI / 2));
        for (let k = -1; k <= 1; k++) dg.push(place(new THREE.CylinderGeometry(2.85, 2.85, 0.5, 16), x + k * L * 0.35, y, z, 0, 0, Math.PI / 2));
        for (let k = 0; k < 4; k++) wg.push(place(box(0.6, 0.35, 0.1), x - L * 0.3 + k * L * 0.2, y + 0.6, z + 2.62));
        dg.push(place(box(0.5, 0.5, 18), x, y, z - 9));
        for (const s2 of [-1, 1]) pg.push(place(box(9, 0.12, 4), x + s2 * (L / 2 + 5), y, z, 0.3, 0, 0));
        const bl = sprite('#ff3b4f', 2.4, 0.9); bl.position.set(x, y + 3.1, z); g.add(bl);
        anim.push(() => { bl.visible = Math.sin(time * 0.05 + x) > 0; });
      }
      g.add(meshOf(hg, hull), meshOf(dg, dark), meshOf(wg, winM, false), meshOf(pg, panel, false));
      const rockM = new THREE.MeshStandardMaterial({ color: '#7a7684', roughness: 1, flatShading: true });
      for (let x = x0; x < x1; x += 9 + r() * 14) {
        const a = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + r() * 1.8, 0), rockM), by = 2 + r() * 26, ph = r() * 6;
        a.position.set(x, by, -12 - r() * 40); a.castShadow = true; g.add(a);
        anim.push(() => { a.rotation.x = time * 0.004 + ph; a.rotation.y = time * 0.003 + ph; a.position.y = by + Math.sin(time * 0.01 + ph) * 0.4; });
      }
    } else {
      const rock = new THREE.MeshStandardMaterial({ color: '#7a6094', map: tx.islandRock, roughness: 0.9, flatShading: true });
      const grass = new THREE.MeshStandardMaterial({ color: '#7ad08a', map: tx.top, roughness: 0.9, flatShading: true });
      const red = new THREE.MeshStandardMaterial({ color: '#b83a3a', roughness: 0.5 }), roof = new THREE.MeshStandardMaterial({ color: '#2f8f86', roughness: 0.4, metalness: 0.3, flatShading: true });
      const gold = new THREE.MeshStandardMaterial({ color: '#f2c45a', roughness: 0.3, metalness: 0.9 });
      const lantern = new THREE.MeshBasicMaterial({ color: hot('#ff6a4a', 3), toneMapped: false });
      for (let x = x0; x < x1; x += 18 + r() * 22) {
        const isl = new THREE.Group(), s = 2 + r() * 5, z = -34 - r() * 110;
        isl.add(new THREE.Mesh(new THREE.ConeGeometry(s, s * 2.2, 7), rock)); isl.children[0].rotation.x = Math.PI; isl.children[0].position.y = -s * 1.1;
        const top = new THREE.Mesh(new THREE.CylinderGeometry(s * 1.05, s, 0.6, 9), grass); top.position.y = 0.2; isl.add(top);
        if (r() < 0.6) {
          let y = 0.5, pw = s * 0.7;
          for (let tier = 0; tier < 2 + Math.floor(r() * 2); tier++) {
            const body = new THREE.Mesh(box(pw, 1.1, pw), red); body.position.y = y + 0.55; isl.add(body);
            const rf = new THREE.Mesh(new THREE.ConeGeometry(pw * 0.95, 0.9, 4), roof); rf.rotation.y = Math.PI / 4; rf.position.y = y + 1.55; isl.add(rf);
            const tr = new THREE.Mesh(box(pw * 1.3, 0.08, pw * 1.3), gold); tr.position.y = y + 1.12; isl.add(tr);
            const ln = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), lantern); ln.position.set(pw * 0.6, y + 0.9, pw * 0.6); isl.add(ln);
            y += 1.6; pw *= 0.72;
          }
        }
        isl.traverse(o => { o.castShadow = o.receiveShadow = true; });
        const by = 6 + r() * 26; isl.position.set(x, by, z); g.add(isl);
        const ph = r() * 6; anim.push(() => { isl.position.y = by + Math.sin(time * 0.012 + ph) * 0.6; });
      }
      const cloud = new THREE.MeshStandardMaterial({ color: '#f6dce8', roughness: 1, emissive: col('#ff9ac0'), emissiveIntensity: 0.08, flatShading: true }), cg = [];
      for (let x = x0; x < x1 + 40; x += 9 + r() * 16) {
        const z = -16 - r() * 140, y = 2 + r() * 34, n = 4 + Math.floor(r() * 5), cs = 1 + r() * 2.5;
        for (let k = 0; k < n; k++) cg.push(place(new THREE.IcosahedronGeometry(cs * (0.7 + r() * 0.6), 1), x + (k - n / 2) * cs * 0.9, y + Math.sin(k / n * Math.PI) * cs * 0.6, z + (r() - 0.5) * cs));
      }
      g.add(meshOf(cg, cloud, false));
      const puffs = [];
      for (let x = x0; x < x1; x += 3 + r() * 4) puffs.push(place(new THREE.IcosahedronGeometry(0.8 + r() * 0.8, 1), x, 0.3 + r() * 0.5, 2.6 + r() * 1.6));
      g.add(meshOf(puffs, cloud, false));
    }

    // themed lighting
    sun.color.set(th.sun[0]); sun.intensity = th.sun[1]; sun.userData.dir = new THREE.Vector3(...th.sun[2]).normalize();
    hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); hemi.intensity = th.hemi[2];
    under.color.set(th.under[0]); under.intensity = th.under[1];
    renderer.toneMappingExposure = th.exposure;
    grade.uniforms.uTint.value.set(...th.grade);
    bloomBase = th.bloom[0]; bloom.threshold = th.bloom[1];

    if (def && def.mode !== 'base') g.add(buildLevelGeometry(theme, def, r));
    if (showcase) g.add(buildShowcase(theme));
    return { group: g, anim, celestial, theme };
  }

  // base stage corridor: floor, walls with light strips, ceiling lamps, back wall with doors, electric fence
  function buildCorridor(g, anim, tx) {
    const metal = new THREE.MeshStandardMaterial({ map: tx.wall, color: '#9aa0b8', metalness: 0.6, roughness: 0.45 });
    const floorM = new THREE.MeshStandardMaterial({ map: tx.top, color: '#a0a6c0', metalness: 0.5, roughness: 0.5, emissiveMap: tx.topE, emissive: col('#ffffff'), emissiveIntensity: 1.3 });
    const glowM = new THREE.MeshBasicMaterial({ color: hot('#38e0ff', 2.4), toneMapped: false }), lamp = new THREE.MeshBasicMaterial({ color: hot('#e8f0ff', 2.6), toneMapped: false });
    const amber = new THREE.MeshBasicMaterial({ color: hot('#ffb43d', 2.4), toneMapped: false }), dark = new THREE.MeshStandardMaterial({ color: '#05060a', roughness: 1 });
    g.add(meshOf([worldUV(place(box(34, 0.4, 46), 0, -0.2, -12), 0.25)], floorM));
    const walls = [], strips = [], lamps = [];
    for (const sd of [-1, 1]) {
      walls.push(worldUV(place(box(1, 13, 46), sd * 16.5, 6.3, -12), 0.25));
      for (let z = 6; z > -30; z -= 6) walls.push(worldUV(place(box(1.4, 13, 1.2), sd * 15.7, 6.3, z), 0.25));
      for (const y of [1.0, 5.4, 9.8]) strips.push(place(box(0.08, 0.1, 46), sd * 15.95, y, -12));
    }
    walls.push(worldUV(place(box(34, 0.6, 46), 0, 12.6, -12), 0.25));
    walls.push(worldUV(place(box(34, 13, 1), 0, 6.3, -31.2), 0.25));
    for (let z = 4; z > -30; z -= 6) lamps.push(place(box(6, 0.12, 1.2), 0, 12.25, z));
    g.add(meshOf(walls, metal), meshOf(strips, glowM, false), meshOf(lamps, lamp, false));
    const doors = [], frames = [];
    for (const sd of [-1, 1]) { doors.push(place(box(3.4, 5.4, 0.5), sd * 12.5, 2.7, -30.6)); frames.push(place(box(3.8, 0.15, 0.2), sd * 12.5, 5.5, -30.3), place(box(0.15, 5.5, 0.2), sd * 12.5 - 1.85, 2.75, -30.3), place(box(0.15, 5.5, 0.2), sd * 12.5 + 1.85, 2.75, -30.3)); }
    g.add(meshOf(doors, dark, false), meshOf(frames, amber, false));
    const barrier = new THREE.Mesh(new THREE.PlaneGeometry(30, 7.6), new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uT; varying vec2 vUv; ${NOISE}
        void main(){
          float x = vUv.x * 60.0, b = 0.0;
          for (int i = 0; i < 5; i++) { float fi = float(i); float y = 0.1 + fi * 0.2 + (noise(vec2(x * 0.35 + uT * (0.5 + fi * 0.13), fi * 7.0)) - 0.5) * 0.16; b += smoothstep(0.018, 0.0, abs(vUv.y - y)); }
          float grid = smoothstep(0.95, 1.0, fract(vUv.x * 30.0)) * 0.25;
          gl_FragColor = vec4(vec3(0.35, 0.7, 1.6) * (b * 1.8 + grid + 0.05), 1.0);
        }`,
    }));
    barrier.position.set(0, 3.9, -21); barrier.visible = false; g.add(barrier);
    const posts = [];
    for (const sd of [-1, 1]) posts.push(place(box(0.5, 8.4, 0.5), sd * 15.2, 4.2, -21));
    g.add(meshOf(posts, metal));
    anim.push(() => { barrier.material.uniforms.uT.value = time; });
    corridor = { barrier };
  }
  let corridor = null;

  function makeWallCore() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.2, 10, 24), MODELS.std('#3a3f52', { m: 0.8, r: 0.3 })));
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), MODELS.std('#101018')); back.position.z = -0.1; g.add(back);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshBasicMaterial({ color: hot('#38e0ff', 3), toneMapped: false })); g.add(orb);
    const halo = sprite('#38e0ff', 3.2, 0.5); g.add(halo);
    g.userData.set = (alive, flash, t, colr) => {
      orb.material.color.copy(alive ? (flash > 0 ? hot('#ffffff', 3) : hot(colr || '#38e0ff', 2.2 + Math.sin(t * 0.15) * 0.8)) : col('#16161c'));
      halo.visible = alive; halo.material.color.copy(hot(colr || '#38e0ff', 1));
    };
    return g;
  }
  function makeMainCore() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.32, 12, 32), MODELS.std('#4a4f66', { m: 0.8, r: 0.3 })));
    const orb = new THREE.Mesh(new THREE.SphereGeometry(1.15, 20, 14), new THREE.MeshBasicMaterial({ color: hot('#ff5a1f', 3), toneMapped: false })); g.add(orb);
    const shellM = new THREE.MeshStandardMaterial({ color: '#5a5f72', metalness: 0.8, roughness: 0.3 });
    const shells = [-1, 1].map(sd => { const m = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12, sd < 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI), shellM); g.add(m); return m; });
    const halo = sprite('#ff6a2a', 5, 0.6); g.add(halo);
    g.userData.set = (alive, open, flash, t) => {
      orb.material.color.copy(alive ? (flash > 0 ? hot('#ffffff', 3) : hot('#ff5a1f', 2.4 + Math.sin(t * 0.2))) : col('#1a1414'));
      shells[0].position.x = -open * 1.6; shells[1].position.x = open * 1.6; halo.visible = alive && open > 0.5;
    };
    return g;
  }
  function makeGate() {
    const g = new THREE.Group(), iron = MODELS.std('#2a2836', { m: 0.8, r: 0.35 }), iron2 = MODELS.std('#4a4660', { m: 0.8, r: 0.3 });
    const glowR = new THREE.MeshBasicMaterial({ color: hot('#ff3b4f', 2.6), toneMapped: false });
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    add(box(22, 11.5, 1.2), iron, 0, 5.75, 0);
    add(box(23, 1, 1.6), iron2, 0, 11.6, 0.1);
    for (const sd of [-1, 1]) { add(box(1.2, 11.5, 1.8), iron2, sd * 11, 5.75, 0.2); const h = add(new THREE.ConeGeometry(1, 3.2, 4), iron2, sd * 9.5, 13.4, 0); h.rotation.z = sd * 0.5; }
    for (let i = 0; i < 6; i++) add(box(0.12, 9, 0.1), glowR, -7.5 + i * 3, 5.2, 0.62);
    add(new THREE.TorusGeometry(2.4, 0.4, 12, 32), iron2, 0, 3, 0.7);
    const orb = add(new THREE.SphereGeometry(1.6, 20, 14), new THREE.MeshBasicMaterial({ color: hot('#ff2a4a', 3), toneMapped: false }), 0, 3, 0.4);
    const stripes = new THREE.MeshStandardMaterial({ color: '#d8b030', metalness: 0.6, roughness: 0.4 });
    const shut = [-1, 1].map(sd => add(box(2.4, 4.8, 0.5), stripes, sd * 1.2, 3, 1.1));
    g.userData.set = (b, t) => {
      shut[0].position.x = -1.2 - b.open * 2.4; shut[1].position.x = 1.2 + b.open * 2.4;
      orb.material.color.copy(b.flash > 0 ? hot('#ffffff', 3) : hot(b.hp < b.maxHp * 0.5 ? '#ff2a4a' : '#ff6a2a', 2.2 + Math.sin(t * 0.2)));
    };
    return g;
  }

  function groundMaterials(theme) {
    const tx = textures(theme);
    if (theme === 'harbor') return {
      wall: new THREE.MeshStandardMaterial({ map: tx.wall, color: '#9aa6d8', roughness: 0.6, metalness: 0.5 }),
      cap: new THREE.MeshStandardMaterial({ map: tx.top, color: '#c8d2f0', roughness: 0.45, metalness: 0.6 }),
      plat: new THREE.MeshStandardMaterial({ map: tx.plat, roughness: 0.8, metalness: 0.05 }),
      trim: new THREE.MeshBasicMaterial({ color: hot('#38e0ff', 2.6), toneMapped: false }),
    };
    if (theme === 'forge') return {
      wall: new THREE.MeshStandardMaterial({ map: tx.wall, emissiveMap: tx.wallE, emissive: col('#ffffff'), emissiveIntensity: 1.8, roughness: 0.9, metalness: 0.1 }),
      cap: new THREE.MeshStandardMaterial({ map: tx.top, roughness: 0.85, metalness: 0.1 }),
      plat: new THREE.MeshStandardMaterial({ map: tx.plat, roughness: 0.5, metalness: 0.8 }),
      trim: new THREE.MeshBasicMaterial({ color: hot('#ff7a2a', 2.4), toneMapped: false }),
    };
    if (theme === 'falls') return {
      wall: new THREE.MeshStandardMaterial({ map: tx.wall, color: '#b8b0a0', roughness: 0.95, metalness: 0, flatShading: true }),
      cap: new THREE.MeshStandardMaterial({ map: tx.top, roughness: 0.9, metalness: 0 }),
      plat: new THREE.MeshStandardMaterial({ map: tx.plat, roughness: 0.8, metalness: 0 }),
      trim: new THREE.MeshStandardMaterial({ color: '#3a2a18', roughness: 0.9 }),
    };
    if (theme === 'ice') return {
      wall: new THREE.MeshStandardMaterial({ map: tx.wall, color: '#c8dcf0', roughness: 0.45, metalness: 0.1 }),
      cap: new THREE.MeshStandardMaterial({ map: tx.top, roughness: 0.85, metalness: 0 }),
      plat: new THREE.MeshStandardMaterial({ map: tx.plat, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88, emissive: col('#3aa8e0'), emissiveIntensity: 0.35 }),
      trim: new THREE.MeshBasicMaterial({ color: hot('#7fe8ff', 2.2), toneMapped: false }),
    };
    if (theme === 'moon') return {
      wall: new THREE.MeshStandardMaterial({ map: tx.wall, emissiveMap: tx.wallE, emissive: col('#ffffff'), emissiveIntensity: 1.6, roughness: 0.45, metalness: 0.7 }),
      cap: new THREE.MeshStandardMaterial({ map: tx.top, roughness: 0.4, metalness: 0.75 }),
      plat: new THREE.MeshStandardMaterial({ map: tx.plat, roughness: 0.35, metalness: 0.6 }),
      trim: new THREE.MeshBasicMaterial({ color: hot('#9a7aff', 2.6), toneMapped: false }),
    };
    return {
      wall: new THREE.MeshStandardMaterial({ map: tx.wall, roughness: 0.55, metalness: 0.15 }),
      cap: new THREE.MeshStandardMaterial({ map: tx.top, roughness: 0.9, metalness: 0 }),
      plat: new THREE.MeshStandardMaterial({ map: tx.plat, roughness: 0.35, metalness: 0.3 }),
      trim: new THREE.MeshStandardMaterial({ color: '#f2c45a', roughness: 0.25, metalness: 0.95, emissive: col('#6a4a00'), emissiveIntensity: 0.6 }),
    };
  }

  // level blocks: solid ground from the level data, one-way platforms, decoration behind the play plane
  function buildLevelGeometry(theme, def, r) {
    const g = new THREE.Group(), m = groundMaterials(theme);
    const walls = [], caps = [], trims = [], plats = [], deco = [], glows = [];
    const FRONT = 1.6, BACK = -3.4, D = FRONT - BACK, ZC = (FRONT + BACK) / 2, floating = theme === 'sky' || theme === 'moon', BOTTOM = floating ? -6 : -3;
    for (const [a, b, row] of def.ground) {
      const top = ROWS - row, w = b - a, cx = (a + b) / 2;
      if (floating) {
        walls.push(worldUV(place(box(w, top - 1.2, D), cx, (top - 1.2) / 2 + 1.2, ZC), 0.5));
        walls.push(worldUV(place(new THREE.CylinderGeometry(Math.max(w, D) * 0.55, 0.6, 7, 7), cx, -2.3, ZC, 0, 0, 0, w / Math.max(w, D), 1, D / Math.max(w, D)), 0.5));
      } else walls.push(worldUV(place(box(w, top - BOTTOM, D), cx, (top + BOTTOM) / 2, ZC), 0.5));
      caps.push(worldUV(place(box(w + 0.16, 0.34, D + 0.16), cx, top - 0.14, ZC), 0.5));
      trims.push(place(box(w + 0.18, 0.07, 0.07), cx, top - 0.34, FRONT + 0.1));
      for (let x = a + 1 + r() * 3; x < b - 1; x += 3 + r() * 4) {
        const zz = BACK + 0.9 + r() * 0.6;
        if (theme === 'harbor') {
          if (r() < 0.5) { deco.push(place(box(0.14, 2.6, 0.14), x, top + 1.3, zz), place(box(0.7, 0.1, 0.14), x + 0.3, top + 2.6, zz)); glows.push([x + 0.6, top + 2.45, zz, '#ffe2a8']); }
          else deco.push(place(new THREE.CylinderGeometry(0.22, 0.26, 0.6, 8), x, top + 0.3, zz), place(box(0.9, 0.9, 0.9), x + 0.9, top + 0.45, zz - 0.2, 0, r()));
        } else if (theme === 'forge') {
          if (r() < 0.5) { deco.push(place(new THREE.CylinderGeometry(0.4, 0.4, 1.0, 10), x, top + 0.5, zz)); glows.push([x, top + 1.05, zz, '#ff6a2a']); }
          else { deco.push(place(new THREE.OctahedronGeometry(0.5), x, top + 0.4, zz, r(), r(), r())); glows.push([x, top + 0.45, zz, '#ff3d1a']); }
        } else if (theme === 'ice') {
          if (r() < 0.45) { deco.push(place(new THREE.OctahedronGeometry(0.45), x, top + 0.6, zz, 0, r() * 3, 0, 0.7, 1.6, 0.7)); glows.push([x, top + 0.6, zz, '#7fe8ff']); }
          else deco.push(place(new THREE.IcosahedronGeometry(0.45 + r() * 0.35, 0), x, top + 0.3, zz));
        } else if (theme === 'moon') {
          if (r() < 0.45) { deco.push(place(box(0.12, 2.2, 0.12), x, top + 1.1, zz)); glows.push([x, top + 2.25, zz, '#9a7aff']); }
          else deco.push(place(box(0.9, 0.7, 0.9), x, top + 0.35, zz, 0, r()), place(box(0.6, 0.5, 0.6), x + 0.2, top + 0.95, zz, 0, r()));
        } else {
          if (r() < 0.45) { deco.push(place(box(0.1, 1.6, 0.1), x, top + 0.8, zz)); glows.push([x, top + 1.7, zz, '#ff5a4a']); }
          else deco.push(place(new THREE.IcosahedronGeometry(0.5 + r() * 0.3, 0), x, top + 0.35, zz));
        }
      }
    }
    for (const [c0, r0, w, h] of def.blocks || []) {
      const top = ROWS - r0, cx = c0 + w / 2;
      walls.push(worldUV(place(box(w, h, D), cx, top - h / 2, ZC), 0.5));
      caps.push(worldUV(place(box(w + 0.16, 0.34, D + 0.16), cx, top - 0.14, ZC), 0.5));
    }
    for (const [c0, row, len] of def.plats) {
      if (theme === 'falls') { const top = ROWS - row; for (let k = 0; k < len; k += 2) deco.push(place(new THREE.ConeGeometry(0.22, 0.5 + r() * 0.4, 5), c0 + k + 0.5, top + 0.25, -1.3)); }
      const top = ROWS - row, cx = c0 + len / 2;
      plats.push(worldUV(place(box(len, 0.36, 2.8), cx, top - 0.18, -0.2), 0.5));
      if (theme === 'harbor') for (const px of [c0 + 0.3, c0 + len - 0.3]) deco.push(place(box(0.22, top - 1.4, 0.22), px, (top + 1.4) / 2 - 0.2, 1.0));
      else if (theme === 'forge') for (const px of [c0 + 0.3, c0 + len - 0.3]) deco.push(place(box(0.08, 22 - top, 0.08), px, (22 + top) / 2, -0.2));
      else trims.push(place(box(len + 0.1, 0.06, 0.06), cx, top - 0.38, 1.25));
    }
    g.add(meshOf(walls, m.wall), meshOf(caps, m.cap), meshOf(trims, m.trim, false), meshOf(plats, m.plat));
    const decoCol = { sky: '#4e9e58', harbor: '#3a4466', forge: '#3a2a2a', ice: '#e4eef8', moon: '#5a5e70', falls: '#3f7a30' }[theme];
    const decoMat = new THREE.MeshStandardMaterial({ color: decoCol, metalness: theme === 'sky' || theme === 'ice' ? 0 : 0.5, roughness: theme === 'sky' || theme === 'ice' ? 0.9 : 0.5, flatShading: theme === 'sky' || theme === 'ice' });
    g.add(meshOf(deco, decoMat));
    for (const [x, y, z, c] of glows) {
      const s = sprite(c, 2.2, 0.8); s.position.set(x, y, z); g.add(s);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: hot(c, 3), toneMapped: false })); b.position.set(x, y, z); g.add(b);
    }
    return g;
  }

  // title / select / victory stage: a rooftop (or island) the heroes stand on
  function buildShowcase(theme) {
    const g = new THREE.Group(), m = groundMaterials(theme);
    const top = 5;
    g.add(meshOf([worldUV(place(box(46, top + 3, 9), 15, (top - 3) / 2, -1.5), 0.5)], m.wall));
    g.add(meshOf([worldUV(place(box(46.2, 0.34, 9.2), 15, top - 0.14, -1.5), 0.5)], m.cap));
    g.add(meshOf([place(box(46.3, 0.07, 0.07), 15, top - 0.34, 3.1)], m.trim, false));
    return g;
  }

  // ---------- pools ----------
  const P = {};
  function take(key, make) {
    const p = P[key] || (P[key] = { list: [], n: 0 });
    if (p.n >= p.list.length) { const m = make(); ents.add(m); p.list.push(m); }
    const m = p.list[p.n++]; m.visible = true; return m;
  }
  function poolsBegin() { for (const k in P) P[k].n = 0; }
  function poolsEnd() { for (const k in P) { const p = P[k]; for (let i = p.n; i < p.list.length; i++) p.list[i].visible = false; } }

  const dummy = new THREE.Object3D();
  function inst(geo, mat, max = 400) {
    const m = new THREE.InstancedMesh(geo, mat, max); m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ents.add(m);
    return m;
  }
  function instColor(m) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.instanceMatrix.count * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage); return m; }
  const basic = (c, k = 1, o = {}) => new THREE.MeshBasicMaterial({ color: hot(c, k), toneMapped: false, transparent: !!o.add, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !o.add, opacity: o.op ?? 1 });
  let I = null;
  function buildInstances() {
    const sph = new THREE.SphereGeometry(1, 10, 8), cyl = new THREE.CylinderGeometry(1, 1, 1, 6);
    I = {
      P: inst(sph, basic('#ffe27a', 3)), S: inst(sph, basic('#ff7a3d', 3)), D: inst(sph, basic('#69d2ff', 3)),
      L: inst(new THREE.BoxGeometry(1, 1, 1), basic('#5ff5d6', 3.5)), H: inst(new THREE.BoxGeometry(1, 1, 1), basic('#e0a8ff', 3)),
      dot: inst(sph, basic('#ff3b4f', 3)), dotHalo: inst(sph, basic('#ff3b4f', 1, { add: true, op: 0.35 })),
      fire: inst(sph, basic('#ff8a2a', 3.2)), fireHalo: inst(sph, basic('#ff5a1f', 1, { add: true, op: 0.45 })),
      wave: inst(sph, basic('#ffd23f', 3)), orb: inst(sph, basic('#ff5a1f', 3)),
      bomb: inst(sph, new THREE.MeshStandardMaterial({ color: '#3a3448', metalness: 0.7, roughness: 0.3 })), bombLight: inst(sph, basic('#ff3b4f', 3)),
      ball: instColor(inst(sph, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 120)),
      shock: instColor(inst(new THREE.TorusGeometry(1, 0.06, 6, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 120)),
      boltOut: inst(cyl, basic('#ff8a3d', 2.5, { add: true, op: 0.7 }), 300), boltIn: inst(cyl, basic('#fff6c2', 5), 300),
      F: inst(sph, basic('#ff7a2a', 2.2, { add: true, op: 0.55 }), 500),
      B: inst(sph, new THREE.MeshStandardMaterial({ color: '#4a6a2a', metalness: 0.6, roughness: 0.35 })),
      shard: inst(new THREE.OctahedronGeometry(1), basic('#cfefff', 2.2)),
      beamWarn: inst(new THREE.BoxGeometry(1, 1, 1), basic('#ff3b4f', 2, { add: true, op: 0.6 }), 8),
      beamOut: inst(new THREE.BoxGeometry(1, 1, 1), basic('#c040ff', 2.5, { add: true, op: 0.6 }), 8),
      beamIn: inst(new THREE.BoxGeometry(1, 1, 1), basic('#ffe8ff', 6), 8),
    };
  }
  function putSphere(m, x, y, z, s, sy = s, sz = s) {
    dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s, sy, sz); dummy.updateMatrix();
    m.setMatrixAt(m.count++, dummy.matrix);
  }

  // ---------- particles ----------
  function pointSystem(max, additive) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('rgba', new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec4 rgba; attribute float size; uniform float uScale; varying vec4 vC;
        void main(){ vC = rgba; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; float a = 1.0 - r; gl_FragColor = vec4(vC.rgb, vC.a * a * a); }`,
    });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
    return { pts, geo, max, n: 0 };
  }
  let PA, PS;
  function pBegin(p) { p.n = 0; }
  function pPush(p, x, y, z, r, g, b, a, size) {
    if (p.n >= p.max) return;
    const i = p.n++, pos = p.geo.attributes.position.array, c = p.geo.attributes.rgba.array;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = a;
    p.geo.attributes.size.array[i] = size;
  }
  function pEnd(p) {
    p.geo.setDrawRange(0, p.n);
    p.geo.attributes.position.needsUpdate = p.geo.attributes.rgba.needsUpdate = p.geo.attributes.size.needsUpdate = true;
  }
  const colorCache = new Map();
  function rgb(c) { let v = colorCache.get(c); if (!v) { v = col(c); colorCache.set(c, v); } return v; }

  // renderer-owned cosmetic particles (smoke, debris, ambience) — local only, never part of the simulation
  const fx = [];
  const smokeEmitters = [];
  function fxPush(o) { if (fx.length < 1400) fx.push(o); }
  function fxExplosion(x, y, size, z0 = 0) {
    for (let i = 0; i < 6 + size * 4; i++) fxPush({ x: x + (Math.random() - 0.5) * size * 0.6, y: y + (Math.random() - 0.5) * size * 0.4, z: z0 + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 0.04, vy: 0.02 + Math.random() * 0.04, vz: (Math.random() - 0.5) * 0.02, life: 60 + Math.random() * 50, max: 110, size: 0.6 + size * 0.5, grow: 0.025, smoke: true, c: [0.12, 0.1, 0.13], a: 0.75 });
    for (let i = 0; i < 10 + size * 6; i++) { const a = Math.random() * Math.PI * 2, s = 0.05 + Math.random() * 0.12 * size; fxPush({ x, y, z: z0 + (Math.random() - 0.5) * 0.6, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 0.08, vz: (Math.random() - 0.5) * 0.15, g: 0.006, life: 30 + Math.random() * 30, max: 60, size: 0.12, c: [3, 1.6, 0.4], a: 1 }); }
  }

  // ---------- dynamic lights ----------
  const LIGHTS = 6;
  const lightReq = [];
  function lightAt(x, y, z, c, intensity, dist) { lightReq.push({ x, y, z, c, intensity, dist }); }

  // ---------- init / resize ----------
  let rain = null, streaks = null;
  function init(cv) {
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.5, 1600);
    hemi = new THREE.HemisphereLight('#ffffff', '#222222', 1); scene.add(hemi);
    sun = new THREE.DirectionalLight('#ffffff', 1.5); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 16, bottom: -16, near: 1, far: 140 });
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun, sun.target);
    under = new THREE.DirectionalLight('#ff5a1f', 0.5); under.position.set(0, -1, 0.6); scene.add(under, under.target);
    for (let i = 0; i < LIGHTS; i++) { const l = new THREE.PointLight('#ffffff', 0, 8, 2); scene.add(l); lights.push(l); }
    scene.add(ents);
    buildInstances();
    PA = pointSystem(1600, true); PS = pointSystem(1400, false);
    scene.add(PS.pts, PA.pts);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(700 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: hot('#8fa3ff', 1.2), transparent: true, opacity: 0.35, toneMapped: false })); rain.frustumCulled = false; scene.add(rain);
    rain.userData.drops = Array.from({ length: 700 }, () => ({ x: Math.random() * 60 - 30, y: Math.random() * 26, z: Math.random() * 16 - 10 }));
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(160 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    streaks = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 })); streaks.frustumCulled = false; scene.add(streaks);
    streaks.userData.s = Array.from({ length: 160 }, () => ({ x: Math.random() * 70 - 35, y: Math.random() * 20, z: Math.random() * 14 - 8, v: 0.4 + Math.random() * 0.5, l: 0.8 + Math.random() * 1.6 }));

    const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 });
    composer = new THREE.EffectComposer(renderer, rt);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.82);
    composer.addPass(bloom);
    grade = new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uFlash: { value: 0 }, uT: { value: 0 }, uDamage: { value: 0 }, uFade: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 uTint; uniform float uFlash, uT, uDamage, uFade; varying vec2 vUv;
        vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb * uTint;
          c = mix(c, vec3(1.0, 0.95, 0.8), uFlash);
          c *= 1.0 - uFade;
          vec2 d = vUv - 0.5; float vig = smoothstep(0.85, 0.25, length(d * vec2(1.0, 0.85)));
          c *= mix(0.55, 1.0, vig);
          c = mix(c, c * vec3(1.6, 0.4, 0.4), uDamage * (1.0 - vig));
          c = toSRGB(c);
          c += (fract(sin(dot(vUv * 913.0 + uT, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.025;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    composer.addPass(grade);
    resize();
    addEventListener('resize', resize);
  }

  let dist = 24, bloomBase = 0.85;
  function resize() {
    cssW = innerWidth; cssH = innerHeight;
    const pr = Math.min(devicePixelRatio || 1, quality === 'high' ? 1.5 : 1);
    renderer.setPixelRatio(pr); renderer.setSize(cssW, cssH, false);
    composer.setPixelRatio(pr); composer.setSize(cssW, cssH);
    camera.aspect = cssW / cssH; camera.updateProjectionMatrix();
    const t = Math.tan(THREE.MathUtils.degToRad(36 / 2));
    dist = Math.max(30 / (2 * t * camera.aspect), 17.4 / (2 * t)) * 1.03;
    const sc = (cssH * pr) / (2 * t);
    PA.pts.material.uniforms.uScale.value = sc; PS.pts.material.uniforms.uScale.value = sc;
  }
  function setQuality(q) {
    quality = q; renderer.shadowMap.enabled = q === 'high'; sun.castShadow = q === 'high';
    bloom.enabled = true; bloom.strength = q === 'high' ? 0.85 : 0.6;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    resize();
  }

  // ---------- per-frame ----------
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  let seenRings = new Set(), lastBolts = 0, flashT = 0, mode = '';

  function ensureEnv(key, theme, def, showcase) {
    if (key === envKey) return;
    if (env) { scene.remove(env.group); env.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    smokeEmitters.length = 0; fx.length = 0;
    env = buildEnv(theme, def, showcase); envKey = key; scene.add(env.group);
  }

  function heroState(p, t) {
    return {
      running: p.onGround && Math.abs(p.vx) > 0.3, phase: p.anim * 0.42, onGround: p.onGround, crouch: p.crouch, dash: p.dashT > 0,
      aim: Math.atan2(-p.aimY, Math.abs(p.aimX)), t, flash: p.flash, hit: 0,
    };
  }
  function drawHero(ci, x, y, z, facing, s, key) {
    const m = take(key || 'hero_' + ci, () => MODELS.hero(ci));
    m.position.set(x, y, z); m.scale.set(1.22, 1.22, 1.22); MODELS.face(m, facing); m.scale.x *= 1.22; m.userData.animate(s);
    return m;
  }

  const ghostMats = {};
  function ghostMat(c) { return ghostMats[c] || (ghostMats[c] = new THREE.MeshBasicMaterial({ color: hot(c, 1.4), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); }
  const ringGeos = [];
  function progressRing(k) { const i = Math.round(Math.min(1, k) * 20); return ringGeos[i] || (ringGeos[i] = new THREE.RingGeometry(0.95, 1.12, 40, 1, Math.PI / 2, Math.PI * 2 * Math.max(0.001, i / 20))); }

  function renderLevel(V, t) {
    const L = V.Lv, G = V.G;
    // camera: the simulation shows x ∈ [camX, camX + 480]; frame that span at the play plane
    const cx = X(L.camX) + 15, sh = L.shake * 0.05, baseY = -(L.camY || 0) * U;
    viewCY = 8 + baseY;
    camLook.set(cx, 8.2 + baseY, 0); camPos.set(cx, 10.6 + baseY, dist);
    if (sh) { camPos.x += (Math.random() - 0.5) * sh; camPos.y += (Math.random() - 0.5) * sh; }
    camera.position.copy(camPos); camera.lookAt(camLook);

    // heroes
    G.players.forEach((pr, i) => {
      const p = L.players[i]; if (!p) return;
      const c = PCOL[pr.num];
      if (p.ghost) {
        const g = take(`spirit_${pr.num}_${p.ci}`, () => MODELS.hero(p.ci, ghostMat(c)));
        g.position.set(X(p.gx), Y(p.gy + 11) + Math.sin(t * 0.1) * 0.1, 0.4); MODELS.face(g, 1);
        g.userData.animate({ running: false, phase: 0, onGround: false, crouch: false, dash: false, aim: 0.6, t, flash: 0 });
        const ring = take('revive', () => new THREE.Mesh(progressRing(1), basic('#ffffff', 2)));
        ring.geometry = progressRing(p.reviveT / 100); ring.material.color.copy(hot(c, 2.5));
        ring.position.set(X(p.gx), Y(p.gy) , 0.8);
        const base = take('reviveBase', () => new THREE.Mesh(new THREE.RingGeometry(0.95, 1.12, 40), basic('#3a3448', 1, { op: 0.6, add: true })));
        base.position.copy(ring.position);
        return;
      }
      if (p.dead) return;
      if (p.invuln > 0 && Math.floor(t / 3) % 2 && p.invuln < 140) return;
      const m = drawHero(p.ci, X(p.x + p.w / 2), Y(p.y + p.h), 0, p.facing, heroState(p, t));
      const fr = take('feet_' + pr.num, () => { const o = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 32), basic(c, 2.2, { add: true, op: 0.75 })); o.rotation.x = -Math.PI / 2; return o; });
      fr.position.set(m.position.x, m.position.y + 0.04, 0); fr.visible = p.onGround;
      if (p.shieldT > 0 && !(p.shieldT < 90 && t % 6 < 3)) {
        const bub = take('bubble_' + pr.num, () => new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), basic('#5fd0ff', 1.6, { add: true, op: 0.2 })));
        const k = 1.25 + Math.sin(t * 0.2) * 0.05;
        bub.position.set(m.position.x, m.position.y + (p.crouch ? 0.6 : 1.0), 0); bub.scale.set(k * 0.95, k * (p.crouch ? 0.8 : 1.15), k * 0.95);
        lightAt(m.position.x, m.position.y + 1, 0.8, '#5fd0ff', 1.5, 5);
      }
      const sp = take('spot_' + pr.num, () => sprite(c, 3.2, 0.22));
      sp.position.set(m.position.x, m.position.y + 1.0, -0.3);
      if (G.players.length > 1) {
        const mk = take('marker_' + pr.num, () => { const o = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), basic(c, 2.5)); o.rotation.x = Math.PI; return o; });
        mk.position.set(m.position.x, m.position.y + (p.crouch ? 1.5 : 2.15) + Math.sin(t * 0.15) * 0.05, 0);
        mk.rotation.y = t * 0.05;
      }
      if (p.flash > 0) lightAt(m.position.x + p.facing * 1.1, m.position.y + 1.1, 0.6, pr.weapon === 'L' ? '#5ff5d6' : '#ffd27a', 3, 6);
      if (p.drone) {
        const d = take('buddy', () => MODELS.drone('#e9a02c', '#69d2ff', 0.6));
        d.position.set(X(p.drone.x), Y(p.drone.y), 0.3); MODELS.face(d, p.facing); d.userData.animate({ vx: 0, flash: 0 }, t);
      }
    });
    for (const tr of L.trail) {
      const g = take('trail_' + tr.ci, () => MODELS.hero(tr.ci, ghostMat('#9fd8ff')));
      g.position.set(X(tr.x), Y(tr.y), -0.1); MODELS.face(g, tr.facing);
      g.userData.animate({ running: false, onGround: false, dash: true, aim: Math.atan2(-tr.aimY, Math.abs(tr.aimX)), t, flash: 0 });
    }

    // enemies
    for (const e of L.enemies) {
      const ex = X(e.x + e.w / 2), ey = Y(e.y + e.h);
      let m = null;
      switch (e.type) {
        case 'soldier': m = take('soldier', MODELS.soldier); m.position.set(ex, ey, 0); m.scale.set(1.15, 1.15, 1.15); m.userData.animate(e, t); m.scale.x *= 1.15; if (e.muzzle > 0) lightAt(ex + e.face * 0.9, ey + 0.9, 0.5, '#ff6070', 2, 5); break;
        case 'turret': m = take('turret', MODELS.turret); m.position.set(ex, ey, 0); m.userData.animate(e, t); break;
        case 'drone': m = take('drone', () => MODELS.drone()); m.position.set(ex, Y(e.y + e.h / 2), 0); m.userData.animate(e, t); break;
        case 'hopper': m = take('hopper', MODELS.hopper); m.position.set(ex, ey, 0); m.userData.animate(e, t); break;
        case 'capsule': m = take('capsule', MODELS.capsule); m.position.set(ex, Y(e.y + e.h / 2), 0.4); m.userData.animate(e, t); break;
        case 'shield': m = take('shield', () => MODELS.soldier(true)); m.position.set(ex, ey, 0); m.scale.set(1.2, 1.2, 1.2); m.userData.animate(e, t); m.scale.x *= 1.2; if (e.muzzle > 0) lightAt(ex + e.face * 0.9, ey + 0.9, 0.5, '#ff6070', 2, 5); break;
        case 'icicle': m = take('icicle', MODELS.icicle); m.position.set(X(e.x), Y(0) + 0.1, -0.2); m.userData.animate(e, t); break;
        case 'geyser': {
          const cyc = (e.t || 0) % 130;
          if (cyc > 90) lightAt(X(e.x + 4), 1.8, 0.5, '#ff6a2a', (cyc - 90) / 10, 5);
          break;
        }
      }
    }
    for (const it of L.items) { const m = take('power_' + it.kind, () => MODELS.power(it.kind)); m.position.set(X(it.x + it.w / 2), Y(it.y + it.h), 0.3); m.scale.setScalar(1.3); m.userData.animate(it, t); }

    // boss
    const b = L.boss;
    if (b) {
      if (b.type === 'crab') { const m = take('boss_crab', MODELS.crab); m.position.set(X(b.x + b.w / 2), Y(b.y + b.h), -0.4); m.userData.animate(b, t); }
      else if (b.type === 'core') {
        const m = take('boss_core', MODELS.core); const ox = X(b.x), oy = Y(b.y + b.h);
        m.position.set(ox, oy, -1.2);
        m.userData.animate(b, t, (x, y) => ({ x: X(x) - ox, y: Y(y) - oy }));
        if (b.openAmt > 0.5) lightAt(X(b.cx), Y(b.cy + b.rise), 2.5, '#ff8a3d', 5, 12);
      } else if (b.type === 'idol') { const m = take('boss_idol', MODELS.idol); m.userData.animate(b, t, toW); if (b.mouth > 0.3) lightAt(X(b.cx), Y(b.cy + 28), 2, '#ffb43d', 4 * b.mouth, 10); }
      else if (b.type === 'mammoth') { const m = take('boss_mammoth', MODELS.mammoth); m.position.set(X(b.x + b.w / 2), Y(b.y + b.h), -0.4); m.userData.animate(b, t); }
      else if (b.type === 'eye') { const m = take('boss_eye', MODELS.eye); m.userData.animate(b, t, toW); lightAt(X(b.cx), Y(b.cy), 2.5, b.hp < b.maxHp * 0.5 ? '#ff2a4a' : '#c040ff', 4, 12); }
      else if (b.type === 'serpent') { const m = take('boss_serpent', MODELS.serpent); m.position.set(0, 0, 0); m.userData.animate(b, t, toW); if (b.jaw > 0) lightAt(X(b.hx) + b.face * 1.6, Y(b.hy), 1, '#ff6a2a', 3, 7); }
      if (!b.alive) {
        const pos = b.type === 'serpent' ? [b.hx, b.hy] : b.type === 'core' ? [b.cx, b.cy + b.rise] : b.type === 'eye' || b.type === 'idol' ? [b.cx, b.cy] : [b.x + b.w / 2, b.y + b.h / 2];
        lightAt(X(pos[0]), Y(pos[1]), 2, '#ffb43d', 6 + Math.random() * 4, 18);
      }
    }

    // bullets
    for (const k in I) I[k].count = 0;
    for (const q of L.pB) {
      const x = X(q.x), y = Y(q.y), a = Math.atan2(-q.vy, q.vx);
      if (q.kind === 'F') { const age = 26 - (q.life || 20); putSphere(I.F, x, y, 0.2, 0.12 + age * 0.03); continue; }
      if (q.kind === 'B' || q.kind === 'b') { putSphere(I.B, x, y, 0.2, q.kind === 'B' ? 0.2 : 0.13); if (t % 8 < 4) putSphere(I.bombLight, x, y + 0.15, 0.3, 0.06); continue; }
      if (q.kind === 'L' || q.kind === 'H') {
        const m = I[q.kind], len = q.kind === 'L' ? 1.3 : 0.4;
        dummy.position.set(x - Math.cos(a) * len * 0.4, y - Math.sin(a) * len * 0.4, 0.2); dummy.rotation.set(0, 0, a); dummy.scale.set(len, 0.13, 0.13); dummy.updateMatrix(); m.setMatrixAt(m.count++, dummy.matrix);
      } else putSphere(I[q.kind] || I.P, x, y, 0.2, q.kind === 'D' ? 0.1 : 0.14);
    }
    let fireLights = 0;
    for (const q of L.eB) {
      const x = X(q.x), y = Y(q.y), r = q.r * U;
      switch (q.kind) {
        case 'fire': putSphere(I.fire, x, y, 0.2, r * 1.1); putSphere(I.fireHalo, x, y, 0.2, r * 2.2); if (fireLights++ < 3) lightAt(x, y, 0.8, '#ff6a2a', 1.6, 4); break;
        case 'wave': putSphere(I.wave, x, y + 0.05, 0.2, 0.5, 0.3, 0.35); break;
        case 'bomb': putSphere(I.bomb, x, y, 0.2, 0.28); if (t % 10 < 5) putSphere(I.bombLight, x, y + 0.2, 0.3, 0.08); break;
        case 'orb': putSphere(I.orb, x, y, 0.2, 0.22); putSphere(I.fireHalo, x, y, 0.2, 0.4); break;
        case 'ice': {
          const a = Math.atan2(-q.vy, q.vx) - Math.PI / 2;
          dummy.position.set(x, y, 0.2); dummy.rotation.set(0, 0, a); dummy.scale.set(0.16, 0.34, 0.16); dummy.updateMatrix(); I.shard.setMatrixAt(I.shard.count++, dummy.matrix);
          break;
        }
        default: putSphere(I.dot, x, y, 0.2, 0.17); putSphere(I.dotHalo, x, y, 0.2, 0.36);
      }
    }

    // explosions: sim rings drive fireballs + shockwaves; new rings also spawn local smoke & debris
    const now = new Set();
    for (const rg of L.rings) {
      const k = 1 - rg.life / rg.max, x = X(rg.x), y = Y(rg.y), s = rg.r * U;
      const key = `${Math.round(rg.x)}:${Math.round(rg.y)}:${rg.r}`; now.add(key);
      if (!seenRings.has(key)) fxExplosion(x, y, s * 1.4);
      if (k < 0.45) {
        const f = 1 - k / 0.45, c = new THREE.Color().setRGB(3 * f + 0.6, (2.2 * f + 0.3) * f, 0.6 * f * f);
        dummy.position.set(x, y, 0.4); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(s * (0.6 + k * 2.2)); dummy.updateMatrix();
        I.ball.setMatrixAt(I.ball.count, dummy.matrix); I.ball.setColorAt(I.ball.count++, c);
        lightAt(x, y, 1, '#ffa040', 8 * f * Math.min(1.5, s), 10 + s * 4);
      }
      if (k < 0.6) {
        const f = 1 - k / 0.6;
        dummy.position.set(x, y, 0.3); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(s * (0.5 + k * 4)); dummy.updateMatrix();
        I.shock.setMatrixAt(I.shock.count, dummy.matrix); I.shock.setColorAt(I.shock.count++, new THREE.Color(2 * f, 1.6 * f, 0.8 * f));
      }
    }
    seenRings = now;

    // eye-boss beams: a thin flickering warning line, then a thick burning beam
    for (const bm of L.beams || []) {
      const x1 = X(bm.x1), y1 = Y(bm.y1), a = -bm.a, len = bm.len * U;
      dummy.position.set(x1 + Math.cos(a) * len / 2, y1 + Math.sin(a) * len / 2, 0.5); dummy.rotation.set(0, 0, a);
      if (bm.warn > 0) {
        dummy.scale.set(len, t % 6 < 3 ? 0.05 : 0.03, 0.05); dummy.updateMatrix(); I.beamWarn.setMatrixAt(I.beamWarn.count++, dummy.matrix);
      } else {
        const k = Math.min(1, bm.fire / 6);
        dummy.scale.set(len, 0.9 * k, 0.9 * k); dummy.updateMatrix(); I.beamOut.setMatrixAt(I.beamOut.count++, dummy.matrix);
        dummy.scale.set(len, 0.3 * k, 0.3 * k); dummy.updateMatrix(); I.beamIn.setMatrixAt(I.beamIn.count++, dummy.matrix);
        lightAt(x1 + Math.cos(a) * 3, y1 + Math.sin(a) * 3, 1, '#ff6ad5', 8 * k, 16);
      }
    }

    // storm bolts
    for (const bo of L.bolts) {
      const a = Math.min(1, bo.life / 8);
      for (let i = 2; i < bo.pts.length; i += 2) {
        const x1 = X(bo.pts[i - 2]), y1 = Y(bo.pts[i - 1]), x2 = X(bo.pts[i]), y2 = Y(bo.pts[i + 1]);
        const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) - Math.PI / 2;
        dummy.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0.6); dummy.rotation.set(0, 0, ang);
        const th = bo.small ? 0.08 : 0.16;
        dummy.scale.set(th * a, len, th * a); dummy.updateMatrix(); I.boltOut.setMatrixAt(I.boltOut.count++, dummy.matrix);
        dummy.scale.set(0.05, len, 0.05); dummy.updateMatrix(); I.boltIn.setMatrixAt(I.boltIn.count++, dummy.matrix);
      }
      const end = bo.pts.length - 2; lightAt(X(bo.pts[end]), Y(bo.pts[end + 1]), 1.5, '#fff0b0', 10 * a, 16);
    }
    if (L.bolts.length > lastBolts && L.flashT > 0) flashT = 1;
    lastBolts = L.bolts.length;
    for (const k in I) { I[k].instanceMatrix.needsUpdate = true; if (I[k].instanceColor) I[k].instanceColor.needsUpdate = true; }

    // simulation particles → point sprites (bright ones glow additively, dark ones become smoke)
    for (const q of L.parts) {
      const c = rgb(q.c), a = Math.min(1, q.life / q.max * 1.5), mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
      if (mx < 0.45 && mx - mn < 0.6 * mx) pPush(PS, X(q.x), Y(q.y), 0.3, c.r * 2, c.g * 2, c.b * 2, a * 0.8, 0.35 + q.s * 0.08);
      else pPush(PA, X(q.x), Y(q.y), 0.35, c.r * 2.2, c.g * 2.2, c.b * 2.2, a, 0.16 + q.s * 0.07);
    }
    return cx;
  }

  const bx = x => (x - 240) * U, bz = z => -z * 0.3, by = h => h * U;
  function renderBase(V, t) {
    const L = V.Lv, B = L.base || {}, G = V.G;
    viewCY = 4;
    const tn = Math.tan(THREE.MathUtils.degToRad(29)), d = Math.max(13.5, 31 / (2 * tn * camera.aspect));
    const adv = B.phase === 'advance' ? Math.min(1, B.t / 90) : 0, sh = L.shake * 0.05;
    camPos.set((Math.random() - 0.5) * sh, 5.4 + (Math.random() - 0.5) * sh, d - adv * 26); camLook.set(0, 2.8, -14 - adv * 26);
    camera.position.copy(camPos); camera.lookAt(camLook);
    baseFade = adv > 0.55 ? (adv - 0.55) / 0.45 : B.phase === 'fight' && B.t < 24 ? 1 - B.t / 24 : B.phase === 'boss' && B.t < 24 ? 1 - B.t / 24 : 0;
    if (corridor) corridor.barrier.visible = !!B.barrierOn;

    G.players.forEach((pr, i) => {
      const p = L.players[i]; if (!p) return;
      const c = PCOL[pr.num];
      if (p.ghost) {
        const g = take(`spirit_${pr.num}_${p.ci}`, () => MODELS.hero(p.ci, ghostMat(c)));
        g.position.set(bx(p.gx), 2.2 + Math.sin(t * 0.1) * 0.1, 0.5); g.scale.set(1.2, 1.2, 1.2); g.rotation.set(0, Math.PI / 2, 0);
        g.userData.animate({ running: false, onGround: false, crouch: false, dash: false, aim: 0.3, t, flash: 0 });
        const ring = take('revive', () => new THREE.Mesh(progressRing(1), basic('#ffffff', 2)));
        ring.geometry = progressRing(p.reviveT / 100); ring.material.color.copy(hot(c, 2.5)); ring.position.set(bx(p.gx), 4.6, 0.5);
        return;
      }
      if (p.dead || (p.invuln > 0 && Math.floor(t / 3) % 2 && p.invuln < 140)) return;
      const m = take('hero_' + p.ci, () => MODELS.hero(p.ci));
      m.position.set(bx(p.x + 5), by(p.jz), 0); m.scale.set(1.25, 1.25, 1.25); m.rotation.set(0, Math.PI / 2 - p.aimX * 0.35, 0);
      m.userData.animate({ running: p.jz <= 0 && Math.abs(p.vx) > 0.3, phase: p.anim * 0.42, onGround: p.jz <= 0, crouch: p.crouch, dash: p.dashT > 0, aim: 0.1, t, flash: p.flash, hit: 0 });
      const fr = take('feet_' + pr.num, () => { const o = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 32), basic(c, 2.2, { add: true, op: 0.75 })); o.rotation.x = -Math.PI / 2; return o; });
      fr.position.set(m.position.x, 0.04, 0); fr.visible = true;
      if (G.players.length > 1) {
        const mk = take('marker_' + pr.num, () => { const o = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), basic(c, 2.5)); o.rotation.x = Math.PI; return o; });
        mk.position.set(m.position.x, m.position.y + (p.crouch ? 1.5 : 2.25), 0); mk.rotation.y = t * 0.05;
      }
      if (p.shieldT > 0 && !(p.shieldT < 90 && t % 6 < 3)) {
        const bub = take('bubble_' + pr.num, () => new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), basic('#5fd0ff', 1.6, { add: true, op: 0.2 })));
        bub.position.set(m.position.x, m.position.y + 1.0, 0); bub.scale.set(1.2, 1.45, 1.2);
      }
      if (p.flash > 0) lightAt(m.position.x, m.position.y + 1.6, -1, pr.weapon === 'L' ? '#5ff5d6' : '#ffd27a', 3, 6);
      if (p.drone) { const dr = take('buddy', () => MODELS.drone('#e9a02c', '#69d2ff', 0.6)); dr.position.set(bx(p.drone.x), by(40), 0.4); dr.rotation.set(0, Math.PI / 2, 0); dr.userData.animate({ vx: 0, flash: 0 }, t); }
    });
    for (const tr of L.trail) {
      const g = take('trail_' + tr.ci, () => MODELS.hero(tr.ci, ghostMat('#9fd8ff')));
      g.position.set(bx(tr.x), by(-tr.y || 0), -0.1); g.scale.set(1.25, 1.25, 1.25); g.rotation.set(0, Math.PI / 2, 0);
      g.userData.animate({ running: false, onGround: true, dash: true, aim: 0, t, flash: 0 });
    }

    for (const e of L.enemies) {
      if (e.type === 'bsol') {
        const m = take('bsol', () => MODELS.soldier()), moving = e.mode !== 'aim';
        m.userData.animate({ face: 1, vx: moving ? 1 : 0, anim: e.anim, stopT: moving ? 0 : 1, muzzle: e.muzzle, flash: e.flash }, t);
        m.position.set(bx(e.x), 0, bz(e.z)); m.scale.set(1.6, 1.6, 1.6);
        m.rotation.set(0, moving && e.mode !== 'charge' ? (e.face > 0 ? -0.2 : Math.PI + 0.2) : -Math.PI / 2, 0);
        if (e.muzzle > 0) lightAt(bx(e.x), 1.4, bz(e.z) + 0.8, '#ff6070', 2, 5);
      } else if (e.type === 'broll') {
        const m = take('roller', MODELS.roller); m.position.set(bx(e.x), 0, bz(e.z)); m.userData.animate(e, t);
      }
    }
    let lit = 0;
    for (const c of B.cores || []) {
      const m = take('wcore', makeWallCore); m.position.set(bx(c.x), by(48), -30.4); m.userData.set(c.alive, c.flash, t);
      if (c.alive && lit++ < 2) lightAt(bx(c.x), by(48), -29, '#38e0ff', 1.5, 6);
    }
    if (B.main) {
      const open = (B.cores || []).every(c => !c.alive) ? 1 : 0;
      const m = take('mcore', makeMainCore); m.position.set(0, by(40), -30.2);
      m.userData.cur = (m.userData.cur || 0) + (open - (m.userData.cur || 0)) * 0.08;
      m.userData.set(B.main.alive, m.userData.cur, B.main.flash, t);
      if (B.main.alive && open) lightAt(0, by(40), -28.5, '#ff6a2a', 4, 10);
    }
    for (const tr of B.turrets || []) {
      if (!tr.alive) continue;
      const m = take('wturret', MODELS.turret); m.position.set(bx(tr.x), by(tr.h) - 0.5, -30.2); m.scale.setScalar(1.3);
      m.userData.animate({ ang: 0.35, fireT: tr.fireT, flash: tr.flash }, t); m.rotation.set(0, -Math.PI / 2, 0);
    }
    const gb = L.boss;
    if (gb && gb.type === 'gate') {
      const m = take('gate', makeGate); m.position.set(0, 0, -30.4); m.userData.set(gb, t);
      if (gb.open > 0.5) lightAt(0, 3, -28, '#ff3b4f', 5 * gb.open, 12);
      if (!gb.alive) lightAt((Math.random() - 0.5) * 20, 3 + Math.random() * 5, -27, '#ffb43d', 8, 18);
    }
    for (const it of L.items) { const m = take('power_' + it.kind, () => MODELS.power(it.kind)); m.position.set(bx(it.x), 0.3, bz(it.z || 12)); m.scale.setScalar(1.5); m.userData.animate(it, t); }

    for (const k in I) I[k].count = 0;
    for (const q of L.pB) {
      const z = q.z || 0, h = q.kind === 'B' ? 14 + Math.sin(Math.min(1, z / 62) * Math.PI) * 40 : 14 + z * 0.36;
      const x = bx(q.x), y = by(h), wz = bz(z);
      if (q.kind === 'L') {
        dummy.position.set(x, y, wz + 0.6); dummy.rotation.set(0, Math.atan2((q.vz || 4) * 0.3, (q.vx || 0) * U), 0); dummy.scale.set(1.6, 0.14, 0.14); dummy.updateMatrix(); I.L.setMatrixAt(I.L.count++, dummy.matrix);
      } else if (q.kind === 'F') putSphere(I.F, x, y, wz, 0.15 + (16 - (q.life || 14)) * 0.05);
      else if (q.kind === 'B') { putSphere(I.B, x, y, wz, 0.24); if (t % 8 < 4) putSphere(I.bombLight, x, y + 0.2, wz, 0.07); }
      else putSphere(I[q.kind] || I.P, x, y, wz, q.kind === 'D' ? 0.12 : 0.18);
    }
    let fl = 0;
    for (const q of L.eB) {
      const x = bx(q.x), y = by(q.h || 16), z = bz(q.z || 0);
      if (q.kind === 'fire') { putSphere(I.fire, x, y, z, 0.38); putSphere(I.fireHalo, x, y, z, 0.75); if (fl++ < 2) lightAt(x, y, z, '#ff6a2a', 1.6, 4); }
      else { putSphere(I.dot, x, y, z, 0.2); putSphere(I.dotHalo, x, y, z, 0.42); }
    }
    const now = new Set();
    for (const rg of L.rings) {
      const k = 1 - rg.life / rg.max, x = bx(rg.x), y = by(-rg.y), z = bz(rg.z || 0), sc = rg.r * U * 1.3;
      const key = `${Math.round(rg.x)}:${Math.round(rg.y)}:${Math.round(rg.z || 0)}`; now.add(key);
      if (!seenRings.has(key)) fxExplosion(x, y, sc * 1.4, z);
      if (k < 0.45) {
        const f = 1 - k / 0.45, c = new THREE.Color().setRGB(3 * f + 0.6, (2.2 * f + 0.3) * f, 0.6 * f * f);
        dummy.position.set(x, y, z + 0.3); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(sc * (0.6 + k * 2.2)); dummy.updateMatrix();
        I.ball.setMatrixAt(I.ball.count, dummy.matrix); I.ball.setColorAt(I.ball.count++, c);
        lightAt(x, y, z + 1, '#ffa040', 7 * f, 10);
      }
    }
    seenRings = now;
    for (const bo of L.bolts) {
      const P3 = bo.p3; if (!P3) continue;
      const a = Math.min(1, bo.life / 8), th = bo.small ? 0.09 : 0.18;
      let px = bx(P3[0]), py = by(P3[1]), pz = bz(P3[2]);
      for (let i = 3; i < P3.length; i += 3) {
        const tx = bx(P3[i]), ty = by(P3[i + 1]), tz = bz(P3[i + 2]);
        for (let k = 1; k <= 4; k++) {
          const f = k / 4, jx = k < 4 ? (Math.random() - 0.5) * 0.6 : 0, jy = k < 4 ? (Math.random() - 0.5) * 0.6 : 0;
          const nx = px + (tx - px) * f + jx, ny = py + (ty - py) * f + jy, nz = pz + (tz - pz) * f;
          const ox = I.__lx ?? px, oy = I.__ly ?? py, oz = I.__lz ?? pz;
          tmpP.set(nx - ox, ny - oy, nz - oz); const len = tmpP.length() || 0.01;
          dummy.position.set((nx + ox) / 2, (ny + oy) / 2, (nz + oz) / 2); dummy.quaternion.setFromUnitVectors(UP, tmpP.divideScalar(len));
          dummy.scale.set(th * a * 2, len, th * a * 2); dummy.updateMatrix(); I.boltOut.setMatrixAt(I.boltOut.count++, dummy.matrix);
          dummy.scale.set(th * 0.6, len, th * 0.6); dummy.updateMatrix(); I.boltIn.setMatrixAt(I.boltIn.count++, dummy.matrix);
          I.__lx = nx; I.__ly = ny; I.__lz = nz;
        }
        px = tx; py = ty; pz = tz;
      }
      delete I.__lx; delete I.__ly; delete I.__lz;
      lightAt(px, py, pz, '#fff0b0', 8 * a, 14);
    }
    for (const k in I) { if (I[k].instanceMatrix) { I[k].instanceMatrix.needsUpdate = true; if (I[k].instanceColor) I[k].instanceColor.needsUpdate = true; } }
    for (const q of L.parts) {
      const c = rgb(q.c), a = Math.min(1, q.life / q.max * 1.5), mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
      const x = bx(q.x), y = by(-q.y), z = bz(q.z || 0);
      if (mx < 0.45 && mx - mn < 0.6 * mx) pPush(PS, x, y, z, c.r * 2, c.g * 2, c.b * 2, a * 0.8, 0.45 + q.s * 0.1);
      else pPush(PA, x, y, z, c.r * 2.2, c.g * 2.2, c.b * 2.2, a, 0.2 + q.s * 0.08);
    }
    return 0;
  }
  const UP = new THREE.Vector3(0, 1, 0);
  let viewCY = 8, baseFade = 0, baseMode = false;

  function renderShowcase(V, t) {
    viewCY = 8;
    const st = V.state, tn = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const span = st === 'select' ? 26 : 19, D = Math.max(12, span / (2 * tn * camera.aspect));
    if (st === 'select') {
      camPos.set(15, 7.6 + D * 0.08, D); camLook.set(15, 6.4, 0);
      camera.position.copy(camPos); camera.lookAt(camLook);
      for (let i = 0; i < 4; i++) {
        const xw = screenToPlaneX((i + 0.5) / 4, 0.42);
        const ped = take('ped_' + i, () => MODELS.pedestal(PCOL[i]));
        ped.position.set(xw, 5, 0.5);
        const l = V.lobby[i];
        ped.userData.ring.material.color.copy(hot(l ? PCOL[i] : '#4a4466', l ? (l.ready ? 3.5 : 2) : 1));
        ped.userData.beam.visible = !!(l && l.ready);
        if (l) {
          const m = take('hero_' + l.ci, () => MODELS.hero(l.ci));
          m.position.set(xw, 5.5, 0.5); m.scale.setScalar(2.1);
          m.rotation.y = l.ready ? -0.3 : Math.sin(t * 0.02 + i) * 0.6 - 0.2; m.scale.x = 2.1;
          m.userData.animate({ running: false, phase: 0, onGround: true, crouch: false, dash: false, aim: l.ready ? 1.2 : 0, t, flash: l.ready && t % 24 < 4 ? 4 : 0 });
          if (l.ready) lightAt(xw, 7.5, 2, PCOL[i], 4, 8);
        }
      }
    } else {
      const sway = Math.sin(t * 0.004) * 4;
      camPos.set(15 + sway, 6.2 + D * 0.1, D); camLook.set(15 + sway * 0.6, 7.6, 0);
      camera.position.copy(camPos); camera.lookAt(camLook);
      const heroes = st === 'victory' && V.G ? V.G.players.map(p => p.ci) : CHARS.map((c, i) => i);
      heroes.forEach((ci, i) => {
        const n = heroes.length, x = 15 + (i - (n - 1) / 2) * 2.4;
        const jump = st === 'victory' ? Math.abs(Math.sin(t * 0.08 + i)) * 1.0 : 0;
        const m = take('hero_' + ci + (i > 2 ? '_' + i : ''), () => MODELS.hero(ci));
        m.position.set(x, 5 + jump, 0.5);
        MODELS.face(m, i < n / 2 ? 1 : -1, 0.6); m.scale.y = m.scale.z = 1.25; m.scale.x *= 1.25;
        const f = (t + i * 20) % 50 < 4 ? 4 : 0;
        m.userData.animate({ running: false, phase: 0, onGround: jump < 0.05, crouch: false, dash: false, aim: i === 1 ? 1.1 : 0.15, t, flash: f });
        if (f) lightAt(x + (i < n / 2 ? 2 : -2), 7.2, 1.5, '#ffd27a', 4, 7);
      });
    }
    return camLook.x;
  }
  const ray = new THREE.Raycaster(), plane0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5), hit = new THREE.Vector3();
  function screenToPlaneX(fx, fy) {
    camera.updateMatrixWorld();
    ray.setFromCamera({ x: fx * 2 - 1, y: -(fy * 2 - 1) }, camera);
    return ray.ray.intersectPlane(plane0, hit) ? hit.x : 15;
  }

  function updateAmbient(cx, dt, cy = 8) {
    const th = env.theme;
    // rain (harbor)
    rain.visible = th === 'harbor';
    if (rain.visible) {
      const arr = rain.geometry.attributes.position.array, D = rain.userData.drops;
      for (let i = 0; i < D.length; i++) {
        const d = D[i]; d.y -= 0.9 * dt; d.x -= 0.15 * dt;
        if (d.y < cy - 6.5) { d.y = cy + 16 + Math.random() * 4; d.x = cx - 32 + Math.random() * 64; d.z = Math.random() * 16 - 10; }
        if (d.x < cx - 34) d.x += 68; else if (d.x > cx + 34) d.x -= 68;
        arr.set([d.x, d.y, d.z, d.x + 0.12, d.y + 0.7, d.z], i * 6);
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
    streaks.visible = th === 'sky';
    if (streaks.visible) {
      const arr = streaks.geometry.attributes.position.array, S = streaks.userData.s;
      for (let i = 0; i < S.length; i++) {
        const s = S[i]; s.x -= s.v * dt;
        if (s.x < cx - 36) { s.x = cx + 36 + Math.random() * 10; s.y = cy - 7 + Math.random() * 20; }
        if (s.x > cx + 50) s.x = cx - 30;
        arr.set([s.x, s.y, s.z, s.x + s.l, s.y, s.z], i * 6);
      }
      streaks.geometry.attributes.position.needsUpdate = true;
    }
    if (th === 'forge') {
      for (let i = 0; i < 2; i++) fxPush({ x: cx - 30 + Math.random() * 60, y: 1.6, z: Math.random() * 14 - 10, vx: (Math.random() - 0.5) * 0.01, vy: 0.03 + Math.random() * 0.04, vz: 0, life: 200, max: 200, size: 0.1, c: [3, 1.1, 0.2], a: 1, wob: Math.random() * 6 });
      for (const e of smokeEmitters) if (Math.abs(e.x - cx) < 120 && Math.random() < e.rate * dt) fxPush({ x: e.x + (Math.random() - 0.5), y: e.y, z: e.z, vx: 0.01 + Math.random() * 0.02, vy: 0.04 + Math.random() * 0.03, vz: 0, life: 260, max: 260, size: e.big ? 6 : 1.6, grow: e.big ? 0.06 : 0.02, smoke: true, c: [0.1, 0.06, 0.06], a: 0.55 });
    } else if (th === 'falls') {
      if (Math.random() < 0.7 * dt) fxPush({ x: 5 + Math.random() * 20, y: cy - 8 + Math.random() * 18, z: -4.6, vx: (Math.random() - 0.5) * 0.02, vy: -0.03, vz: 0.01, life: 120, max: 120, size: 1.4 + Math.random() * 1.4, grow: 0.02, smoke: true, c: [0.9, 1, 1], a: 0.16 });
      if (Math.random() < 0.15 * dt) fxPush({ x: cx - 20 + Math.random() * 40, y: cy + 10, z: Math.random() * 6 - 3, vx: 0.02, vy: -0.025, vz: 0, life: 500, max: 500, size: 0.12, smoke: true, c: [0.4, 0.8, 0.3], a: 0.9, wob: Math.random() * 6 });
    } else if (th === 'ice') {
      for (let i = 0; i < 2; i++) if (Math.random() < 0.9 * dt) fxPush({ x: cx - 32 + Math.random() * 64, y: 20, z: Math.random() * 16 - 10, vx: -0.01 - Math.random() * 0.02, vy: -0.03 - Math.random() * 0.03, vz: 0, life: 520, max: 520, size: 0.1 + Math.random() * 0.08, smoke: true, c: [1, 1, 1.05], a: 0.9, wob: Math.random() * 6 });
    } else if (th === 'moon' && Math.random() < 0.2 * dt) {
      fxPush({ x: cx - 30 + Math.random() * 60, y: Math.random() * 18, z: Math.random() * 12 - 8, vx: (Math.random() - 0.5) * 0.01, vy: 0.003, vz: 0, life: 400, max: 400, size: 0.06, c: [0.7, 0.75, 1.4], a: 0.7 });
    } else if (th === 'sky' && Math.random() < 0.5 * dt) {
      fxPush({ x: cx + 30, y: 4 + Math.random() * 14, z: Math.random() * 10 - 6, vx: -0.05 - Math.random() * 0.05, vy: -0.01, vz: 0, life: 600, max: 600, size: 0.14, smoke: true, c: [1, 0.55, 0.7], a: 0.95, wob: Math.random() * 6 });
    } else if (th === 'harbor' && Math.random() < 0.15 * dt) {
      fxPush({ x: cx - 30 + Math.random() * 60, y: 1.6, z: -2 - Math.random() * 30, vx: 0, vy: 0.002, vz: 0, life: 90, max: 90, size: 3, grow: 0.03, smoke: true, c: [0.35, 0.3, 0.6], a: 0.12 });
    }
  }

  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.vy -= (f.g || 0) * dt; f.x += (f.vx + (f.wob !== undefined ? Math.sin(time * 0.05 + f.wob) * 0.01 : 0)) * dt; f.y += f.vy * dt; f.z += (f.vz || 0) * dt;
      if (f.g && f.y < 1.6 && f.vy < 0) { f.vy *= -0.35; f.vx *= 0.6; }
      f.size += (f.grow || 0) * dt; f.life -= dt;
      if (f.life <= 0) { fx.splice(i, 1); continue; }
      const k = f.life / f.max, a = f.a * (f.smoke ? Math.min(1, k * 2) * Math.min(1, (1 - k) * 8 + 0.2) : Math.min(1, k * 2));
      pPush(f.smoke ? PS : PA, f.x, f.y, f.z, f.c[0], f.c[1], f.c[2], a, f.size);
    }
  }

  function applyLights() {
    lightReq.sort((a, b) => b.intensity - a.intensity);
    for (let i = 0; i < LIGHTS; i++) {
      const l = lights[i], r = lightReq[i];
      if (!r) { l.intensity = 0; continue; }
      l.position.set(r.x, r.y, r.z); l.color.set(r.c); l.intensity = r.intensity; l.distance = r.dist;
    }
    lightReq.length = 0;
  }

  function render(V, dtMs) {
    const dt = Math.min(3, dtMs / (1000 / 60));
    time += dt;
    const t = V.Lv && V.G && V.state !== 'title' && V.state !== 'select' && V.state !== 'victory' ? V.Lv.t : Math.floor(time);
    // choose the world to show
    if (V.state === 'title' || V.state === 'select' || !V.Lv || !V.G) ensureEnv('show_harbor', 'harbor', null, true);
    else if (V.state === 'victory') ensureEnv('show_sky', 'sky', null, true);
    else ensureEnv('L' + V.Lv.i, LEVELS[V.Lv.i].theme, LEVELS[V.Lv.i], false);

    poolsBegin(); pBegin(PA); pBegin(PS);
    for (const k in I) I[k].count = 0;
    const inLevel = envKey[0] === 'L';
    baseMode = inLevel && V.Lv.mode === 'base';
    const wantFov = baseMode ? 58 : 36;
    if (camera.fov !== wantFov) { camera.fov = wantFov; camera.updateProjectionMatrix(); }
    if (!baseMode) baseFade = 0;
    const cx = baseMode ? renderBase(V, t) : inLevel ? renderLevel(V, t) : renderShowcase(V, t);
    const cy = viewCY;
    poolsEnd();
    for (const k in I) I[k].instanceMatrix.needsUpdate = true;
    for (const a of env.anim) a();
    env.celestial.position.x = camera.position.x * 0.92;
    updateAmbient(cx, dt, cy);
    updateFx(dt);
    pEnd(PA); pEnd(PS);

    // shadows follow the view
    const d = sun.userData.dir || new THREE.Vector3(0, 1, 0.5);
    sun.target.position.set(cx, cy, baseMode ? -12 : 0); sun.position.set(cx + d.x * 50, cy + d.y * 50, d.z * 50);
    under.target.position.set(cx, cy, 0); under.position.set(cx, cy - 28, 20);
    applyLights();

    const storm = inLevel && V.Lv.stormT > 0;
    flashT = Math.max(0, flashT - 0.06 * dt);
    grade.uniforms.uFlash.value = inLevel && V.Lv.flashT > 0 ? V.Lv.flashT / 12 * (env.theme === 'sky' ? 0.25 : 0.45) : flashT * 0.25;
    grade.uniforms.uT.value = time;
    grade.uniforms.uFade.value = baseFade;
    const hurt = inLevel && V.Lv.players.some(p => p.invuln > 80 && p.invuln < 92);
    grade.uniforms.uDamage.value = hurt ? 0.6 : Math.max(0, grade.uniforms.uDamage.value - 0.05 * dt);
    bloom.strength = bloomBase * (quality === 'high' ? 1 : 0.75) + (storm ? 0.2 : 0);
    composer.render();
  }

  const pv = new THREE.Vector3();
  function project(simX, simY, z = 0, depth) {
    if (baseMode) pv.set(bx(simX), -simY * U, bz(depth || 0)).project(camera);
    else pv.set(X(simX), Y(simY), z).project(camera);
    return { x: (pv.x + 1) / 2 * cssW, y: (1 - pv.y) / 2 * cssH };
  }

  return { init, render, project, setQuality, get quality() { return quality; } };
})();
