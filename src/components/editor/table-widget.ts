import { syntaxTree } from '@codemirror/language';
import {
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';
import {
  HEADER_ROW,
  addColumn,
  addRow,
  blankTable,
  parseTable,
  removeColumn,
  removeRow,
  serializeTable,
  setCell,
  type TableModel,
} from './md-table';

/**
 * Markdown tables, rendered as a table. The document still holds the pipes —
 * every keystroke in a cell re-serialises the whole block back into the doc —
 * but what you see and edit is a grid with buttons for adding and removing
 * columns and rows.
 *
 * The widget is a *block replace* decoration, which CodeMirror only accepts
 * from a state field (the viewport is measured before view plugins run), so
 * this ships its own field rather than living in live-preview's ViewPlugin.
 *
 * Put the caret inside a table's source and the widget steps aside so the raw
 * markdown can be edited. Clicking a cell doesn't move the caret (widget DOM
 * is uneditable as far as CodeMirror is concerned), so the grid stays put
 * while you type in it.
 */

/** Where to put focus after a rebuild — set by the edits that add cells. */
let pendingFocus: { row: number; col: number } | null = null;

/** Focus the first header cell of the next table the editor draws. */
function focusNewTable() {
  pendingFocus = { row: HEADER_ROW, col: 0 };
  // The request belongs to the update it was made for; if nothing draws a
  // table (markdown mode, say), it lapses rather than stealing focus later.
  setTimeout(() => {
    pendingFocus = null;
  }, 0);
}

/**
 * Drop a fresh table over [from, to), on its own block. The blank lines
 * matter: markdown keeps reading rows until one, so without the trailing gap
 * the next sentence you type becomes another row of the table.
 */
export function insertTable(view: EditorView, from: number, to: number) {
  const { state } = view;
  const line = state.doc.lineAt(from);
  const openLine = state.sliceDoc(line.from, from).trim() !== '';
  const prevUsed =
    line.number > 1 && state.doc.line(line.number - 1).text.trim() !== '';
  const lead = openLine ? '\n\n' : prevUsed ? '\n' : '';
  const text = `${lead}${blankTable()}\n\n`;
  focusNewTable();
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  });
  view.focus();
}

function selectionTouches(state: EditorState, from: number, to: number) {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

/** The table node covering `pos`, looked up fresh so edits never use stale offsets. */
function tableRangeAt(
  state: EditorState,
  pos: number,
): { from: number; to: number } | null {
  const resolved = syntaxTree(state).resolveInner(pos, 1);
  let node: typeof resolved | null = resolved;
  while (node && node.name !== 'Table') node = node.parent;
  return node ? { from: node.from, to: node.to } : null;
}

function icon(label: string, glyph: string, cls: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = glyph;
  b.title = label;
  b.setAttribute('aria-label', label);
  // Keep Tab moving between cells, not through every control.
  b.tabIndex = -1;
  return b;
}

export class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }

  eq(other: TableWidget) {
    return other.source === this.source;
  }

  toDOM(view: EditorView) {
    const dom = document.createElement('div');
    dom.className = 'cm-md-table-wrap';
    this.paint(dom, view);
    return dom;
  }

  updateDOM(dom: HTMLElement, view: EditorView, prev: TableWidget) {
    const before = parseTable(prev.source);
    const after = parseTable(this.source);
    // Same shape? Patch the values in place so the cell you're typing in
    // keeps focus and caret. Otherwise redraw — a row or column moved.
    if (
      before &&
      after &&
      before.header.length === after.header.length &&
      before.rows.length === after.rows.length
    ) {
      this.sync(dom, after);
    } else {
      this.paint(dom, view);
    }
    return true;
  }

  /** CodeMirror handles all events in here; the widget wires its own. */
  ignoreEvent() {
    return true;
  }

  get estimatedHeight() {
    return (this.source.split('\n').length + 1) * 34;
  }

  private inputs(dom: HTMLElement) {
    return Array.from(
      dom.querySelectorAll<HTMLInputElement>('input.cm-md-tcell'),
    );
  }

  private sync(dom: HTMLElement, model: TableModel) {
    const values = [...model.header, ...model.rows.flat()];
    this.inputs(dom).forEach((input, i) => {
      const next = values[i] ?? '';
      if (input !== document.activeElement && input.value !== next) {
        input.value = next;
      }
    });
  }

  private paint(dom: HTMLElement, view: EditorView) {
    const model = parseTable(this.source);
    if (!model) return;
    dom.textContent = '';

    /** Read the table fresh from the doc, mutate it, write it back. */
    const edit = (mutate: (m: TableModel) => TableModel) => {
      const pos = view.posAtDOM(dom);
      const range = tableRangeAt(view.state, pos);
      if (!range) return;
      const current = parseTable(
        view.state.doc.sliceString(range.from, range.to),
      );
      if (!current) return;
      view.dispatch({
        changes: {
          from: range.from,
          to: range.to,
          insert: serializeTable(mutate(current)),
        },
      });
    };

    const cell = (row: number, col: number, value: string, header: boolean) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'cm-md-tcell';
      input.value = value;
      input.placeholder = header ? 'Column' : '';
      input.style.textAlign =
        model.align[col] === 'center'
          ? 'center'
          : model.align[col] === 'right'
            ? 'right'
            : 'left';
      input.addEventListener('input', () =>
        edit((m) => setCell(m, row, col, input.value)),
      );
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          view.focus();
        }
      });
      if (
        pendingFocus &&
        pendingFocus.row === row &&
        pendingFocus.col === col
      ) {
        pendingFocus = null;
        setTimeout(() => input.focus(), 0);
      }
      return input;
    };

    const table = document.createElement('table');
    table.className = 'cm-md-table-el';

    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    model.header.forEach((value, col) => {
      const th = document.createElement('th');
      th.appendChild(cell(HEADER_ROW, col, value, true));
      const del = icon('Remove this column', '×', 'cm-md-tbtn cm-md-tcol-del');
      del.addEventListener('click', () => edit((m) => removeColumn(m, col)));
      th.appendChild(del);
      headRow.appendChild(th);
    });
    const addColTh = document.createElement('th');
    addColTh.className = 'cm-md-tadd-col';
    const addCol = icon('Add a column', '+', 'cm-md-tbtn');
    addCol.addEventListener('click', () => {
      pendingFocus = { row: HEADER_ROW, col: model.header.length };
      edit((m) => addColumn(m, m.header.length));
    });
    addColTh.appendChild(addCol);
    headRow.appendChild(addColTh);
    head.appendChild(headRow);
    table.appendChild(head);

    const body = document.createElement('tbody');
    model.rows.forEach((row, r) => {
      const tr = document.createElement('tr');
      row.forEach((value, col) => {
        const td = document.createElement('td');
        td.appendChild(cell(r, col, value, false));
        tr.appendChild(td);
      });
      const controls = document.createElement('td');
      controls.className = 'cm-md-trow-ctl';
      const del = icon('Remove this row', '×', 'cm-md-tbtn');
      del.addEventListener('click', () => edit((m) => removeRow(m, r)));
      controls.appendChild(del);
      tr.appendChild(controls);
      body.appendChild(tr);
    });
    table.appendChild(body);
    dom.appendChild(table);

    const addRowBtn = document.createElement('button');
    addRowBtn.type = 'button';
    addRowBtn.className = 'cm-md-tadd-row';
    addRowBtn.textContent = '+ Row';
    addRowBtn.tabIndex = -1;
    addRowBtn.addEventListener('click', () => {
      pendingFocus = { row: model.rows.length, col: 0 };
      edit((m) => addRow(m, m.rows.length));
    });
    dom.appendChild(addRowBtn);
  }
}

/** True when this table is drawn as a grid (so live-preview leaves it alone). */
export function tableIsRendered(
  state: EditorState,
  from: number,
  to: number,
): boolean {
  return !selectionTouches(state, from, to) && parseTable(state.doc.sliceString(from, to)) !== null;
}

/** Block nodes a table can nest inside — everything else is skipped whole. */
const CONTAINERS = new Set([
  'Document',
  'Blockquote',
  'BulletList',
  'OrderedList',
  'ListItem',
]);

function buildTables(state: EditorState): DecorationSet {
  const decos: Range<Decoration>[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== 'Table') return CONTAINERS.has(node.name) ? undefined : false;
      if (!tableIsRendered(state, node.from, node.to)) return false;
      decos.push(
        Decoration.replace({
          widget: new TableWidget(state.doc.sliceString(node.from, node.to)),
          block: true,
        }).range(node.from, node.to),
      );
      return false;
    },
  });
  return Decoration.set(decos, true);
}

/**
 * Block widgets have to come from a state field, so tables get their own —
 * registered alongside live-preview's plugin in rich mode only.
 */
export const tablePreview: Extension = StateField.define<DecorationSet>({
  create: buildTables,
  update: (decos, tr) =>
    // The tree check matters: markdown further down the document finishes
    // parsing in a transaction that changes neither doc nor selection.
    tr.docChanged ||
    tr.selection ||
    syntaxTree(tr.state) !== syntaxTree(tr.startState)
      ? buildTables(tr.state)
      : decos,
  provide: (f) => EditorView.decorations.from(f),
});
