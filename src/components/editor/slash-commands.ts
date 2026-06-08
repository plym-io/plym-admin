import type { EditorView } from '@codemirror/view';
import {
  TextHOne,
  TextHTwo,
  TextHThree,
  Quotes,
  ListBullets,
  ListNumbers,
  Minus,
  Code,
  Table,
  LinkSimple,
  Image as ImageIcon,
  Images,
  type Icon,
} from '@phosphor-icons/react';

/** Context handed to a command when it runs. */
export interface SlashContext {
  view: EditorView;
  /** Document position of the triggering "/". */
  from: number;
  /** Document position of the cursor (end of the "/query"). */
  to: number;
  /** Open the media-library picker; inserts an image at `from` on pick. */
  openMedia: () => void;
  /** Open the file picker to upload an image; inserts at `from` when ready. */
  openImageUpload: () => void;
}

export interface SlashCommand {
  id: string;
  title: string;
  hint: string;
  keywords: string[];
  icon: Icon;
  run: (ctx: SlashContext) => void;
}

/**
 * Replace the "/query" range with `insert` and place the caret at
 * `from + cursorOffset` (defaults to the end of the inserted text).
 */
export function replaceRange(
  ctx: SlashContext,
  insert: string,
  cursorOffset = insert.length,
) {
  ctx.view.dispatch({
    changes: { from: ctx.from, to: ctx.to, insert },
    selection: { anchor: ctx.from + cursorOffset },
  });
  ctx.view.focus();
}

/** Delete the "/query" range and return the caret to where it was. */
export function clearRange(ctx: SlashContext) {
  ctx.view.dispatch({
    changes: { from: ctx.from, to: ctx.to, insert: '' },
    selection: { anchor: ctx.from },
  });
  ctx.view.focus();
}

const TABLE_SNIPPET =
  '| Column | Column |\n| --- | --- |\n| Cell | Cell |\n';

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'h1',
    title: 'Heading 1',
    hint: 'Big section heading',
    keywords: ['h1', 'title', 'heading'],
    icon: TextHOne,
    run: (c) => replaceRange(c, '# '),
  },
  {
    id: 'h2',
    title: 'Heading 2',
    hint: 'Medium heading',
    keywords: ['h2', 'heading', 'subtitle'],
    icon: TextHTwo,
    run: (c) => replaceRange(c, '## '),
  },
  {
    id: 'h3',
    title: 'Heading 3',
    hint: 'Small heading',
    keywords: ['h3', 'heading'],
    icon: TextHThree,
    run: (c) => replaceRange(c, '### '),
  },
  {
    id: 'quote',
    title: 'Quote',
    hint: 'Capture a quotation',
    keywords: ['quote', 'blockquote', 'callout'],
    icon: Quotes,
    run: (c) => replaceRange(c, '> '),
  },
  {
    id: 'bullets',
    title: 'Bulleted list',
    hint: 'A simple bullet list',
    keywords: ['bullet', 'list', 'unordered', 'ul'],
    icon: ListBullets,
    run: (c) => replaceRange(c, '- '),
  },
  {
    id: 'numbers',
    title: 'Numbered list',
    hint: 'A list with ordering',
    keywords: ['number', 'ordered', 'list', 'ol'],
    icon: ListNumbers,
    run: (c) => replaceRange(c, '1. '),
  },
  {
    id: 'code',
    title: 'Code block',
    hint: 'Fenced code with syntax',
    keywords: ['code', 'snippet', 'pre', 'fence'],
    icon: Code,
    // Caret lands on the empty middle line.
    run: (c) => replaceRange(c, '```\n\n```\n', 4),
  },
  {
    id: 'table',
    title: 'Table',
    hint: 'Insert a markdown table',
    keywords: ['table', 'grid', 'rows'],
    icon: Table,
    // Caret lands on the first header cell ("| " = 2 chars).
    run: (c) => replaceRange(c, TABLE_SNIPPET, 2),
  },
  {
    id: 'divider',
    title: 'Divider',
    hint: 'A horizontal rule',
    keywords: ['divider', 'hr', 'rule', 'separator'],
    icon: Minus,
    run: (c) => replaceRange(c, '\n---\n'),
  },
  {
    id: 'link',
    title: 'Link',
    hint: 'Insert a link',
    keywords: ['link', 'url', 'href', 'anchor'],
    icon: LinkSimple,
    // Caret sits inside the [text] so the label can be typed immediately.
    run: (c) => replaceRange(c, '[](url)', 1),
  },
  {
    id: 'media',
    title: 'Media',
    hint: 'Choose from your library',
    keywords: ['media', 'image', 'library', 'photo', 'picture'],
    icon: Images,
    run: (c) => c.openMedia(),
  },
  {
    id: 'image',
    title: 'Upload image',
    hint: 'Pick a file from your computer',
    keywords: ['image', 'upload', 'file', 'photo', 'picture'],
    icon: ImageIcon,
    run: (c) => c.openImageUpload(),
  },
];

/** Filter commands by a slash query against title + keywords. */
export function filterCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      c.keywords.some((k) => k.includes(q)),
  );
}
