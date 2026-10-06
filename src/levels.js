// levels.js — stage layouts.
// ground: [fromCol, toCol (exclusive), topRow]  — solid from topRow to the bottom of the screen
// plats:  [col, row, length]                     — one-way platforms (drop through with ↓ + jump)
// enemies: [kind, col, row?]  kinds: soldier | turret | hopper | drone (needs row) | geyser (sits in a gap)
// capsules: [col, weapon]  weapons: S spread, L laser, H homing, R rapid fire
// The last 30 columns of every stage are the boss arena; the camera locks there.
'use strict';
const LEVELS = [
  {
    name: 'CẢNG NEON', sub: 'Bến cảng chìm trong mưa đêm', theme: 'harbor', music: 'harbor', boss: 'crab', cols: 200,
    ground: [[0, 22, 13], [25, 40, 13], [40, 52, 11], [52, 60, 13], [63, 80, 13], [80, 90, 11], [90, 104, 13],
             [108, 124, 13], [124, 132, 11], [132, 140, 10], [143, 150, 12], [153, 200, 13]],
    plats: [[17, 10, 4], [30, 10, 4], [56, 9, 4], [70, 10, 5], [96, 9, 5], [114, 9, 4], [146, 9, 4], [160, 10, 4]],
    enemies: [
      ['soldier', 14], ['soldier', 36], ['soldier', 48], ['soldier', 66], ['soldier', 86], ['soldier', 100],
      ['soldier', 118], ['soldier', 130], ['soldier', 147], ['soldier', 160],
      ['turret', 33], ['turret', 46], ['turret', 84], ['turret', 112], ['turret', 135], ['turret', 165],
      ['drone', 44, 5], ['drone', 74, 4], ['drone', 98, 5], ['drone', 120, 4], ['drone', 138, 5], ['drone', 156, 4],
      ['hopper', 92], ['hopper', 128],
    ],
    capsules: [[16, 'S'], [64, 'L'], [106, 'H'], [150, 'R']],
  },
  {
    name: 'LÒ DUNG NHAM', sub: 'Xưởng đúc vũ khí dưới lòng núi lửa', theme: 'forge', music: 'forge', boss: 'core', cols: 210,
    ground: [[0, 20, 13], [23, 36, 13], [36, 44, 11], [48, 60, 13], [60, 70, 11], [73, 86, 11], [90, 100, 13],
             [100, 108, 11], [111, 122, 10], [126, 138, 12], [141, 150, 12], [150, 158, 10], [162, 210, 13]],
    plats: [[16, 10, 4], [44, 8, 4], [64, 7, 4], [86, 8, 4], [104, 7, 4], [122, 8, 4], [145, 8, 4], [168, 10, 5]],
    enemies: [
      ['geyser', 21], ['geyser', 46], ['geyser', 71], ['geyser', 88], ['geyser', 109], ['geyser', 124], ['geyser', 139], ['geyser', 160],
      ['soldier', 10], ['soldier', 28], ['soldier', 52], ['soldier', 64], ['soldier', 78], ['soldier', 94],
      ['soldier', 115], ['soldier', 130], ['soldier', 144], ['soldier', 170],
      ['turret', 40], ['turret', 66], ['turret', 104], ['turret', 133], ['turret', 153], ['turret', 175],
      ['hopper', 32], ['hopper', 56], ['hopper', 82], ['hopper', 96], ['hopper', 118], ['hopper', 146], ['hopper', 172],
      ['drone', 50, 4], ['drone', 92, 5], ['drone', 135, 4], ['drone', 165, 5],
    ],
    capsules: [[12, 'S'], [58, 'H'], [98, 'L'], [142, 'R']],
  },
  {
    name: 'THÀNH TRÊN MÂY', sub: 'Pháo đài lơ lửng giữa biển mây', theme: 'sky', music: 'sky', boss: 'serpent', cols: 220,
    ground: [[0, 18, 12], [21, 30, 11], [33, 42, 10], [46, 56, 12], [59, 66, 10], [69, 80, 11], [84, 96, 12],
             [99, 108, 10], [111, 120, 9], [124, 134, 11], [137, 150, 12], [153, 160, 10], [163, 172, 9],
             [176, 190, 11], [190, 220, 12]],
    plats: [[24, 7, 4], [50, 8, 4], [74, 7, 4], [88, 8, 4], [115, 6, 4], [128, 7, 4], [142, 8, 4], [180, 7, 4]],
    enemies: [
      ['drone', 25, 4], ['drone', 40, 3], ['drone', 55, 5], ['drone', 68, 4], ['drone', 85, 3], ['drone', 98, 5],
      ['drone', 110, 3], ['drone', 126, 4], ['drone', 140, 3], ['drone', 152, 5], ['drone', 166, 3], ['drone', 178, 4],
      ['soldier', 10], ['soldier', 26], ['soldier', 50], ['soldier', 75], ['soldier', 90], ['soldier', 104],
      ['soldier', 130], ['soldier', 145], ['soldier', 168], ['soldier', 184],
      ['turret', 38], ['turret', 64], ['turret', 116], ['turret', 158],
      ['hopper', 52], ['hopper', 92], ['hopper', 142],
    ],
    capsules: [[8, 'L'], [60, 'S'], [114, 'H'], [162, 'R']],
  },
];
