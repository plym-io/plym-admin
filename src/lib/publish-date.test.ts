import { describe, it, expect, afterEach } from 'vitest';
import { toInputValue, fromInputValue, renderedDate } from './publish-date';

const originalTz = process.env.TZ;

/**
 * Run a block as if the author's machine were in `tz`. The helpers exist to
 * keep the field on UTC, so every guarantee below has to hold from a zone that
 * would visibly break a local-time implementation — Kiritimati (+14) and
 * Midway (-11) sit on opposite sides of the date line.
 */
function inTimezone(tz: string, assertions: () => void): void {
  process.env.TZ = tz;
  try {
    assertions();
  } finally {
    process.env.TZ = originalTz;
  }
}

afterEach(() => {
  process.env.TZ = originalTz;
});

describe('toInputValue', () => {
  it('renders the UTC wall clock of the stored instant', () => {
    expect(toInputValue('2020-01-15T09:30:00Z')).toBe('2020-01-15T09:30');
  });

  it('maps null and empty to a blank input', () => {
    expect(toInputValue(null)).toBe('');
    expect(toInputValue('')).toBe('');
  });

  it('maps an unparseable timestamp to a blank input', () => {
    expect(toInputValue('not-a-date')).toBe('');
  });

  it('zero-pads month, day, hour and minute', () => {
    expect(toInputValue('2019-03-04T07:05:00Z')).toBe('2019-03-04T07:05');
  });

  it('honours the offset in a non-UTC timestamp', () => {
    expect(toInputValue('2019-03-04T12:00:00+02:00')).toBe('2019-03-04T10:00');
  });

  it('keeps the UTC day from a zone that is a day ahead', () => {
    inTimezone('Pacific/Kiritimati', () => {
      expect(toInputValue('2019-03-04T23:30:00Z')).toBe('2019-03-04T23:30');
    });
  });

  it('keeps the UTC day from a zone that is a day behind', () => {
    inTimezone('Pacific/Midway', () => {
      expect(toInputValue('2019-03-04T00:30:00Z')).toBe('2019-03-04T00:30');
    });
  });
});

describe('fromInputValue', () => {
  it('reads the typed wall clock as UTC', () => {
    expect(fromInputValue('2020-01-15T09:30')).toBe('2020-01-15T09:30:00Z');
  });

  it('keeps seconds when the input carries them', () => {
    expect(fromInputValue('2020-01-15T09:30:45')).toBe('2020-01-15T09:30:45Z');
  });

  it('maps a blank input to null (clears the date)', () => {
    expect(fromInputValue('')).toBeNull();
    expect(fromInputValue('   ')).toBeNull();
  });

  it('maps a half-formed value to null rather than a wrong date', () => {
    expect(fromInputValue('2020-01-15')).toBeNull();
    expect(fromInputValue('nonsense')).toBeNull();
  });

  it('reads the same instant regardless of the machine zone', () => {
    inTimezone('Pacific/Kiritimati', () => {
      expect(fromInputValue('2019-03-04T00:00')).toBe('2019-03-04T00:00:00Z');
    });
    inTimezone('Pacific/Midway', () => {
      expect(fromInputValue('2019-03-04T00:00')).toBe('2019-03-04T00:00:00Z');
    });
  });

  it('round-trips through toInputValue without drifting', () => {
    const stored = '2019-03-04T12:00:00Z';
    expect(fromInputValue(toInputValue(stored))).toBe(stored);
  });
});

describe('renderedDate', () => {
  it('matches the %B %d, %Y the post template renders', () => {
    expect(renderedDate('2019-03-04T12:00:00Z')).toBe('March 04, 2019');
  });

  it('zero-pads the day like strftime does', () => {
    expect(renderedDate('2020-01-05T00:00:00Z')).toBe('January 05, 2020');
  });

  it('is blank for a missing or unparseable date', () => {
    expect(renderedDate(null)).toBe('');
    expect(renderedDate('not-a-date')).toBe('');
  });

  it('names the UTC day even near midnight in a far-off zone', () => {
    inTimezone('Pacific/Midway', () => {
      expect(renderedDate('2019-03-04T00:30:00Z')).toBe('March 04, 2019');
    });
    inTimezone('Pacific/Kiritimati', () => {
      expect(renderedDate('2019-03-04T23:30:00Z')).toBe('March 04, 2019');
    });
  });
});
