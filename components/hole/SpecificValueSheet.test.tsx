import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpecificValueSheet } from './SpecificValueSheet';

describe('SpecificValueSheet', () => {
  it('returns null when open=false', () => {
    const { container } = render(
      <SpecificValueSheet
        open={false}
        par={4}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders 8 buttons for par=4 with values 2..9', () => {
    render(
      <SpecificValueSheet
        open={true}
        par={4}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    const buttons = screen
      .getByTestId('specific-value-sheet')
      .querySelectorAll('button');
    expect(buttons.length).toBe(8);
    const texts = Array.from(buttons).map((b) => b.textContent);
    expect(texts).toEqual(['2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('renders 8 buttons for par=3 (values 1..8 — 1 is hole-in-one, valid)', () => {
    render(
      <SpecificValueSheet
        open={true}
        par={3}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    const buttons = screen
      .getByTestId('specific-value-sheet')
      .querySelectorAll('button');
    expect(buttons.length).toBe(8);
    const texts = Array.from(buttons).map((b) => b.textContent);
    expect(texts).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('filters out values < 1 (par=2 → 7 buttons starting at 1)', () => {
    render(
      <SpecificValueSheet
        open={true}
        par={2}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    const buttons = screen
      .getByTestId('specific-value-sheet')
      .querySelectorAll('button');
    expect(buttons.length).toBe(7);
    const texts = Array.from(buttons).map((b) => b.textContent);
    expect(texts).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('clicking a button calls onPick(value) then onClose', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <SpecificValueSheet
        open={true}
        par={4}
        onPick={onPick}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sett score til 6' }));
    expect(onPick).toHaveBeenCalledWith(6);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop click calls onClose', () => {
    const onClose = vi.fn();
    render(
      <SpecificValueSheet
        open={true}
        par={4}
        onPick={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('specific-value-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pressing Escape calls onClose', () => {
    const onClose = vi.fn();
    render(
      <SpecificValueSheet
        open={true}
        par={4}
        onPick={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('each value button has aria-label "Sett score til N"', () => {
    render(
      <SpecificValueSheet
        open={true}
        par={4}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Sett score til 4' }),
    ).toBeInTheDocument();
  });
});
