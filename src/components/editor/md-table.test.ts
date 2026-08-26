import { describe, expect, it } from 'vitest';
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
  splitRow,
} from './md-table';

const SRC = ['| Name | Role |', '| --- | ---: |', '| Ada | Maths |'].join('\n');

describe('splitRow', () => {
  it('drops the outer pipes and trims', () => {
    expect(splitRow('| a |  b  |')).toEqual(['a', 'b']);
  });

  it('keeps an escaped pipe inside a cell', () => {
    expect(splitRow('| a \\| b | c |')).toEqual(['a | b', 'c']);
  });

  it('reads a row written without outer pipes', () => {
    expect(splitRow('a | b')).toEqual(['a', 'b']);
  });
});

describe('parseTable', () => {
  it('reads header, alignment and rows', () => {
    const m = parseTable(SRC)!;
    expect(m.header).toEqual(['Name', 'Role']);
    expect(m.align).toEqual(['none', 'right']);
    expect(m.rows).toEqual([['Ada', 'Maths']]);
  });

  it('rejects anything without a delimiter row', () => {
    expect(parseTable('| a | b |\n| c | d |')).toBeNull();
    expect(parseTable('just text')).toBeNull();
  });

  it('pads short rows and widens for long ones', () => {
    const m = parseTable('| a |\n| --- |\n| b | extra |')!;
    expect(m.header).toEqual(['a', '']);
    expect(m.rows).toEqual([['b', 'extra']]);
  });
});

describe('serializeTable', () => {
  it('round-trips, padding the columns', () => {
    const out = serializeTable(parseTable(SRC)!);
    expect(out).toBe(
      ['| Name | Role  |', '| ---- | ----: |', '| Ada  | Maths |'].join('\n'),
    );
    expect(parseTable(out)).toEqual(parseTable(SRC));
  });

  it('escapes a pipe typed into a cell', () => {
    const m = setCell(parseTable(SRC)!, 0, 0, 'a|b');
    expect(serializeTable(m)).toContain('a\\|b');
    expect(parseTable(serializeTable(m))!.rows[0][0]).toBe('a|b');
  });
});

describe('mutations', () => {
  const m = parseTable(SRC)!;

  it('sets a header cell', () => {
    expect(setCell(m, HEADER_ROW, 1, 'Field').header).toEqual([
      'Name',
      'Field',
    ]);
  });

  it('adds a column to every row', () => {
    const next = addColumn(m, m.header.length);
    expect(next.header).toEqual(['Name', 'Role', '']);
    expect(next.align).toEqual(['none', 'right', 'none']);
    expect(next.rows).toEqual([['Ada', 'Maths', '']]);
  });

  it('removes a column, but never the last one', () => {
    expect(removeColumn(m, 0).header).toEqual(['Role']);
    expect(removeColumn(removeColumn(m, 0), 0).header).toEqual(['Role']);
  });

  it('adds and removes rows', () => {
    expect(addRow(m, m.rows.length).rows).toEqual([
      ['Ada', 'Maths'],
      ['', ''],
    ]);
    expect(removeRow(m, 0).rows).toEqual([]);
  });
});

describe('blankTable', () => {
  it('parses back as an empty grid of the requested size', () => {
    const m = parseTable(blankTable(3, 1))!;
    expect(m.header).toHaveLength(3);
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]).toEqual(['', '', '']);
  });
});
