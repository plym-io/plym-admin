import { describe, it, expect } from 'vitest';
import { NAV, navSections, visibleNav } from './nav';

const labels = (role?: string) =>
  Object.fromEntries(
    visibleNav(role).map((g) => [g.label ?? '(none)', g.items.map((i) => i.label)]),
  );

describe('navigation grouping', () => {
  it('files every destination under the agreed section', () => {
    expect(labels('administrator')).toEqual({
      '(none)': ['Data', 'Support'],
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
    expect(labels('author').Marketing).toEqual(['Analytics']);
  });

  it('gives every item a unique route', () => {
    const routes = NAV.flatMap((g) => g.items.map((i) => i.to));
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('merges the unlabelled runs into one heading for the palette', () => {
    const sections = navSections('administrator');
    expect(sections[0]).toMatchObject({ label: 'Pages', items: expect.anything() });
    expect(sections[0].items.map((i) => i.label)).toEqual(['Home', 'Data', 'Support']);
    expect(sections.every((s) => s.label)).toBe(true);
  });
});
