// Vendors the panel's four faces out of Google Fonts and into the bundle.
//
// The panel is served behind a CSP of `style-src 'self'` / `font-src 'self'`,
// so a <link> to fonts.googleapis.com is blocked before a byte arrives and
// every face silently falls back to a system one. Self-hosting is the fix:
// same-origin CSS, same-origin woff2, no CSP hole, no third-party hop.
//
// 1. Ask Google for the same css2 stylesheet the panel used to link, with a
//    browser UA so the answer is woff2 with unicode-range subsets.
// 2. Download each subset into src/assets/fonts/ under a readable name.
// 3. Re-emit the stylesheet verbatim to src/styles/fonts.css with the remote
//    URLs swapped for local ones — the subset comments and unicode-ranges are
//    Google's, untouched, so a latin reader still fetches only latin.
//
// Vite fingerprints the woff2 into dist/assets/, where the admin mount serves
// them immutable for a year.
//
// Deterministic: same families in → same files out. Run with `npm run fonts`.
// All four families are OFL-1.1 (google/fonts ofl/{archivo,spacegrotesk,
// merriweather,googlesanscode}), which is what makes vendoring them legal.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The single source of truth for what the panel loads. Archivo and Space
// Grotesk are the UI faces; Merriweather (prose) and Google Sans Code
// (markdown source) are the editor's two.
const FAMILIES = [
  'Space Grotesk:wght@400;500;600;700',
  'Archivo:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600',
  'Merriweather:ital,opsz,wght@0,18..144,300..800;1,18..144,300..800',
  'Google Sans Code:ital,wght@0,300..700;1,300..700',
];

// css2 serves woff2 only to a UA it recognises as modern; the default fetch UA
// gets ttf, which is several times the bytes.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/16.0 Safari/605.1.15';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = resolve(ROOT, 'src/assets/fonts');
const CSS_FILE = resolve(ROOT, 'src/styles/fonts.css');

const url =
  'https://fonts.googleapis.com/css2?' +
  FAMILIES.map((f) => `family=${encodeURIComponent(f)}`).join('&') +
  '&display=swap';

const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } }).catch((e) => {
  console.error(`✗ Could not reach Google Fonts.\n  ${e.message}`);
  process.exit(1);
});
if (!res.ok) {
  console.error(`✗ css2 returned ${res.status} ${res.statusText}`);
  process.exit(1);
}
let css = await res.text();

// Each face arrives as `/* subset */ @font-face { ... }`. The comment is the
// only place the subset name appears, so it is also how the file gets named.
const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)];
if (!blocks.length) {
  console.error('✗ css2 returned no @font-face blocks — did the response shape change?');
  process.exit(1);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const field = (body, name) => body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

// Group by URL, not by block. A variable family asked for at several discrete
// weights comes back as one file declared under several @font-face weights —
// downloading per block would ship the same bytes five times over.
const byUrl = new Map();
for (const [, subset, body] of blocks) {
  const family = field(body, 'font-family')?.replace(/['"]/g, '');
  const style = field(body, 'font-style');
  const weight = field(body, 'font-weight');
  const remote = body.match(/url\(([^)]+)\)/)?.[1].replace(/['"]/g, '');
  if (!family || !style || !weight || !remote) {
    console.error(`✗ Could not read a @font-face block:\n${body}`);
    process.exit(1);
  }
  const face = byUrl.get(remote) ?? { family, style, subset, weights: new Set() };
  if (face.family !== family || face.style !== style || face.subset !== subset) {
    console.error(`✗ ${remote} is shared by two unrelated faces — the naming is ambiguous.`);
    process.exit(1);
  }
  // `300 800` is a variable range, not a typo, and so is a file serving 400
  // through 800: both collapse to the same min-max in the filename.
  for (const w of weight.split(/\s+/)) face.weights.add(Number(w));
  byUrl.set(remote, face);
}

const wanted = new Map();
for (const [remote, { family, style, subset, weights }] of byUrl) {
  const range = [...weights].sort((a, b) => a - b);
  const span = range.length > 1 ? `${range[0]}-${range.at(-1)}` : `${range[0]}`;
  const name = `${slug(family)}-${slug(style)}-${span}-${slug(subset)}.woff2`;
  if (wanted.has(name)) {
    console.error(`✗ Two different files both want ${name} — the naming is ambiguous.`);
    process.exit(1);
  }
  wanted.set(name, remote);
}

// Drop anything a previous run left behind before writing, so a family removed
// from FAMILIES stops shipping instead of lingering unreferenced in the bundle.
mkdirSync(FONT_DIR, { recursive: true });
for (const stale of readdirSync(FONT_DIR)) {
  if (stale.endsWith('.woff2') && !wanted.has(stale)) rmSync(resolve(FONT_DIR, stale));
}

let bytes = 0;
for (const [name, remote] of wanted) {
  const font = await fetch(remote, { headers: { 'User-Agent': USER_AGENT } });
  if (!font.ok) {
    console.error(`✗ ${remote} returned ${font.status} ${font.statusText}`);
    process.exit(1);
  }
  const buf = Buffer.from(await font.arrayBuffer());
  writeFileSync(resolve(FONT_DIR, name), buf);
  bytes += buf.length;
  // Relative on purpose: the panel is mounted under a path prefix the build
  // cannot know, so an absolute /assets URL would 404 everywhere but the root.
  css = css.replaceAll(remote, `../assets/fonts/${name}`);
}

if (css.includes('fonts.gstatic.com')) {
  console.error('✗ A remote font URL survived the rewrite — refusing to write a half-local sheet.');
  process.exit(1);
}

const header =
  '/* Generated by scripts/vendor-fonts.mjs — do not edit.\n' +
  ' *\n' +
  ' * The panel self-hosts its faces: a CSP of font-src \'self\' blocks Google\'s\n' +
  ' * CDN outright. Re-run `npm run fonts` to change or update a family; the\n' +
  ' * family list lives in that script.\n' +
  ' *\n' +
  ' * Space Grotesk, Archivo, Merriweather and Google Sans Code are OFL-1.1.\n' +
  ' */\n';
writeFileSync(CSS_FILE, header + css);

console.log(`✓ Wrote ${wanted.size} woff2 (${(bytes / 1024 / 1024).toFixed(1)} MB) to ${FONT_DIR}`);
console.log(`✓ Wrote ${CSS_FILE}`);
