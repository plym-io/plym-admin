import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The panel is served behind `default-src 'self'` with no `data:` in font-src.
// Every one of these rules is a way the fonts have already been, or could be,
// silently blocked at runtime — the panel still renders, just in the wrong
// face, so nothing short of an assertion catches it.
const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('self-hosted fonts', () => {
  it('the shell links no remote stylesheet or font', () => {
    const html = read('index.html');
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });

  it('fonts.css points only at local files, never a CDN or a data: URI', () => {
    const urls = [...read('src/styles/fonts.css').matchAll(/url\(([^)]+)\)/g)].map((m) =>
      m[1].replace(/['"]/g, ''),
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith('../assets/fonts/')).toBe(true);
      expect(url.endsWith('.woff2')).toBe(true);
    }
  });

  it('every face fonts.css declares is actually vendored', () => {
    const urls = [...read('src/styles/fonts.css').matchAll(/url\(([^)]+)\)/g)].map((m) =>
      m[1].replace(/['"]/g, ''),
    );
    for (const url of new Set(urls)) {
      expect(existsSync(resolve(ROOT, 'src/styles', url))).toBe(true);
    }
  });

  it('declares every family the design tokens name', () => {
    const css = read('src/styles/fonts.css');
    for (const family of ['Archivo', 'Space Grotesk', 'Merriweather', 'Google Sans Code']) {
      expect(css).toContain(`font-family: '${family}'`);
    }
  });

  it('globals.css pulls the faces in', () => {
    expect(read('src/styles/globals.css')).toContain("@import './fonts.css'");
  });

  it('ships the licence the vendored faces travel under', () => {
    // OFL-1.1 permits redistribution only alongside its own text and the
    // copyright notice, so the bundle carrying the woff2 has to carry these.
    // public/ is what reaches dist, which is what a release tarball is —
    // src/assets/ never gets there unless something imports it.
    const licence = read('public/fonts/OFL.txt');
    // Driven off fonts.css rather than a hardcoded list: adding a fifth family
    // and forgetting to regenerate the notice is the way this goes wrong, and
    // a fixed list would sail straight past it.
    const families = new Set(
      [...read('src/styles/fonts.css').matchAll(/font-family: '([^']+)'/g)].map((m) => m[1]),
    );
    expect(families.size).toBeGreaterThan(0);
    for (const family of families) expect(licence).toContain(family);
    expect(licence.match(/SIL OPEN FONT LICENSE Version 1\.1/g)).toHaveLength(families.size);
  });

  it('the build never inlines a woff2, which would make it a data: URI', () => {
    // Vite inlines any asset under assetsInlineLimit; the config has to opt
    // woff2 out by hand, and the small subsets are well under the default.
    const config = read('vite.config.ts');
    expect(config).toMatch(/assetsInlineLimit[\s\S]{0,120}woff2/);
  });
});
