// audio.js — synthesized sound effects and a tiny step sequencer (WebAudio, no asset files)
'use strict';
const SFX = (() => {
  let ac = null, master = null, muted = false;
  let seqTimer = null, step = 0, song = null, wanted = null;

  const SONGS = {
    title:  { tempo: 170, bass: [45,0,45,0,52,0,45,0, 43,0,43,0,50,0,48,0], lead: [69,0,0,72,0,0,76,0, 74,0,72,0,71,0,0,0] },
    harbor: { tempo: 125, bass: [40,0,40,52,0,40,43,0, 38,0,38,50,0,38,43,45], lead: [0,0,64,0,67,0,0,71, 0,0,69,0,67,0,64,0] },
    forge:  { tempo: 115, bass: [33,33,0,33,36,0,33,0, 31,31,0,31,34,0,36,0], lead: [0,0,0,0,57,0,60,0, 0,0,0,0,58,0,55,0] },
    sky:    { tempo: 130, bass: [45,0,52,0,45,0,55,0, 43,0,50,0,43,0,52,0], lead: [69,0,72,0,76,0,74,72, 67,0,71,0,74,0,72,71] },
    boss:   { tempo: 100, bass: [38,38,50,38,38,49,38,48, 38,38,50,38,41,40,39,38], lead: [0,0,0,0,62,0,0,0, 0,0,0,0,63,0,62,0] },
    win:    { tempo: 140, bass: [48,0,52,0,55,0,60,0, 53,0,57,0,60,0,65,0], lead: [72,0,76,0,79,0,84,0, 77,0,81,0,84,0,0,0] },
  };

  const midi = n => 440 * Math.pow(2, (n - 69) / 12);

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.22;
      master.connect(ac.destination);
      if (wanted) music(wanted);
    } catch (e) { ac = null; }
  }

  function tone(type, f1, f2, dur, vol = 1, delay = 0) {
    if (!ac || muted) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol = 1, freq = 1000) {
    if (!ac || muted) return;
    const len = Math.floor(ac.sampleRate * dur);
    const b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = b; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master); s.start();
  }

  function music(name) {
    wanted = name;
    if (seqTimer) { clearInterval(seqTimer); seqTimer = null; }
    song = SONGS[name];
    if (!ac || !song) return;
    step = 0;
    seqTimer = setInterval(() => {
      if (!muted) {
        const b = song.bass[step % song.bass.length], l = song.lead[step % song.lead.length];
        if (b) tone('triangle', midi(b), midi(b), song.tempo / 1000 * 1.1, 0.42);
        if (l) tone('square', midi(l), midi(l), song.tempo / 1000 * 0.8, 0.07);
        if (step % 4 === 0) noise(0.04, 0.18, 7000);
        if (step % 8 === 4) noise(0.09, 0.3, 1800);
      }
      step++;
    }, song.tempo);
  }

  // throttle very frequent sounds so rapid fire doesn't clip
  const last = {};
  const once = (k, ms, fn) => { const n = performance.now(); if (last[k] && n - last[k] < ms) return; last[k] = n; fn(); };

  return {
    init, music,
    toggle() { muted = !muted; return muted; },
    get muted() { return muted; },
    shoot:  () => once('shoot', 50, () => tone('square', 880, 420, 0.06, 0.25)),
    spread: () => tone('square', 620, 300, 0.08, 0.28),
    laser:  () => tone('sawtooth', 1500, 280, 0.14, 0.22),
    missile:() => noise(0.16, 0.35, 2400),
    jump:   () => tone('square', 300, 620, 0.1, 0.2),
    dash:   () => noise(0.14, 0.4, 5000),
    hit:    () => once('hit', 40, () => tone('square', 220, 110, 0.05, 0.22)),
    ting:   () => once('ting', 60, () => tone('triangle', 2200, 1800, 0.05, 0.15)),
    boom:   () => { noise(0.4, 0.8, 700); tone('sine', 130, 40, 0.35, 0.5); },
    bigBoom:() => { noise(1.1, 1, 450); tone('sine', 90, 28, 1.0, 0.8); },
    power:  () => [0, 0.07, 0.14].forEach((d, i) => tone('square', 520 + i * 260, 760 + i * 260, 0.08, 0.28, d)),
    hurt:   () => tone('sawtooth', 420, 60, 0.4, 0.45),
    select: () => tone('square', 620, 940, 0.06, 0.25),
    warn:   () => [0, 0.22].forEach(d => tone('sawtooth', 300, 300, 0.18, 0.25, d)),
    eshot:  () => once('eshot', 70, () => tone('triangle', 520, 240, 0.08, 0.18)),
  };
})();
