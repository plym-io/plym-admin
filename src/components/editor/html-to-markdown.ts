import TurndownService from 'turndown';
import { normaliseOfficeHtml } from './office-html';
import { serializeTable, type Align, type TableModel } from './md-table';

export interface RichPaste {
  markdown: string;
  /** Images the paste could not carry over — reported, never dropped silently. */
  droppedImages: number;
}

/**
 * The markers the rest of the editor writes (see format-commands and
 * slash-commands), so pasted text is indistinguishable from typed text.
 */
const OPTIONS: TurndownService.Options = {
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '_',
  strongDelimiter: '**',
  linkStyle: 'inlined',
};

function alignOf(cell: Element): Align {
  const raw = (cell.getAttribute('align') ?? '').toLowerCase();
  if (raw === 'left' || raw === 'right' || raw === 'center') return raw;
  return 'none';
}

function fit<T>(cells: T[], width: number, filler: T): T[] {
  const out = cells.slice(0, width);
  while (out.length < width) out.push(filler);
  return out;
}

const cellsOf = (row: Element): Element[] =>
  Array.from(row.children).filter((c) => c.tagName === 'TD' || c.tagName === 'TH');

/**
 * Tables go through the editor's own serialiser rather than turndown's, so a
 * pasted table is byte-identical to one the table widget would have written —
 * padded columns and all — and stays editable in the grid.
 */
function tableRule(): TurndownService.Rule {
  // Its own service: a cell holds inline content, never another table, and
  // this keeps the outer conversion from re-entering itself mid-walk.
  const inline = withCommonRules(new TurndownService(OPTIONS));
  const cellText = (cell: Element): string =>
    inline.turndown(cell.innerHTML).replace(/\s*\n\s*/g, ' ').trim();

  return {
    filter: 'table',
    replacement: (_content, node) => {
      const rows = Array.from((node as Element).querySelectorAll('tr'));
      if (rows.length === 0) return '';

      const head = cellsOf(rows[0]);
      const width = Math.max(...rows.map((r) => cellsOf(r).length));

      const model: TableModel = {
        header: fit(head.map(cellText), width, ''),
        align: fit<Align>(head.map(alignOf), width, 'none'),
        rows: rows.slice(1).map((r) => fit(cellsOf(r).map(cellText), width, '')),
      };
      return `\n\n${serializeTable(model)}\n\n`;
    },
  };
}

function withCommonRules(service: TurndownService): TurndownService {
  // Turndown pads its markers to a four-column gutter (`-   item`). The
  // editor's own list commands write `- `, and pasted text should be
  // indistinguishable from typed text.
  service.addRule('listItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      const parent = node.parentNode as Element | null;
      let prefix = `${options.bulletListMarker} `;
      if (parent?.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? 1);
        const index = Array.prototype.indexOf.call(parent.children, node);
        prefix = `${start + index}. `;
      }
      const body = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n')
        .replace(/\n/gm, `\n${' '.repeat(prefix.length)}`);
      const trailing = node.nextSibling && !/\n$/.test(body) ? '\n' : '';
      return prefix + body + trailing;
    },
  });

  service.addRule('strikethrough', {
    filter: ['del', 's'],
    replacement: (content) => (content.trim() ? `~~${content}~~` : content),
  });

  // An empty heading is a formatting artefact, not a section.
  service.addRule('heading', {
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    replacement: (content, node) => {
      const text = content.trim();
      if (!text) return '';
      const level = Number((node as Element).tagName.charAt(1));
      return `\n\n${'#'.repeat(level)} ${text}\n\n`;
    },
  });

  return service;
}

function build(): TurndownService {
  const service = withCommonRules(new TurndownService(OPTIONS));
  service.addRule('table', tableRule());
  return service;
}

/** Rebuilt per call: turndown keeps no state, but neither does it need one alive. */
export function htmlToMarkdown(html: string): RichPaste {
  const { body, droppedImages } = normaliseOfficeHtml(html);
  const markdown = build()
    .turndown(body)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();

  return { markdown, droppedImages };
}

/**
 * Whether the HTML flavour is worth preferring over the plain-text one. A
 * paste that converts to the same characters gains nothing, and the plain
 * path is the one CodeMirror already handles well.
 */
export function isWorthConverting(markdown: string, plain: string): boolean {
  if (markdown === '') return false;
  return markdown.replace(/\s+/g, ' ').trim() !== plain.replace(/\s+/g, ' ').trim();
}
