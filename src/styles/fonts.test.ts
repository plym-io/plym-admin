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

  it('the build never inlines a woff2, which would make it a data: URI', () => {
    // Vite inlines any asset under assetsInlineLimit; the config has to opt
    // woff2 out by hand, and the small subsets are well under the default.
    const config = read('vite.config.ts');
    expect(config).toMatch(/assetsInlineLimit[\s\S]{0,120}woff2/);
  });
});
