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
  ImagesSquare,
  Note,
  Warning,
  Lightbulb,
  Browsers,
  type Icon,
} from '@phosphor-icons/react';
import { blockLead } from './format-commands';

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

import { insertTable } from './table-widget';

/** Where the caret should land in a block template. Stripped before insertion. */
const CARET = '‸';

/**
 * Drop a multi-line construct in as its own block, wherever the "/" was typed,
 * and put the caret where the template asks for it.
 */
function insertBlock(ctx: SlashContext, template: string) {
  const lead = blockLead(ctx.view.state, ctx.from);
  const at = template.indexOf(CARET);
  const insert = lead + template.replace(CARET, '');
  replaceRange(ctx, insert, at === -1 ? insert.length : lead.length + at);
}

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
    hint: 'Rows, columns, editable in place',
    keywords: ['table', 'grid', 'rows', 'columns'],
    icon: Table,
    // The caret lands *after* the table so it renders as a grid straight
    // away; focus then goes to its first header cell.
    run: (c) => insertTable(c.view, c.from, c.to),
  },
  // plym's block extensions. Three of the nine admonition names are offered
  // here — the rest are the same construct with a different word, and nine
  // near-identical rows would bury everything else in this menu.
  {
    id: 'note',
    title: 'Note',
    hint: 'A callout beside the text',
    keywords: ['note', 'callout', 'admonition', 'aside', 'info'],
    icon: Note,
    run: (c) => insertBlock(c, `:::note\n${CARET}\n:::\n`),
  },
  {
    id: 'warning',
    title: 'Warning',
    hint: 'A callout that says be careful',
    keywords: ['warning', 'alert', 'caution', 'danger'],
    icon: Warning,
    run: (c) => insertBlock(c, `:::warning\n${CARET}\n:::\n`),
  },
  {
    id: 'tip',
    title: 'Tip',
    hint: 'A callout with advice in it',
    keywords: ['tip', 'hint', 'advice'],
    icon: Lightbulb,
    run: (c) => insertBlock(c, `:::tip\n${CARET}\n:::\n`),
  },
  {
    id: 'tabs',
    title: 'Tabs',
    hint: 'One block, switchable panes',
    keywords: ['tabs', 'tabbed', 'panes', 'switch'],
    icon: Browsers,
    run: (c) =>
      insertBlock(
        c,
        `:::tabs\n:::tab First\n${CARET}\n:::\n:::tab Second\n\n:::\n:::\n`,
      ),
  },
  {
    id: 'gallery',
    title: 'Gallery',
    hint: 'A strip of images, one per line',
    keywords: ['gallery', 'images', 'photos', 'strip', 'grid'],
    icon: ImagesSquare,
    run: (c) => insertBlock(c, '```gallery\n' + CARET + '\n```\n'),
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
