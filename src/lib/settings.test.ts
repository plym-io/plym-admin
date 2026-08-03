import { describe, expect, it } from 'vitest';
import {
  buildPatch,
  displayValue,
  flatten,
  groupSchema,
  initialDraft,
  normalizePlan,
  normalizeSettings,
  normalizeTemplates,
  toInput,
  worstImpact,
} from './settings';

describe('flatten', () => {
  it('turns a nested config into dotted keys', () => {
    expect(flatten({ name: 'Acme', colors: { primary: '#fff', accent: '#000' } })).toEqual({
      name: 'Acme',
      'colors.primary': '#fff',
      'colors.accent': '#000',
    });
  });

  it('leaves an already-flat document alone', () => {
    expect(flatten({ 'colors.primary': '#fff' })).toEqual({ 'colors.primary': '#fff' });
  });

  it('keeps arrays whole rather than indexing into them', () => {
    expect(flatten({ robots: { disallow_paths: ['/a', '/b'] } })).toEqual({
      'robots.disallow_paths': ['/a', '/b'],
    });
  });
});

describe('normalizeSettings', () => {
  const raw = {
    values: { name: 'Acme', colors: { primary: '#2f6fed' } },
    schema: [
      { key: 'name', kind: 'line', impact: 'rebuild', effects: ['Re-renders every post'] },
      { key: 'colors.primary', kind: 'color' },
    ],
    templates: [{ id: 'atlas' }, { id: 'navera' }],
  };

  it('reads values, schema and templates', () => {
    const doc = normalizeSettings(raw);
    expect(doc.values).toEqual({ name: 'Acme', 'colors.primary': '#2f6fed' });
    expect(doc.schema.map((f) => f.key)).toEqual(['name', 'colors.primary']);
    expect(doc.templates).toEqual(['atlas', 'navera']);
  });

  it('assumes an unstated impact costs at least a reload', () => {
    // Never "none" — the deploy dialog must not promise a change is free.
    expect(normalizeSettings(raw).schema[1].impact).toBe('reload');
  });

  it('accepts a schema sent as a key → entry map', () => {
    const doc = normalizeSettings({
      values: {},
      schema: { 'mcp.enabled': { kind: 'bool', impact: 'rebuild' } },
    });
    expect(doc.schema).toEqual([
      { key: 'mcp.enabled', kind: 'bool', impact: 'rebuild', effects: [], note: undefined, label: undefined, choices: undefined },
    ]);
  });

  it('survives a response with nothing in it', () => {
    expect(normalizeSettings(null)).toEqual({ values: {}, schema: [], templates: [] });
  });
});

describe('normalizeTemplates', () => {
  it('prefers the available list over the installed one', () => {
    expect(normalizeTemplates({ installed: ['atlas'], available: ['atlas', 'navera'] })).toEqual([
      'atlas',
      'navera',
    ]);
  });
});

describe('buildPatch', () => {
  const schema = normalizeSettings({
    values: {},
    schema: [
      { key: 'name', kind: 'line' },
      { key: 'pagination.page_size', kind: 'int' },
      { key: 'mcp.enabled', kind: 'bool' },
    ],
  }).schema;
  const values = { name: 'Acme', 'pagination.page_size': 10, 'mcp.enabled': false };

  it('sends only what changed', () => {
    const draft = initialDraft(schema, values);
    expect(buildPatch(schema, values, draft)).toEqual({});
    expect(buildPatch(schema, values, { ...draft, name: 'Acme Blog' })).toEqual({
      name: 'Acme Blog',
    });
  });

  it('does not count a number retyped as the same number', () => {
    const draft = { ...initialDraft(schema, values), 'pagination.page_size': '10' };
    expect(buildPatch(schema, values, draft)).toEqual({});
  });

  it('sends ints as numbers and booleans as booleans', () => {
    const draft = {
      ...initialDraft(schema, values),
      'pagination.page_size': '25',
      'mcp.enabled': true,
    };
    expect(buildPatch(schema, values, draft)).toEqual({
      'pagination.page_size': 25,
      'mcp.enabled': true,
    });
  });

  it('leaves an unparseable number as typed, for the gateway to reject', () => {
    const draft = { ...initialDraft(schema, values), 'pagination.page_size': 'ten' };
    expect(buildPatch(schema, values, draft)).toEqual({ 'pagination.page_size': 'ten' });
  });
});

describe('toInput', () => {
  it('shows a missing value as an empty field, not "undefined"', () => {
    expect(toInput('line', undefined)).toBe('');
    expect(toInput('line', null)).toBe('');
  });

  it('joins a list the way the gateway takes it back', () => {
    expect(toInput('list', ['/private', '/tmp'])).toBe('/private, /tmp');
  });
});

describe('normalizePlan', () => {
  it('reads changes, effects and impact', () => {
    expect(
      normalizePlan({
        changes: [{ key: 'name', from: 'Acme', to: 'Acme Blog' }],
        effects: ['Re-renders every published post'],
        impact: 'rebuild',
      }),
    ).toEqual({
      changes: [{ key: 'name', from: 'Acme', to: 'Acme Blog' }],
      effects: ['Re-renders every published post'],
      impact: 'rebuild',
    });
  });

  it('accepts old/new naming and effects sent as objects', () => {
    const plan = normalizePlan({
      changes: { template: { old: 'atlas', new: 'navera' } },
      effects: [{ message: 'Re-renders 12 posts' }],
    });
    expect(plan.changes).toEqual([{ key: 'template', from: 'atlas', to: 'navera' }]);
    expect(plan.effects).toEqual(['Re-renders 12 posts']);
    expect(plan.impact).toBe('reload');
  });
});

describe('worstImpact', () => {
  it('reports the most expensive change in the batch', () => {
    expect(worstImpact(['none', 'reload', 'rebuild'])).toBe('rebuild');
    expect(worstImpact(['reroute', 'reload'])).toBe('reroute');
    expect(worstImpact([])).toBe('none');
  });
});

describe('groupSchema', () => {
  it('groups by dotted prefix and leads with the top-level keys', () => {
    const schema = normalizeSettings({
      values: {},
      schema: [
        { key: 'colors.primary' },
        { key: 'name' },
        { key: 'colors.accent' },
        { key: 'robots.serve' },
      ],
    }).schema;
    expect(groupSchema(schema).map((g) => [g.title, g.fields.map((f) => f.key)])).toEqual([
      ['Site', ['name']],
      ['colors', ['colors.primary', 'colors.accent']],
      ['robots', ['robots.serve']],
    ]);
  });
});

describe('displayValue', () => {
  it('reads booleans and blanks as words, not literals', () => {
    expect(displayValue(true)).toBe('on');
    expect(displayValue('')).toBe('—');
    expect(displayValue(['a', 'b'])).toBe('a, b');
  });
});
