import { describe, expect, it } from 'vitest';
import { isStaleBuild } from './stale-build';

/**
 * The only evidence a replaced build leaves is the sentence the browser wrote,
 * and every engine writes a different one. Missing any of them turns the wait
 * for an update into "Something went wrong".
 */
describe('isStaleBuild', () => {
  it('recognises the chunk that is gone, whichever browser says so', () => {
    expect(
      isStaleBuild(
        new TypeError(
          'Failed to fetch dynamically imported module: https://blog.example/blog/plym-admin/assets/login-CjQboCG_.js',
        ),
      ),
    ).toBe(true);
    expect(
      isStaleBuild(new TypeError('error loading dynamically imported module')),
    ).toBe(true);
    expect(isStaleBuild(new TypeError('Importing a module script failed.'))).toBe(
      true,
    );
  });

  it('recognises the stylesheet that went with it', () => {
    expect(
      isStaleBuild(new Error('Unable to preload CSS for /assets/editor-B1x9.css')),
    ).toBe(true);
  });

  it('leaves every other failure to be reported as itself', () => {
    expect(isStaleBuild(new TypeError('x is not a function'))).toBe(false);
    expect(isStaleBuild(new Error('Failed to fetch'))).toBe(false);
    expect(isStaleBuild({ status: 404, statusText: 'Not Found' })).toBe(false);
    expect(isStaleBuild(null)).toBe(false);
  });

  it('reads a thrown string as well as a thrown Error', () => {
    expect(isStaleBuild('Failed to fetch dynamically imported module')).toBe(true);
  });
});
