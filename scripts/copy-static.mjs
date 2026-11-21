// Zero-dependency staging script: copy the site's public files into ./public/
// so Wrangler can upload them as Workers Assets. Run after editing any site file:
//   node scripts/copy-static.mjs
// The allowlist is deliberate — never copy api/, scripts/ or root config into
// the public asset directory (those may contain secrets and server code).
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'public');

const FILES = [
  'index.html', 'index-inline.html',
  'player.html', 'player-inline.html',
  'messi.html', 'messi-inline.html',
  'ronaldo.html', 'ronaldo-inline.html',
  'about.html', 'faq.html', 'privacy.html', 'contact.html', 'tables.html',
  'style.css', 'ads.js', 'sw.js', 'hls.light.min.js',
  'manifest.webmanifest', 'matches.json', 'sitemap.xml', 'robots.txt', 'llms.txt',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'og-cover.png',
];

// Extra asset subdirectories (images only).
const IMAGE_DIRS = ['ads'];
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']);

let count = 0;
function copy(srcRel) {
  const src = join(root, srcRel);
  if (!existsSync(src) || !statSync(src).isFile()) throw new Error(`Missing static file: ${srcRel}`);
  const dest = join(out, srcRel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  count++;
}

mkdirSync(out, { recursive: true });
for (const f of FILES) copy(f);
for (const d of IMAGE_DIRS) {
  for (const f of readdirSync(join(root, d))) {
    if (IMAGE_EXT.has(f.slice(f.lastIndexOf('.')).toLowerCase())) copy(`${d}/${f}`);
  }
}
console.log(`Staged ${count} static files into public/`);
