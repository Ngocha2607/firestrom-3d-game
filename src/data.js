// data.js — shared constants: simulation screen size, heroes, weapons, player colours
'use strict';
const W = 480, H = 272, T = 16, ROWS = 17;

// perks: hp (hits per life), dj (double jump), drone (support drone), dmgMul (shot damage),
// shotSpeed (bullet speed), dashHit (dash damages enemies), dashCd (frames between dashes)
const CHARS = [
  { id: 'rex', name: 'REX', title: 'Thiết Giáp', role: 'Lính hạng nặng',
    desc: 'Giáp dày, chịu được 2 phát bắn mỗi mạng.', speed: 1.9, hp: 2, stats: [3, 5, 2],
    pal: { main: '#d2483a', dark: '#5e1c1a', light: '#ff8a6a', visor: '#ffd23f', trim: '#2a2632' } },
  { id: 'linh', name: 'LINH', title: 'Phong Vân', role: 'Trinh sát',
    desc: 'Chạy nhanh nhất đội, nhảy được hai lần trên không.', speed: 2.35, hp: 1, dj: true, stats: [5, 2, 3],
    pal: { main: '#25b8a5', dark: '#0f4f4a', light: '#86f2df', visor: '#cdf6ff', trim: '#1f2733', scarf: '#ff4f86' } },
  { id: 'tobi', name: 'TOBI', title: 'Kỹ Sư', role: 'Kỹ sư chiến trường',
    desc: 'Đi kèm drone hỗ trợ tự bắn kẻ địch gần nhất.', speed: 2.05, hp: 1, drone: true, stats: [4, 2, 5],
    pal: { main: '#e9a02c', dark: '#6b4310', light: '#ffd88a', visor: '#69d2ff', trim: '#2b2a30' } },
  { id: 'mai', name: 'MAI', title: 'Lưu Tinh', role: 'Xạ thủ',
    desc: 'Mọi phát bắn mạnh hơn 40%, đạn bay nhanh hơn.', speed: 1.95, hp: 1, dmgMul: 1.4, shotSpeed: 1.2, stats: [3, 2, 5],
    pal: { main: '#8a5cf0', dark: '#33205f', light: '#cbb4ff', visor: '#ff6ad5', trim: '#221d30', hair: '#2a1838' } },
  { id: 'bao', name: 'BẢO', title: 'Ảnh Phong', role: 'Ninja',
    desc: 'Lướt xuyên kẻ địch gây sát thương, hồi lướt rất nhanh.', speed: 2.2, hp: 1, dashHit: true, dashCd: 22, stats: [5, 2, 4],
    pal: { main: '#2f3a5c', dark: '#141a2c', light: '#6a7cae', visor: '#ff3b4f', trim: '#0e1018', scarf: '#e8323c' } },
];

const PCOL = ['#ff6a3d', '#38d6b4', '#ffd23f', '#c18af0'];

// weapon pickups (letter on the capsule → name, HUD colour)
const WEAPONS = {
  P: { name: 'Xung kích', col: '#ffd23f' },
  S: { name: 'Đạn tỏa', col: '#ff6a3d' },
  L: { name: 'Laser', col: '#38d6b4' },
  H: { name: 'Tên lửa', col: '#c18af0' },
  F: { name: 'Súng lửa', col: '#ff8a2a' },
  B: { name: 'Bom chùm', col: '#9ad04a' },
  T: { name: 'Sấm sét', col: '#7ab8ff' },
  R: { name: 'Bắn nhanh', col: '#ffd23f' },
};

// difficulty presets chosen in the lobby. eFire: multiplier on enemy shot intervals (higher = fewer shots),
// eSpeed: enemy bullet speed, boss: boss HP, spawn: extra-soldier interval, score: score multiplier
const DIFFS = [
  { id: 'easy', name: 'Dễ', desc: '5 mạng, mọi nhân vật có thêm 1 lớp giáp, địch bắn thưa và chậm hơn.', lives: 5, hpBonus: 1, eFire: 1.45, eSpeed: 0.8, boss: 0.75, spawn: 1.4, score: 0.75 },
  { id: 'normal', name: 'Thường', desc: '3 mạng. Độ khó cân bằng như thiết kế gốc.', lives: 3, hpBonus: 0, eFire: 1, eSpeed: 1, boss: 1, spawn: 1, score: 1 },
  { id: 'hard', name: 'Khó', desc: '2 mạng, địch bắn dày và nhanh hơn, trùm trâu hơn. Điểm ×1.5.', lives: 2, hpBonus: 0, eFire: 0.7, eSpeed: 1.25, boss: 1.35, spawn: 0.7, score: 1.5 },
];

// support items (dropped by supply capsules and, rarely, by defeated enemies)
const SUPPORT = {
  A: { name: 'Giáp +1', col: '#ffd23f' },
  Z: { name: 'Khiên năng lượng', col: '#5fd0ff' },
  M: { name: '+1 Mạng', col: '#ff4f86' },
  E: { name: 'Pin Bão Lửa', col: '#ff8a2a' },
};
