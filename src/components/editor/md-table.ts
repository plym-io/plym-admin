/**
 * A markdown pipe table, as data. The editor renders tables as a real grid
 * (see table-widget), but the document stays markdown — so every edit is a
 * parse → mutate → serialise round trip through here. Keeping that logic
 * pure keeps it testable and keeps the widget about DOM only.
 */

export type Align = 'none' | 'left' | 'center' | 'right';

export interface TableModel {
  header: string[];
  align: Align[];
  /** Body rows, each already padded to `header.length`. */
  rows: string[][];
}

const DELIM_CELL = /^:?-+:?$/;

/** Split one `| a | b |` line into trimmed cells, honouring `\|` escapes. */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);

  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  return 'none';
}

function fit<T>(row: T[], width: number, filler: T): T[] {
  const out = row.slice(0, width);
  while (out.length < width) out.push(filler);
  return out;
}

/** Parse a table's source, or null when it isn't one (no delimiter row). */
export function parseTable(src: string): TableModel | null {
  const lines = src.split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length < 2) return null;

  const delim = splitRow(lines[1]);
  if (delim.length === 0 || !delim.every((c) => DELIM_CELL.test(c))) return null;

  const header = splitRow(lines[0]);
  const body = lines.slice(2).map(splitRow);
  // Widen rather than truncate: GFM drops cells past the header, but silently
  // deleting someone's text on a re-serialise would be worse than a wide table.
  const width = Math.max(
    1,
    header.length,
    delim.length,
    ...body.map((r) => r.length),
  );

  return {
    header: fit(header, width, ''),
    align: fit(delim.map(alignOf), width, 'none'),
    rows: body.map((r) => fit(r, width, '')),
  };
}

function escapeCell(cell: string): string {
  return cell.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function delimCell(align: Align, width: number): string {
  const colons = align === 'center' ? 2 : align === 'none' ? 0 : 1;
  const dashes = '-'.repeat(Math.max(3, width - colons));
  if (align === 'center') return `:${dashes}:`;
  if (align === 'left') return `:${dashes}`;
  if (align === 'right') return `${dashes}:`;
  return dashes;
}

/**
 * Back to markdown, with the columns padded so the source stays readable in
 * markdown mode (the whole point of writing tables by hand).
 */
export function serializeTable(m: TableModel): string {
  const width = m.header.length;
  const header = m.header.map(escapeCell);
  const rows = m.rows.map((r) => fit(r, width, '').map(escapeCell));

  const widths = header.map((cell, i) =>
    Math.max(3, cell.length, ...rows.map((r) => r[i].length)),
  );
  const line = (cells: string[]) =>
    `| ${cells.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`;

  return [
    line(header),
    line(m.align.map((a, i) => delimCell(a, widths[i]))),
    ...rows.map(line),
  ].join('\n');
}

/** Header cells are row `-1`; body rows count from 0. */
export const HEADER_ROW = -1;

export function setCell(
  m: TableModel,
  row: number,
  col: number,
  value: string,
): TableModel {
  if (row === HEADER_ROW) {
    const header = m.header.slice();
    header[col] = value;
    return { ...m, header };
  }
  const rows = m.rows.map((r, i) =>
    i === row ? r.map((c, j) => (j === col ? value : c)) : r,
  );
  return { ...m, rows };
}

/** Insert an empty column at `at` (== width appends). */
export function addColumn(m: TableModel, at: number): TableModel {
  const insert = <T>(arr: T[], v: T) => {
    const out = arr.slice();
    out.splice(at, 0, v);
    return out;
  };
  return {
    header: insert(m.header, ''),
    align: insert(m.align, 'none'),
    rows: m.rows.map((r) => insert(r, '')),
  };
}

/** Drop a column. A table always keeps at least one. */
export function removeColumn(m: TableModel, at: number): TableModel {
  if (m.header.length <= 1) return m;
  const drop = <T>(arr: T[]) => arr.filter((_, i) => i !== at);
  return {
    header: drop(m.header),
    align: drop(m.align),
    rows: m.rows.map(drop),
  };
}

/** Insert an empty body row at `at` (== rows.length appends). */
export function addRow(m: TableModel, at: number): TableModel {
  const rows = m.rows.slice();
  rows.splice(at, 0, m.header.map(() => ''));
  return { ...m, rows };
}

export function removeRow(m: TableModel, at: number): TableModel {
  return { ...m, rows: m.rows.filter((_, i) => i !== at) };
}

/** A fresh 2×2 table, used by the "/table" command and the toolbar. */
export function blankTable(cols = 2, rows = 2): string {
  return serializeTable({
    header: Array.from({ length: cols }, () => ''),
    align: Array.from({ length: cols }, () => 'none' as Align),
    rows: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ''),
    ),
  });
}
