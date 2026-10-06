// worker/build.js — copies the public files (index.html + src/) into dist/ for Cloudflare assets
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.cpSync(path.join(root, 'src'), path.join(out, 'src'), { recursive: true });
