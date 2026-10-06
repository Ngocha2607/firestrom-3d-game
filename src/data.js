// data.js — shared constants: simulation screen size, heroes, player colours
'use strict';
const W = 480, H = 272, T = 16, ROWS = 17;

const CHARS = [
  { id: 'rex', name: 'REX', title: 'Thiết Giáp', role: 'Lính hạng nặng',
    desc: 'Giáp dày, chịu được 2 phát bắn mỗi mạng.', speed: 1.9, hp: 2, dj: false, drone: false, stats: [3, 5, 2],
    pal: { main: '#d2483a', dark: '#5e1c1a', light: '#ff8a6a', visor: '#ffd23f', trim: '#2a2632' } },
  { id: 'linh', name: 'LINH', title: 'Phong Vân', role: 'Trinh sát',
    desc: 'Chạy nhanh nhất đội, nhảy được hai lần trên không.', speed: 2.35, hp: 1, dj: true, drone: false, stats: [5, 2, 3],
    pal: { main: '#25b8a5', dark: '#0f4f4a', light: '#86f2df', visor: '#cdf6ff', trim: '#1f2733', scarf: '#ff4f86' } },
  { id: 'tobi', name: 'TOBI', title: 'Kỹ Sư', role: 'Kỹ sư chiến trường',
    desc: 'Đi kèm drone hỗ trợ tự bắn kẻ địch gần nhất.', speed: 2.05, hp: 1, dj: false, drone: true, stats: [4, 2, 5],
    pal: { main: '#e9a02c', dark: '#6b4310', light: '#ffd88a', visor: '#69d2ff', trim: '#2b2a30' } },
];

const PCOL = ['#ff6a3d', '#38d6b4', '#ffd23f', '#c18af0'];
