import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BottomActionBar } from './BottomActionBar';

describe('BottomActionBar', () => {
  it('disabled renders a <button> with disabled attribute', () => {
    render(<BottomActionBar label="Tast inn scoren din" disabled={true} />);
    const btn = screen.getByRole('button', { name: 'Tast inn scoren din' });
    expect(btn.tagName).toBe('BUTTON');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect((btn as HTMLButtonElement).style.background).toBe('var(--disabled-bg)');
    expect((btn as HTMLButtonElement).style.color).toBe('var(--disabled-fg)');
  });

  it('enabled + href renders an anchor with the href', () => {
    render(
      <BottomActionBar label="Neste hull · 8" href="/games/g1/holes/8" />,
    );
    const link = screen.getByRole('link', { name: 'Neste hull · 8' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/games/g1/holes/8');
  });

  it('enabled without href falls back to a <button>', () => {
    render(<BottomActionBar label="Lever scorekort" />);
    const btn = screen.getByRole('button', { name: 'Lever scorekort' });
    expect(btn.tagName).toBe('BUTTON');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});
