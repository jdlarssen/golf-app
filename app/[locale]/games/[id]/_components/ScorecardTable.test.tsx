import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ScorecardTable, type ScorecardHole } from './ScorecardTable';

// Type C: én render-test for den delte scorekort-tabellen (#1586). Verifiserer
// at alle 18 hull-rader rendres med slag, og at hull uten slag viser «—» —
// resten (segment-filter, par-logikk) er Type A-testet i sine egne moduler.

const holes: ScorecardHole[] = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: 4,
  par_ladies: 4,
  par_juniors: 4,
  stroke_index: i + 1,
}));

describe('ScorecardTable', () => {
  it('rendrer én rad per hull med slag, og «—» for hull uten slag', async () => {
    const scores = new Map<number, number | null>(
      holes.map((h) => [h.hole_number, h.hole_number === 18 ? null : 5]),
    );
    const table = await ScorecardTable({
      holes,
      scores,
      teeGender: 'mens',
      holeSegment: 'full',
    });
    const { container } = render(table as React.ReactElement);

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(18);
    expect(rows[0]?.textContent).toContain('5');
    expect(rows[17]?.textContent).toContain('—');
  });
});
