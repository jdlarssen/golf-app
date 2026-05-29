import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModeChip } from './ModeChip';

describe('ModeChip', () => {
  it('rendrer «Stableford» for stableford-modus', () => {
    render(<ModeChip mode="stableford" />);
    expect(screen.getByText('Stableford')).toBeInTheDocument();
  });

  it('rendrer «Best ball» for best_ball-modus', () => {
    render(<ModeChip mode="best_ball" />);
    expect(screen.getByText('Best ball')).toBeInTheDocument();
  });

  it('rendrer «4BBB Stableford» når modeConfig har team_size 2 (#282)', () => {
    render(
      <ModeChip
        mode="stableford"
        modeConfig={{ kind: 'stableford', team_size: 2, points_table: 'standard' }}
      />,
    );
    expect(screen.getByText('4BBB Stableford')).toBeInTheDocument();
  });

  it('beholder «Stableford» når modeConfig har team_size 1', () => {
    render(
      <ModeChip
        mode="stableford"
        modeConfig={{ kind: 'stableford', team_size: 1, points_table: 'standard' }}
      />,
    );
    expect(screen.getByText('Stableford')).toBeInTheDocument();
  });

  it('propagerer className når oppgitt', () => {
    const { container } = render(
      <ModeChip mode="stableford" className="ml-2" />,
    );
    const chip = container.querySelector('span');
    expect(chip?.className).toContain('ml-2');
  });

  it('beholder base-klasser for chip-stilen uavhengig av propagert klassenavn', () => {
    const { container } = render(<ModeChip mode="stableford" />);
    const chip = container.querySelector('span');
    // Subtil chip: rounded-full + border + font-sans = base-stil.
    expect(chip?.className).toContain('rounded-full');
    expect(chip?.className).toContain('border');
    expect(chip?.className).toContain('font-sans');
  });
});
