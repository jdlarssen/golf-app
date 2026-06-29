import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RowReactions } from './RowReactions';

function props(
  overrides: Partial<React.ComponentProps<typeof RowReactions>> = {},
): React.ComponentProps<typeof RowReactions> {
  return {
    counts: { '🔥': 3, '👏': 1 },
    mine: ['🔥'],
    onToggle: vi.fn(),
    disabled: false,
    ...overrides,
  };
}

function buttonFor(emoji: string): HTMLElement {
  const btn = screen
    .getAllByRole('button')
    .find((b) => b.textContent?.includes(emoji));
  if (!btn) throw new Error(`no button for ${emoji}`);
  return btn;
}

describe('RowReactions (controlled)', () => {
  it('renders all 6 palette emoji buttons with counts > 0 shown', () => {
    render(<RowReactions {...props()} />);
    expect(screen.getAllByRole('button')).toHaveLength(6);
    // 🔥 has count 3, 👏 has count 1; emojis without a count show no number.
    expect(buttonFor('🔥').textContent).toContain('3');
    expect(buttonFor('👏').textContent).toContain('1');
    expect(buttonFor('😂').textContent).not.toMatch(/\d/);
  });

  it('marks the viewer’s own reactions active via aria-pressed', () => {
    render(<RowReactions {...props()} />);
    expect(buttonFor('🔥').getAttribute('aria-pressed')).toBe('true'); // in `mine`
    expect(buttonFor('👏').getAttribute('aria-pressed')).toBe('false');
  });

  it('bubbles the tapped emoji up through onToggle', () => {
    const onToggle = vi.fn();
    render(<RowReactions {...props({ onToggle })} />);
    fireEvent.click(buttonFor('👏'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('👏');
  });

  it('disables every button and emits nothing when disabled', () => {
    const onToggle = vi.fn();
    render(<RowReactions {...props({ disabled: true, onToggle })} />);
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
    fireEvent.click(buttonFor('🔥'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
