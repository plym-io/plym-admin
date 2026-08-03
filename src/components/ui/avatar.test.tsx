import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Avatar, initials } from './avatar';

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Sam Rivera')).toBe('SR');
    expect(initials('Prince')).toBe('P');
    expect(initials('ada lovelace byron')).toBe('AL');
  });

  it('copes with extra whitespace', () => {
    expect(initials('  Sam   Rivera  ')).toBe('SR');
  });

  it('falls back rather than rendering nothing', () => {
    expect(initials('')).toBe('?');
    expect(initials(null)).toBe('?');
    expect(initials(undefined)).toBe('?');
  });
});

describe('Avatar', () => {
  it('shows the picture when there is one', () => {
    render(<Avatar src="https://example.com/a.png" name="Sam Rivera" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/a.png');
    expect(screen.queryByText('SR')).toBeNull();
  });

  it('shows initials when there is no picture', () => {
    render(<Avatar name="Sam Rivera" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('SR')).toBeInTheDocument();
  });

  it('falls back to initials when the picture fails to load', () => {
    // The case a bare <img> renders as a broken-image icon: the URL is set,
    // but nothing is there.
    render(<Avatar src="https://example.com/gone.png" name="Sam Rivera" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('SR')).toBeInTheDocument();
  });
});
