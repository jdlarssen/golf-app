import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Switch, SwitchRow } from './Switch';

describe('Switch off track', () => {
  it('Switch draws the off track from --text-muted so it meets 3:1 (was text/20, 1.5:1)', () => {
    render(<Switch checked={false} onToggle={() => {}} label="Varsler" />);
    const track = screen.getByRole('switch', { name: 'Varsler' });
    expect(track.className).toContain('bg-muted/60');
    expect(track.className).toContain('dark:bg-muted/70');
    expect(track.className).not.toContain('bg-text/20');
  });

  it('Switch on state keeps the primary fill', () => {
    render(<Switch checked onToggle={() => {}} label="Varsler" />);
    expect(screen.getByRole('switch').className).toContain('bg-primary');
  });

  it('SwitchRow draws the same off track (was bg-border, 1.3:1)', () => {
    const { container } = render(<SwitchRow title="Tittel" checked={false} onChange={() => {}} />);
    const track = container.querySelector('span[aria-hidden="true"]');
    expect(track?.className).toContain('bg-muted/60');
    expect(track?.className).toContain('dark:bg-muted/70');
    expect(track?.className).not.toContain('bg-border');
  });
});
