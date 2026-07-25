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

/** The palette trigger is the only button that carries no emoji glyph. */
function trigger(): HTMLElement {
  return screen.getByRole('button', { expanded: false });
}

/** True when some rendered button shows the given emoji glyph. */
function hasButtonFor(emoji: string): boolean {
  return screen.getAllByRole('button').some((b) => b.textContent?.includes(emoji));
}

describe('RowReactions (compact, #1293)', () => {
  it('collapsed default with no reactions renders exactly one button (the trigger)', () => {
    render(<RowReactions {...props({ counts: {}, mine: [] })} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('collapsed view shows only given reactions as chips (with counts) plus the trigger', () => {
    render(<RowReactions {...props()} />);
    // 🔥 (3) and 👏 (1) are chips; 😂/💪/⛳/🐦 (count 0) are hidden until expanded.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3); // two chips + trigger
    expect(buttonFor('🔥').textContent).toContain('3');
    expect(buttonFor('👏').textContent).toContain('1');
    expect(hasButtonFor('😂')).toBe(false); // count 0 → hidden until expanded
    // Own reaction marked active.
    expect(buttonFor('🔥').getAttribute('aria-pressed')).toBe('true');
    expect(buttonFor('👏').getAttribute('aria-pressed')).toBe('false');
  });

  it('tapping a chip toggles it directly without opening the palette', () => {
    const onToggle = vi.fn();
    render(<RowReactions {...props({ onToggle })} />);
    fireEvent.click(buttonFor('🔥'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('🔥');
    // Palette stayed closed — the hidden 😂 is still absent.
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('tapping the trigger reveals all 6 palette emojis at ≥44px', () => {
    render(<RowReactions {...props()} />);
    fireEvent.click(trigger());
    for (const emoji of ['👏', '🔥', '😂', '💪', '⛳', '🐦']) {
      const btn = buttonFor(emoji);
      expect(btn.className).toContain('min-h-[44px]');
      expect(btn.className).toContain('min-w-[44px]');
    }
    // 6 palette buttons + the trigger (now a close button).
    expect(screen.getAllByRole('button')).toHaveLength(7);
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy();
  });

  it('picking an emoji from the palette toggles it and collapses back to chips', () => {
    const onToggle = vi.fn();
    render(<RowReactions {...props({ onToggle })} />);
    fireEvent.click(trigger());
    fireEvent.click(buttonFor('😂')); // an emoji with no prior count
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('😂');
    // Collapsed again: 😂 (count still 0 from props) is gone, back to two chips + trigger.
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('re-tapping the trigger collapses without toggling anything', () => {
    const onToggle = vi.fn();
    render(<RowReactions {...props({ onToggle })} />);
    fireEvent.click(trigger()); // open
    fireEvent.click(screen.getByRole('button', { expanded: true })); // close
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('disabled: chips stay visible, every button is disabled, and the palette cannot open', () => {
    const onToggle = vi.fn();
    render(<RowReactions {...props({ disabled: true, onToggle })} />);
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
    // Chips are still there for readable history.
    expect(buttonFor('🔥')).toBeTruthy();
    // Trigger click does nothing — palette stays closed, no toggle fires.
    fireEvent.click(buttonFor('🔥'));
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(onToggle).not.toHaveBeenCalled();
    expect(hasButtonFor('😂')).toBe(false); // palette never opened
  });
});
