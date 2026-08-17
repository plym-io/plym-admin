import { describe, it, expect } from 'vitest';
import { shelve } from './TemplatePicker';
import type { TemplateCatalog } from '@/types/cloud';

const catalog = (over: Partial<TemplateCatalog> = {}): TemplateCatalog => ({
  available: [],
  active: null,
  public: [],
  private: [],
  ...over,
});

describe('shelve', () => {
  it('separates what is installed from what could be', () => {
    const shelf = shelve(
      catalog({ available: ['atlas'], public: ['atlas', 'quill'] }),
      [],
    );
    expect(shelf.installed.map((e) => e.name)).toEqual(['atlas']);
    expect(shelf.registry.map((e) => e.name)).toEqual(['quill']);
  });

  it('never offers the same name in both lists', () => {
    // The old screen did, with a different button on each row, and that was
    // the whole of the confusion: only an installed template can be selected.
    const shelf = shelve(
      catalog({ available: ['atlas'], public: ['atlas'], private: ['atlas'] }),
      [],
    );
    expect(shelf.registry).toEqual([]);
    expect(shelf.installed).toHaveLength(1);
  });

  it("prefers the tenant's own registry when a name is in both", () => {
    const shelf = shelve(catalog({ public: ['shared'], private: ['shared'] }), []);
    expect(shelf.registry).toEqual([{ name: 'shared', source: 'private' }]);
  });

  it('keeps an installed template neither registry offers any more', () => {
    // Still selectable, but there is nowhere to fetch it from again, so it
    // carries no source and gets no refetch control.
    expect(shelve(catalog({ available: ['retired'] }), []).installed).toEqual([
      { name: 'retired', source: null },
    ]);
  });

  it('falls back to the settings document when there is no catalogue', () => {
    // An older gateway has no /templates. Selecting must still work.
    const shelf = shelve(null, ['atlas', 'quill']);
    expect(shelf.installed.map((e) => e.name)).toEqual(['atlas', 'quill']);
    expect(shelf.registry).toEqual([]);
  });

  it('lets the catalogue overrule the settings document', () => {
    expect(shelve(catalog({ available: ['atlas'] }), ['stale']).installed).toEqual([
      { name: 'atlas', source: null },
    ]);
  });

  it('sorts both lists by name so neither reorders between polls', () => {
    const shelf = shelve(
      catalog({ available: ['quill', 'atlas'], public: ['zed', 'minimal'] }),
      [],
    );
    expect(shelf.installed.map((e) => e.name)).toEqual(['atlas', 'quill']);
    expect(shelf.registry.map((e) => e.name)).toEqual(['minimal', 'zed']);
  });

  it('handles a tenant with no registry folder', () => {
    expect(shelve(catalog({ private: [], public: ['atlas'] }), []).registry).toHaveLength(1);
  });
});
