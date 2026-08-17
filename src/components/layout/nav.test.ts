import { describe, it, expect } from 'vitest';
import { NAV, locateNav, navSections, visibleNav, type NavContext } from './nav';

const labels = (ctx: NavContext) =>
  Object.fromEntries(
    visibleNav(ctx).map((g) => [g.label ?? '(none)', g.items.map((i) => i.label)]),
  );

const cloudAdmin: NavContext = { role: 'administrator', cloud: true };

describe('navigation grouping', () => {
  it('files every destination under the agreed section', () => {
    expect(labels(cloudAdmin)).toEqual({
      '(none)': ['Support', 'Subscription'],
      Content: ['Posts', 'Media', 'Categories', 'Tags', 'FAQs'],
      Administration: ['Users', 'Settings', 'Domain'],
      Tools: ['MCP', 'API'],
      Marketing: ['Leads', 'Analytics'],
    });
  });

  it('keeps Home out of every section', () => {
    const home = NAV.find((g) => g.items.some((i) => i.label === 'Home'));
    expect(home?.label).toBeUndefined();
  });

  it('hides Leads from non-administrators without emptying Marketing', () => {
    expect(labels({ role: 'editor', cloud: true }).Marketing).toEqual(['Analytics']);
  });

  it('leaves an editor nothing under Administration but Users', () => {
    // Settings, Domain and Leads are 403 for anyone below administrator, so
    // the sidebar — and with it the palette — must not offer them at all.
    const editor = labels({ role: 'editor', cloud: true });
    expect(editor.Administration).toEqual(['Users']);
    expect(navSections({ role: 'editor', cloud: true }).flatMap((s) =>
      s.items.map((i) => i.label),
    )).not.toContain('Settings');
  });

  it('gives every item a unique route', () => {
    const routes = NAV.flatMap((g) => g.items.map((i) => i.to));
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('merges the unlabelled runs into one heading for the palette', () => {
    const sections = navSections(cloudAdmin);
    expect(sections[0]).toMatchObject({ label: 'Pages', items: expect.anything() });
    expect(sections[0].items.map((i) => i.label)).toEqual([
      'Home',
      'Support',
      'Subscription',
    ]);
    expect(sections.every((s) => s.label)).toBe(true);
  });
});

describe('destinations outside the panel', () => {
  it('sends Subscription to the cloud console over https', () => {
    const item = NAV.flatMap((g) => g.items).find((i) => i.label === 'Subscription');
    expect(item).toMatchObject({ external: true, to: 'https://cloud.plym.io' });
  });

  it('keeps Subscription out of a self-hosted panel', () => {
    // There is no subscription behind it, so the link would only ever be an
    // advertisement inside someone's own admin.
    const oss = visibleNav({ role: 'administrator', cloud: false }).flatMap((g) =>
      g.items.map((i) => i.label),
    );
    expect(oss).not.toContain('Subscription');
  });

  it('never resolves the current route to an external item', () => {
    // `startsWith` would otherwise let a stray path match an absolute URL and
    // light up a sidebar row that isn't a page.
    expect(locateNav('https://cloud.plym.io')).toBeNull();
    expect(NAV.flatMap((g) => g.items).every((i) => !i.external || !i.to.startsWith('/'))).toBe(
      true,
    );
  });
});

describe('edition', () => {
  it('drops the cloud-only sections on a self-hosted blog', () => {
    const oss = labels({ role: 'administrator', cloud: false });
    expect(oss).toEqual({
      '(none)': ['Support'],
      Content: ['Posts', 'Media', 'Categories', 'Tags', 'FAQs'],
      Administration: ['Users', 'Settings'],
      // Both editions speak MCP and both serve the API — only the way you
      // switch MCP on differs, and the page itself says which way round it is.
      Tools: ['MCP', 'API'],
      Marketing: ['Leads'],
    });
  });

  it('treats an undecided edition as self-hosted', () => {
    expect(labels({ role: 'administrator' }).Administration).toEqual([
      'Users',
      'Settings',
    ]);
  });

  it('hides a cloud section whose capability flag is off', () => {
    const nav = labels({
      role: 'administrator',
      cloud: true,
      capabilities: { mcp: false, analytics: false },
    });
    expect(nav.Tools).toEqual(['API']);
    expect(nav.Marketing).toEqual(['Leads']);
    expect(nav.Administration).toContain('Domain');
  });

  it('keeps a section whose flag the gateway never mentions', () => {
    expect(labels({ role: 'administrator', cloud: true, capabilities: {} }).Tools).toEqual([
      'MCP',
      'API',
    ]);
  });

  it('leaves a capability-gated section alone on a self-hosted blog', () => {
    // Capability flags come from the cloud gateway. An OSS blog has none, so
    // they must not be read as "switched off".
    expect(labels({ role: 'administrator', cloud: false, capabilities: null }).Tools).toEqual([
      'MCP',
      'API',
    ]);
  });
});

describe('locateNav', () => {
  it('finds the section a page belongs to', () => {
    expect(locateNav('/settings')).toMatchObject({
      group: 'Administration',
      item: { label: 'Settings' },
    });
  });

  it('resolves a child route to its parent rather than Home', () => {
    expect(locateNav('/posts/42')?.item.label).toBe('Posts');
  });

  it('matches Home only exactly', () => {
    expect(locateNav('/')?.item.label).toBe('Home');
    expect(locateNav('/nowhere')).toBeNull();
  });
});
