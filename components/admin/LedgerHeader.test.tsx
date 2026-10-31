import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LedgerHeader } from './LedgerHeader';

describe('LedgerHeader', () => {
  it('rendrer venstre- og høyre-label', () => {
    render(
      <LedgerHeader
        leftLabel="Spill"
        rightLabel="Status"
        gridTemplateColumns="1fr 84px 14px"
      />,
    );
    expect(screen.getByText('Spill')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('propagerer gridTemplateColumns til container', () => {
    const { container } = render(
      <LedgerHeader
        leftLabel="Bane"
        rightLabel="Tees"
        gridTemplateColumns="1fr 64px 14px"
      />,
    );
    const headerDiv = container.querySelector('div');
    expect(headerDiv?.style.gridTemplateColumns).toBe('1fr 64px 14px');
  });

  it('setter kolonnetitlene som 12 px semibold i setningsstor bokstav, uten sperring (#2728)', () => {
    const { container } = render(
      <LedgerHeader
        leftLabel="Spill"
        rightLabel="Status"
        gridTemplateColumns="1fr 84px 14px"
      />,
    );
    const leftSpan = screen.getByText('Spill');
    expect(leftSpan.className).toContain('text-xs');
    expect(leftSpan.className).toContain('font-semibold');
    expect(leftSpan.className).not.toContain('uppercase');
    expect(leftSpan.className).not.toContain('tracking-');
    expect(leftSpan.style.letterSpacing).toBe('');
    const headerDiv = container.querySelector('div');
    expect(headerDiv?.style.background).toContain('var(--surface-strong)');
  });
});
