/**
 * Type C — the one render test for SpectateLiveStatus (#1376).
 *
 * Asserts the single behavior the issue exists for: when the spectator loses
 * the network, the banner stops claiming the numbers are live. Structure and
 * data-testids only — never the Norwegian copy.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { SpectateLiveStatus } from './SpectateLiveStatus';

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

afterEach(() => {
  cleanup();
  setOnLine(true);
});

describe('SpectateLiveStatus', () => {
  it('stops pulsing and changes label when the spectator goes offline', () => {
    render(<SpectateLiveStatus live={true} />);

    const onlineDot = screen.getByTestId('spectate-status-dot');
    expect(onlineDot).toHaveAttribute('data-live', 'online');
    expect(onlineDot.className).toContain('animate-pulse');
    // Timestamp is stamped in an effect, so it exists once mounted.
    expect(screen.getByTestId('spectate-status-updated')).toBeTruthy();
    const onlineLabel = screen.getByTestId('spectate-status-label').textContent;

    act(() => setOnLine(false));

    const offlineDot = screen.getByTestId('spectate-status-dot');
    expect(offlineDot).toHaveAttribute('data-live', 'offline');
    expect(offlineDot.className).not.toContain('animate-pulse');
    expect(screen.getByTestId('spectate-status-label').textContent).not.toBe(
      onlineLabel,
    );
    // The timestamp stays visible offline — frozen, so staleness is gaugeable.
    expect(screen.getByTestId('spectate-status-updated')).toBeTruthy();
  });
});
