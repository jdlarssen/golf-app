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
        onClear={() => {}}
        onClose={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders 4 buttons for par=4: par-2, par-1, par, X', () => {
    render(
      <SpecificValueSheet
        open={true}
        par={4}
        onPick={() => {}}
        onClear={() => {}}
        onClose={() => {}}
      />,
    );
    const buttons = screen
      .getByTestId('specific-value-sheet')
      .querySelectorAll('button');
    expect(buttons.length).toBe(4);
    const texts = Array.from(buttons).map((b) => b.textContent);
    expect(texts).toEqual(['2', '3', '4', 'X']);
  });

  it('renders 4 buttons for par=3: 1, 2, 3, X (1 is hole-in-one)', () => {
    render(
      <SpecificValueSheet
        open={true}
        par={3}
        onPick={() => {}}
        onClear={() => {}}
        onClose={() => {}}
      />,
    );
    const buttons = screen
      .getByTestId('specific-value-sheet')
      .querySelectorAll('button');
    expect(buttons.length).toBe(4);
    const texts = Array.from(buttons).map((b) => b.textContent);
    expect(texts).toEqual(['1', '2', '3', 'X']);
  });

  it('filters out values < 1 (par=2 → 3 buttons: 1, 2, X)', () => {
    render(
      <SpecificValueSheet
        open={true}
        par={2}
        onPick={() => {}}
        onClear={() => {}}
        onClose={() => {}}
      />,
    );
    const buttons = screen
      .getByTestId('specific-value-sheet')
      .querySelectorAll('button');
    expect(buttons.length).toBe(3);
    const texts = Array.from(buttons).map((b) => b.textContent);
    expect(texts).toEqual(['1', '2', 'X']);
  });

  it('clicking a number button calls onPick(value) then onClose', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      <SpecificValueSheet
        open={true}
        par={4}
        onPick={onPick}
        onClear={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sett score til 3' }));
    expect(onPick).toHaveBeenCalledWith(3);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking X calls onClear then onClose', () => {
    const onClear = vi.fn();
    const onClose = vi.fn();
    const onPick = vi.fn();
    render(
      <SpecificValueSheet
        open={true}
        par={4}
        onPick={onPick}
        onClear={onClear}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fjern score' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('backdrop click calls onClose', () => {
    const onClose = vi.fn();
    render(
      <SpecificValueSheet
        open={true}
        par={4}
        onPick={() => {}}
        onClear={() => {}}
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
        onClear={() => {}}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('each number button has aria-label "Sett score til N"', () => {
    render(
      <SpecificValueSheet
        open={true}
        par={4}
        onPick={() => {}}
        onClear={() => {}}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Sett score til 4' }),
    ).toBeInTheDocument();
  });
});
