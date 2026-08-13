import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

  it('renders every stroke 1–15 plus X, and marks the par button', () => {
    render(
      <SpecificValueSheet
        open={true}
        par={4}
        onPick={() => {}}
        onClear={() => {}}
        onClose={() => {}}
      />,
    );
    const buttons = Array.from(
      screen.getByTestId('specific-value-sheet').querySelectorAll('button'),
    );
    expect(buttons.length).toBe(16);
    expect(buttons.map((b) => b.textContent)).toEqual([
      ...Array.from({ length: 15 }, (_, i) => String(i + 1)),
      'X',
    ]);
    // The par button is marked visually only — no aria/text difference.
    const parButton = buttons[3];
    const bogeyButton = buttons[4];
    expect(parButton.textContent).toBe('4');
    expect(parButton.style.background).not.toBe(bogeyButton.style.background);
    expect(parButton.style.border).not.toBe(bogeyButton.style.border);
  });

  it('offers the same buttons regardless of par', () => {
    const textsFor = (par: number) => {
      const { unmount } = render(
        <SpecificValueSheet
          open={true}
          par={par}
          onPick={() => {}}
          onClear={() => {}}
          onClose={() => {}}
        />,
      );
      const texts = Array.from(
        screen.getByTestId('specific-value-sheet').querySelectorAll('button'),
      ).map((b) => b.textContent);
      unmount();
      return texts;
    };
    const parThree = textsFor(3);
    expect(parThree.length).toBe(16);
    expect(textsFor(4)).toEqual(parThree);
    expect(textsFor(5)).toEqual(parThree);
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

  it('flytter fokus inn i arket ved åpning og tilbake til ⋯-knappen ved lukking', () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button type="button" data-testid="trigger">
            ⋯
          </button>
          <SpecificValueSheet
            open={open}
            par={4}
            onPick={() => {}}
            onClear={() => {}}
            onClose={() => {}}
          />
        </>
      );
    }

    const { rerender } = render(<Harness open={false} />);
    act(() => screen.getByTestId('trigger').focus());

    rerender(<Harness open={true} />);
    expect(
      screen.getByRole('button', { name: 'Sett score til 1' }),
    ).toHaveFocus();

    rerender(<Harness open={false} />);
    expect(screen.getByTestId('trigger')).toHaveFocus();
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
