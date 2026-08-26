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
// 4. Copy each family's OFL.txt out of google/fonts into public/fonts/, which
//    the build ships at the panel's root.
//
// Vite fingerprints the woff2 into dist/assets/, where the admin mount serves
// them immutable for a year.
//
// Deterministic: same families in → same files out. Run with `npm run fonts`.
// All four families are OFL-1.1, which is what makes vendoring them legal —
// and the licence says a copy must travel with the fonts, so step 4 is not
// bookkeeping. A release that carries the woff2 without it is non-compliant.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The single source of truth for what the panel loads. Archivo and Space
// Grotesk are the UI faces; Merriweather (prose) and Google Sans Code
// (markdown source) are the editor's two. `ofl` is the family's directory in
// google/fonts, which is where its licence and copyright line come from.
const FAMILIES = [
  { css: 'Space Grotesk:wght@400;500;600;700', ofl: 'spacegrotesk' },
  { css: 'Archivo:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,600', ofl: 'archivo' },
  {
    css: 'Merriweather:ital,opsz,wght@0,18..144,300..800;1,18..144,300..800',
    ofl: 'merriweather',
  },
  { css: 'Google Sans Code:ital,wght@0,300..700;1,300..700', ofl: 'googlesanscode' },
];

// css2 serves woff2 only to a UA it recognises as modern; the default fetch UA
// gets ttf, which is several times the bytes.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/16.0 Safari/605.1.15';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = resolve(ROOT, 'src/assets/fonts');
const CSS_FILE = resolve(ROOT, 'src/styles/fonts.css');
const LICENCE_DIR = resolve(ROOT, 'public/fonts');
const LICENCE_FILE = resolve(LICENCE_DIR, 'OFL.txt');

// gstatic hands out a transient 404 now and then — one was seen mid-run while
// every URL from the same sheet answered 200 seconds later. Without a retry
// that aborts the whole vendoring over a blip, so give each fetch a few goes
// before believing it.
async function get(url, what) {
  let last = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.ok) return res;
      last = `HTTP ${res.status} ${res.statusText}`;
    } catch (e) {
      last = e.message;
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  console.error(`✗ ${what} failed after 3 attempts: ${last}\n  ${url}`);
  process.exit(1);
}

const url =
  'https://fonts.googleapis.com/css2?' +
  FAMILIES.map((f) => `family=${encodeURIComponent(f.css)}`).join('&') +
  '&display=swap';

let css = await (await get(url, 'the css2 stylesheet')).text();

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
const filesByFamily = new Map();
for (const [remote, { family, style, subset, weights }] of byUrl) {
  const range = [...weights].sort((a, b) => a - b);
  const span = range.length > 1 ? `${range[0]}-${range.at(-1)}` : `${range[0]}`;
  const name = `${slug(family)}-${slug(style)}-${span}-${slug(subset)}.woff2`;
  if (wanted.has(name)) {
    console.error(`✗ Two different files both want ${name} — the naming is ambiguous.`);
    process.exit(1);
  }
  wanted.set(name, remote);
  filesByFamily.set(family, [...(filesByFamily.get(family) ?? []), name]);
}

// The licence notice is generated from FAMILIES, but the files come from what
// Google actually served. If those two ever disagree, some woff2 would ship
// with nobody's copyright line attached to it — so check rather than assume.
const declared = new Set(FAMILIES.map((f) => f.css.split(':')[0]));
for (const family of filesByFamily.keys()) {
  if (!declared.has(family)) {
    console.error(`✗ css2 returned '${family}', which is not in FAMILIES — it would ship unlicensed.`);
    process.exit(1);
  }
}
for (const family of declared) {
  if (!filesByFamily.has(family)) {
    console.error(`✗ css2 returned no files for '${family}' — is the family spec still valid?`);
    process.exit(1);
  }
}

// Drop anything a previous run left behind before writing, so a family removed
// from FAMILIES stops shipping instead of lingering unreferenced in the bundle.
mkdirSync(FONT_DIR, { recursive: true });
for (const stale of readdirSync(FONT_DIR)) {
  if (stale.endsWith('.woff2') && !wanted.has(stale)) rmSync(resolve(FONT_DIR, stale));
}

let bytes = 0;
for (const [name, remote] of wanted) {
  const font = await get(remote, `downloading ${name}`);
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
  ' * Space Grotesk, Archivo, Merriweather and Google Sans Code are OFL-1.1;\n' +
  ' * the licence they travel under is at public/fonts/OFL.txt.\n' +
  ' */\n';
writeFileSync(CSS_FILE, header + css);

// Verbatim, one after another. The licence permits redistribution only with a
// copy of itself and the copyright notice, and each family carries its own.
const licences = [];
for (const { ofl } of FAMILIES) {
  // A family that is not under ofl/ has no licence here to ship it under, so a
  // 404 must stop the run rather than quietly produce a notice missing one.
  const src = `https://raw.githubusercontent.com/google/fonts/main/ofl/${ofl}/OFL.txt`;
  const body = await (await get(src, `fetching the ${ofl} licence`)).text();
  if (!body.startsWith('Copyright') || !body.includes('SIL OPEN FONT LICENSE Version 1.1')) {
    console.error(`✗ ${src} is not an OFL-1.1 notice — refusing to ship the fonts under it.`);
    process.exit(1);
  }
  licences.push(`${'='.repeat(72)}\n${src}\n${'='.repeat(72)}\n\n${body.trimEnd()}\n`);
}

mkdirSync(LICENCE_DIR, { recursive: true });
writeFileSync(
  LICENCE_FILE,
  'The faces the plym admin panel ships are Open Font License 1.1, each with\n' +
    'its own copyright notice. Every one is reproduced below, verbatim from\n' +
    'google/fonts, which is where the woff2 in this bundle were built from.\n\n' +
    licences.join('\n'),
);

console.log(`✓ Wrote ${wanted.size} woff2 (${(bytes / 1024 / 1024).toFixed(1)} MB) to ${FONT_DIR}`);
console.log(`✓ Wrote ${CSS_FILE}`);
console.log(`✓ Wrote ${LICENCE_FILE} (${licences.length} notices)`);
