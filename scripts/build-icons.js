'use strict';
/**
 * Genera public/js/icons.js con un subconjunto de íconos de Lucide (licencia ISC).
 * Uso: npm install --no-save lucide-static && node scripts/build-icons.js
 */
const fs = require('node:fs');
const path = require('node:path');

const NAMES = `layout-dashboard shopping-cart receipt package boxes clipboard-list truck users user contact wallet chart-column
settings log-out search plus minus trash-2 pencil printer x check circle-check triangle-alert circle-alert info barcode
scan-barcode tag tags percent credit-card banknote arrow-left-right landmark circle-pause circle-play rotate-ccw ban eye
download upload image refresh-cw chevron-left chevron-right chevron-down chevron-up arrow-left funnel calendar clock history
trending-up trending-down dollar-sign package-plus package-minus archive waves dumbbell shirt key-round lock save copy
ellipsis-vertical menu circle-x file-spreadsheet database store hand-coins coins list layout-grid star sparkles keyboard
user-plus circle-dollar-sign square-pen external-link maximize shield power warehouse scan-line inbox house
clipboard-check sliders-horizontal arrow-up-down circle-plus circle-minus calculator delete package-search
shopping-bag badge-percent file-text undo-2 lock-keyhole log-in hash ruler palette map-pin phone mail
eraser square-check-big square arrow-down arrow-up list-checks layers`.split(/\s+/).filter(Boolean);

const dir = path.join(__dirname, '..', 'node_modules', 'lucide-static', 'icons');
const out = {};
const missing = [];
for (const name of NAMES) {
  const file = path.join(dir, `${name}.svg`);
  if (!fs.existsSync(file)) { missing.push(name); continue; }
  const svg = fs.readFileSync(file, 'utf8');
  out[name] = svg
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
