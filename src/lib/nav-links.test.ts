import { describe, expect, it } from 'vitest';
import {
  addChild,
  editAt,
  faultCount,
  faultOf,
  isMenu,
  moveAt,
  moveTo,
  newDraft,
  readDrafts,
  removeAt,
  setKind,
  toLinks,
  toYaml,
  yamlScalar,
  type NavDraft,
} from './nav-links';

function draft(text: string, url = '', children: NavDraft[] = []): NavDraft {
  return {
    ...newDraft(),
    kind: children.length ? 'menu' : 'link',
    text,
    url,
    children,
  };
}

describe('readDrafts', () => {
  it('reads the block plym serves', () => {
    const drafts = readDrafts({
      header: [
        { text: 'Home', url: '/' },
        { text: 'Resources', children: [{ text: 'Docs', url: 'https://plym.io/docs/' }] },
      ],
      footer: [{ text: 'About', url: '/about' }],
    });
    expect(drafts.header.map((l) => l.text)).toEqual(['Home', 'Resources']);
    expect(drafts.header[1].children[0].url).toBe('https://plym.io/docs/');
    expect(drafts.footer[0].url).toBe('/about');
  });

  it('gives every row an id of its own', () => {
    const drafts = readDrafts({ header: [{ text: 'A', url: '/a' }, { text: 'B', url: '/b' }] });
    expect(drafts.header[0].id).not.toBe(drafts.header[1].id);
  });

  it('reads a blog that configures nothing as two empty lists', () => {
    for (const value of [undefined, null, {}, 'nonsense', []]) {
      expect(readDrafts(value)).toEqual({ header: [], footer: [] });
    }
  });

  it('drops entries that carry nothing to render', () => {
    expect(readDrafts({ header: [null, 42, {}, { text: 'Home', url: '/' }] }).header).toHaveLength(
      1,
    );
  });

  it('drops a third level, which nothing can render', () => {
    // plym rejects it at load, so this is defence against a hand-edited file
    // rather than a shape the API can actually return.
    const drafts = readDrafts({
      header: [{ text: 'A', children: [{ text: 'B', children: [{ text: 'C', url: '/c' }] }] }],
    });
    expect(drafts.header[0].children[0].children).toEqual([]);
  });
});

describe('toLinks', () => {
  it('trims what it writes', () => {
    expect(toLinks([draft('  Home  ', '  /  ')])).toEqual([{ text: 'Home', url: '/' }]);
  });

  it('leaves a menu without a url, however much one was typed first', () => {
    // The url is kept in the draft so undoing the nesting gets it back; it is
    // config.yaml that must never see both.
    const menu = draft('Resources', '/resources', [draft('Docs', '/docs')]);
    expect(toLinks([menu])).toEqual([
      { text: 'Resources', children: [{ text: 'Docs', url: '/docs' }] },
    ]);
  });
});

describe('editing', () => {
  const tree = [draft('Home', '/'), draft('Resources', '', [draft('Docs', '/docs')])];

  it('edits a nested row without disturbing its siblings', () => {
    const next = editAt(tree, [1, 0], { text: 'Guides' });
    expect(next[1].children[0].text).toBe('Guides');
    expect(next[0]).toBe(tree[0]);
  });

  it('removes a nested row', () => {
    expect(removeAt(tree, [1, 0])[1].children).toEqual([]);
  });

  it('leaves an emptied menu a menu, for the toggle to undo', () => {
    // Silently demoting it would answer a question the operator never asked,
    // and the fault is what says a menu with nothing in it is unfinished.
    const menu = draft('Resources', '/resources', [draft('Docs', '/docs')]);
    const [emptied] = removeAt([menu], [0, 0]);
    expect(isMenu(emptied)).toBe(true);
    expect(faultOf(emptied)).toBe('menu');
  });

  it('reorders within a list', () => {
    expect(moveAt(tree, [1], -1).map((l) => l.text)).toEqual(['Resources', 'Home']);
  });

  it('reorders a submenu without touching the list it hangs off', () => {
    const menu = draft('Resources', '', [draft('Docs', '/docs'), draft('API', '/api')]);
    const next = moveAt([draft('Home', '/'), menu], [1, 1], -1);
    expect(next.map((l) => l.text)).toEqual(['Home', 'Resources']);
    expect(next[1].children.map((c) => c.text)).toEqual(['API', 'Docs']);
  });

  it('leaves the list alone at either end', () => {
    expect(moveAt(tree, [0], -1)).toEqual(tree);
    expect(moveAt(tree, [1], 1)).toEqual(tree);
  });

  it('adds a link to a menu', () => {
    const next = addChild([draft('Resources', '', [draft('Docs', '/docs')])], 0);
    expect(next[0].children.map((c) => c.text)).toEqual(['Docs', '']);
  });
});

describe('moveTo', () => {
  const list = ['a', 'b', 'c', 'd'].map((t) => draft(t, `/${t}`));

  it('lifts a row out and puts it back, keeping the rest in order', () => {
    // A swap would leave b and c transposed; dragging d to the top must not
    // reorder the rows it passed over.
    expect(moveTo(list, [3], 0).map((l) => l.text)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveTo(list, [0], 2).map((l) => l.text)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('ignores a drop outside the list', () => {
    expect(moveTo(list, [0], 4)).toEqual(list);
    expect(moveTo(list, [0], -1)).toEqual(list);
  });

  it('moves a child within its own menu', () => {
    const tree = [draft('Menu', '', [draft('x', '/x'), draft('y', '/y'), draft('z', '/z')])];
    expect(moveTo(tree, [0, 2], 0)[0].children.map((c) => c.text)).toEqual(['z', 'x', 'y']);
  });
});

describe('setKind', () => {
  it('seeds the first child when a link becomes a menu', () => {
    const [menu] = setKind([draft('Resources', '/resources')], 0, 'menu');
    expect(isMenu(menu)).toBe(true);
    expect(menu.children).toHaveLength(1);
  });

  it('gives the typed address back when a menu becomes a link again', () => {
    const menu = draft('Resources', '/resources', [draft('Docs', '/docs')]);
    const [back] = setKind([menu], 0, 'link');
    expect(toLinks([back])).toEqual([{ text: 'Resources', url: '/resources' }]);
  });

  it('keeps the children it had, so the toggle is reversible', () => {
    const menu = draft('Resources', '/resources', [draft('Docs', '/docs')]);
    const there = setKind(setKind([menu], 0, 'link'), 0, 'menu');
    expect(toLinks(there)).toEqual([
      { text: 'Resources', children: [{ text: 'Docs', url: '/docs' }] },
    ]);
  });
});

describe('faults', () => {
  it('wants a label on every row', () => {
    expect(faultOf(draft('', '/'))).toBe('text');
  });

  it('wants a url on a row that opens no menu', () => {
    expect(faultOf(draft('Home'))).toBe('url');
  });

  it('asks a menu for no url of its own', () => {
    expect(faultOf(draft('Resources', '', [draft('Docs', '/docs')]))).toBeNull();
  });

  it('counts children too', () => {
    expect(faultCount([draft('Resources', '', [draft('', ''), draft('Docs', '/docs')])])).toBe(1);
  });

  it('ignores the children of a row switched back to a link', () => {
    // They are kept so the toggle can be undone, but they are not written, so
    // a half-typed one nobody can see must not withhold the block.
    const menu = draft('Resources', '/resources', [draft('', '')]);
    expect(faultCount(setKind([menu], 0, 'link'))).toBe(0);
  });

  it('catches two links in one block sharing a label', () => {
    // The label is the mapping key, so the second would silently replace the
    // first the moment YAML read the file back.
    const clash = [draft('Docs', '/docs'), draft('Docs', '/documentation')];
    expect(faultOf(clash[1], clash)).toBe('duplicate');
    expect(faultCount(clash)).toBe(2);
  });

  it('lets two menus each have a link of the same name', () => {
    const tree = [
      draft('Product', '', [draft('Docs', '/p/docs')]),
      draft('Company', '', [draft('Docs', '/c/docs')]),
    ];
    expect(faultCount(tree)).toBe(0);
  });

  it('compares labels as they will be written, not as they were typed', () => {
    const clash = [draft('Docs', '/docs'), draft('  Docs  ', '/documentation')];
    expect(faultOf(clash[1], clash)).toBe('duplicate');
  });
});

describe('yamlScalar', () => {
  it('leaves ordinary labels and urls plain', () => {
    for (const v of ['Home', '/', '/about', 'https://plym.io/docs/', "What's new"]) {
      expect(yamlScalar(v)).toBe(v);
    }
  });

  it('quotes anything YAML would read back as something other than a string', () => {
    // A label of "No" loaded as a boolean fails plym's `text: str` and the
    // blog does not start.
    expect(yamlScalar('No')).toBe('"No"');
    expect(yamlScalar('2026')).toBe('"2026"');
    expect(yamlScalar('~')).toBe('"~"');
  });

  it('quotes anything that would end the scalar early', () => {
    expect(yamlScalar('Pricing # and plans')).toBe('"Pricing # and plans"');
    expect(yamlScalar('Docs: the manual')).toBe('"Docs: the manual"');
    expect(yamlScalar('- Home')).toBe('"- Home"');
    expect(yamlScalar(' Home')).toBe('" Home"');
    expect(yamlScalar('')).toBe('""');
  });

  it('escapes a quote it has to open the scalar with', () => {
    // A quote inside a plain scalar is just a character; only a leading one
    // opens a quoted scalar. Checked against PyYAML, which is what plym loads
    // config.yaml with.
    expect(yamlScalar('The "good" parts')).toBe('The "good" parts');
    expect(yamlScalar('"Best of" list')).toBe('"\\"Best of\\" list"');
  });
});

describe('toYaml', () => {
  it('writes the named blocks exactly as config.yaml documents them', () => {
    const yaml = toYaml({
      header: [
        { text: 'Home', url: '/' },
        {
          text: 'Resources',
          children: [
            { text: 'Docs', url: 'https://plym.io/docs/' },
            { text: 'Templates', url: 'https://plym.io/templates' },
          ],
        },
      ],
      footer: [
        {
          text: 'Open Source',
          children: [{ text: 'GitHub', url: 'https://github.com/plym-io/plym' }],
        },
        { text: 'About', url: '/about' },
      ],
    });
    expect(yaml).toBe(
      [
        'links:',
        '  header:',
        '    Home: /',
        '    Resources:',
        '      Docs: https://plym.io/docs/',
        '      Templates: https://plym.io/templates',
        '  footer:',
        '    Open Source:',
        '      GitHub: https://github.com/plym-io/plym',
        '    About: /about',
      ].join('\n'),
    );
  });

  it('never writes the list form, which plym rejects outright', () => {
    expect(toYaml({ header: [{ text: 'Home', url: '/' }], footer: [] })).not.toContain('- text:');
  });

  it('quotes a name YAML would hand plym as something other than text', () => {
    // plym's own message: "quote it, so yaml reads 'on' or '2026' as a label".
    const yaml = toYaml({ header: [{ text: 'On', url: '/on' }], footer: [] });
    expect(yaml).toContain('    "On": /on');
  });

  it('says an empty slot out loud, so pasting it clears the old one', () => {
    expect(toYaml({ header: [], footer: [] })).toBe('links:\n  header: {}\n  footer: {}');
  });
});
