import { describe, it, expect } from 'vitest';
import { catalogEntries } from './TemplatePicker';
import type { TemplateCatalog } from '@/types/cloud';

const catalog = (over: Partial<TemplateCatalog> = {}): TemplateCatalog => ({
  available: [],
  active: null,
  public: [],
  private: [],
  ...over,
});

describe('catalogEntries', () => {
  it('marks what is installed and what is live', () => {
    const entries = catalogEntries(
      catalog({ available: ['atlas'], active: 'atlas', public: ['atlas', 'quill'] }),
    );
    expect(entries.map((e) => [e.name, e.installed, e.active])).toEqual([
      ['atlas', true, true],
      ['quill', false, false],
    ]);
  });

  it("prefers the tenant's own registry when a name is in both", () => {
    const entries = catalogEntries(
      catalog({ public: ['shared'], private: ['shared'] }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('private');
  });

  it('still lists an installed template neither registry offers any more', () => {
    const entries = catalogEntries(catalog({ available: ['retired'] }));
    expect(entries).toEqual([
      { name: 'retired', source: 'public', installed: true, active: false },
    ]);
  });

  it('sorts by name so the list does not reorder between polls', () => {
    const entries = catalogEntries(catalog({ public: ['quill', 'atlas', 'minimal'] }));
    expect(entries.map((e) => e.name)).toEqual(['atlas', 'minimal', 'quill']);
  });

  it('handles a tenant with no registry folder', () => {
    expect(catalogEntries(catalog({ private: [], public: ['atlas'] }))).toHaveLength(1);
  });
});
