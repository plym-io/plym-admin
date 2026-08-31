import { describe, expect, it } from 'vitest';
import {
  addChild,
  editAt,
  faultCount,
  faultOf,
  moveAt,
  newDraft,
  readDrafts,
  removeAt,
  toLinks,
  toYaml,
  yamlScalar,
  type NavDraft,
} from './nav-links';

function draft(text: string, url = '', children: NavDraft[] = []): NavDraft {
  return { ...newDraft(), text, url, children };
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

  it('turns a menu back into a link when its last child goes', () => {
    const menu = draft('Resources', '/resources', [draft('Docs', '/docs')]);
    const [back] = removeAt([menu], [0, 0]);
    expect(back.children).toEqual([]);
    expect(toLinks([back])).toEqual([{ text: 'Resources', url: '/resources' }]);
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

  it('makes a link a menu by giving it a child', () => {
    const next = addChild([draft('Resources', '/resources')], 0);
    expect(next[0].children).toHaveLength(1);
    expect(next[0].children[0].text).toBe('');
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
  it('writes the block exactly as config.yaml documents it', () => {
    const yaml = toYaml({
      header: [
        { text: 'Home', url: '/' },
        { text: 'Resources', children: [{ text: 'Docs', url: 'https://plym.io/docs/' }] },
      ],
      footer: [{ text: 'About', url: '/about' }],
    });
    expect(yaml).toBe(
      [
        'links:',
        '  header:',
        '    - text: Home',
        '      url: /',
        '    - text: Resources',
        '      children:',
        '        - text: Docs',
        '          url: https://plym.io/docs/',
        '  footer:',
        '    - text: About',
        '      url: /about',
      ].join('\n'),
    );
  });

  it('says an empty slot out loud, so pasting it clears the old one', () => {
    expect(toYaml({ header: [], footer: [] })).toBe('links:\n  header: []\n  footer: []');
  });
});
