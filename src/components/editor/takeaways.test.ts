import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { parseTakeaways } from './takeaways';
import { SLASH_COMMANDS } from './slash-commands';

const parse = (source: string) => parseTakeaways(source.split('\n'));

const CARD = '> Key Takeaways\n>\n> - This is some takeaway\n> - This is another';

describe('parseTakeaways', () => {
  it('finds a card and the lines it spans', () => {
    expect(parse(CARD)).toEqual([{ open: 0, close: 3 }]);
  });

  it('takes the heading from the document, whatever it has been renamed to', () => {
    expect(parse('> TL;DR\n>\n> - one')).toEqual([{ open: 0, close: 2 }]);
  });

  it('needs no blank line inside it', () => {
    expect(parse('> Key Takeaways\n> - one\n> - two')).toEqual([{ open: 0, close: 2 }]);
  });

  it('holds on to the empty items the slash command leaves behind', () => {
    expect(parse('> Key Takeaways\n>\n> - \n> - ')).toEqual([{ open: 0, close: 3 }]);
  });

  it('keeps a wrapped item inside the card', () => {
    expect(parse('> Key Takeaways\n> - one\n>   still one\n> - two')).toEqual([
      { open: 0, close: 3 },
    ]);
  });

  it('finds every card in the document', () => {
    expect(parse(`${CARD}\n\nbetween\n\n${CARD}`)).toEqual([
      { open: 0, close: 3 },
      { open: 7, close: 10 },
    ]);
  });

  it('ends where the quote does', () => {
    expect(parse(`intro\n${CARD}\nafter`)).toEqual([{ open: 1, close: 4 }]);
  });

  it('leaves an ordinary quote alone', () => {
    expect(parse('> Something someone said\n> and said next')).toEqual([]);
  });

  it('leaves a quote that is only bullets alone', () => {
    expect(parse('> - one\n> - two')).toEqual([]);
  });

  it('leaves a quote with no bullets alone', () => {
    expect(parse('> Key Takeaways\n>\n> just prose')).toEqual([]);
  });

  it('leaves a numbered list alone, which is not the construct', () => {
    expect(parse('> Key Takeaways\n>\n> 1. one\n> 2. two')).toEqual([]);
  });

  it('leaves prose after the bullets alone', () => {
    expect(parse('> Key Takeaways\n> - one\n>\n> and one more thing')).toEqual([]);
  });

  it('does not read a heading or a nested quote as the title', () => {
    expect(parse('> ## Key Takeaways\n> - one')).toEqual([]);
    expect(parse('> > Key Takeaways\n> - one')).toEqual([]);
  });

  it('reads a rule as a rule rather than as an item', () => {
    expect(parse('> Key Takeaways\n> ---')).toEqual([]);
  });

  it('ignores a card written inside a code fence', () => {
    expect(parse('```\n' + CARD + '\n```')).toEqual([]);
  });

  it('sees the card that follows a closed fence', () => {
    expect(parse('```\ncode\n```\n' + CARD)).toEqual([{ open: 3, close: 6 }]);
  });

  it('does not run off the end of an unterminated fence', () => {
    expect(parse('```\n' + CARD)).toEqual([]);
  });
});

describe('the slash command', () => {
  const command = SLASH_COMMANDS.find((c) => c.id === 'takeaways');

  /** Run the command into an empty document and read back what it typed. */
  function insert() {
    let state = EditorState.create({ doc: '' });
    const view = {
      get state() {
        return state;
      },
      dispatch: (spec: Parameters<EditorState['update']>[0]) => {
        state = state.update(spec).state;
      },
      focus: () => {},
    };
    command?.run({
      view: view as unknown as EditorView,
      from: 0,
      to: 0,
      openMedia: () => {},
      openImageUpload: () => {},
    });
    return { doc: state.doc.toString(), cursor: state.selection.main.head };
  }

  it('is in the menu, under the words a writer would reach for', () => {
    expect(command?.title).toBe('Key Takeaways');
    expect(command?.keywords).toContain('summary');
  });

  it('types a card the editor draws as one, caret on the first item', () => {
    const { doc, cursor } = insert();
    expect(doc).toBe('> Key Takeaways\n>\n> - \n');
    expect(parseTakeaways(doc.split('\n'))).toEqual([{ open: 0, close: 2 }]);
    expect(cursor).toBe(doc.indexOf('> - ') + 4);
  });
});
