'use strict';
/**
 * Genera public/js/icons.js con un subconjunto de íconos de Lucide (licencia ISC).
 * Uso: npm install --no-save lucide-static && node scripts/build-icons.js
 *      (o indica otra carpeta de íconos: node scripts/build-icons.js /ruta/a/lucide-static/icons)
 */
const fs = require('node:fs');
const path = require('node:path');

const NAMES = `house calendar calendar-days calendar-plus calendar-check folder-kanban folder-plus list-checks list-todo
square-check-big square circle circle-check settings mic mic-off send volume-2 volume-x plus x check trash-2 pencil
clock map-pin bell bell-ring repeat chevron-left chevron-right chevron-down search sparkles bot brain-circuit zap flag
target notebook-pen sticky-note play log-out lock key-round download upload refresh-cw triangle-alert info
message-square menu arrow-left grip-vertical radio user timer activity layout-grid list columns-3 eye eye-off shield
wifi-off external-link rotate-ccw message-circle-plus headphones hourglass circle-dot sunrise`.split(/\s+/).filter(Boolean);

const dir = process.argv[2] || path.join(__dirname, '..', 'node_modules', 'lucide-static', 'icons');
const out = {};
const missing = [];
for (const name of NAMES) {
  const file = path.join(dir, `${name}.svg`);
  if (!fs.existsSync(file)) { missing.push(name); continue; }
  out[name] = fs.readFileSync(file, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>[\s\S]*$/, '')
    .replace(/\s*\n\s*/g, '')
    .trim();
}
if (missing.length) console.warn('No encontrados:', missing.join(', '));
const header = '/* Íconos de Lucide (https://lucide.dev) — Licencia ISC. Generado por scripts/build-icons.js */\n';
const body = Object.entries(out).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
fs.writeFileSync(path.join(__dirname, '..', 'public', 'js', 'icons.js'), `${header}window.ICONS = {\n${body}\n};\n`);
console.log(`${Object.keys(out).length} íconos generados.`);
