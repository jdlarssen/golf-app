import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FinishedGameCard } from './FinishedGameCard';
import type { FinishedGame } from '@/lib/games/getFinishedGamesForUser';
import type { ResultSummary } from '@/lib/scoring/resultSummary';

/**
 * Type C render-test (én per komponent): verifiserer integrasjonen kort +
 * `finishedResultBadge` + next-intl-katalogen — at gull-accenten slår til ved
 * egen seier, dempes ellers, og at 🏆-fallbacken brukes når summary mangler.
 * Per-modus utfalls-logikken testes i `resultSummary`/`finishedResultBadge`.
 */
function makeGame(result_summary: ResultSummary | null): FinishedGame {
  return {
    id: 'g1',
    name: 'Test-runde',
    ended_at: '2026-06-12T18:00:00Z',
    game_mode: 'stableford',
    mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
    courses: { name: 'Byneset' },
    result_summary,
  };
}

describe('FinishedGameCard', () => {
  it('egen seier → gull-accent på resultat-badgen', () => {
    const { container } = render(
      <FinishedGameCard
        game={makeGame({ kind: 'placement', rank: 1, fieldSize: 4, isTeam: false })}
      />,
    );
    const badge = container.querySelector('.text-accent');
    expect(badge?.textContent).toContain('Du vant');
    // Ingen 🏆 når et resultat finnes.
    expect(container.textContent).not.toContain('🏆');
  });

  it('ikke-seier → dempet badge, ingen gull-accent på teksten', () => {
    const { container } = render(
      <FinishedGameCard
        game={makeGame({ kind: 'placement', rank: 2, fieldSize: 4, isTeam: false })}
      />,
    );
    const muted = container.querySelector('span.text-muted.font-medium');
    expect(muted?.textContent).toContain('2. plass av 4');
    expect(container.querySelector('.text-accent')).toBeNull();
  });

  it('manglende summary → 🏆-fallback', () => {
    const { container } = render(<FinishedGameCard game={makeGame(null)} />);
    expect(container.textContent).toContain('🏆');
  });
});
