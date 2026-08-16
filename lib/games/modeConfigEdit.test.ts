import { describe, it, expect } from 'vitest';
import { carryPreservedModeConfigKeys } from './modeConfigEdit';
import type { GameModeConfig } from '@/lib/scoring/modes/types';

/**
 * #1677: edit-skjemaet bygger `mode_config` fra bunnen av, så nøkler ingen
 * skjemafelt eier (cup-generatorens `team_strokes_override`) forsvant ved hver
 * lagring. Denne helperen bærer dem over — og bare dem.
 */

const greensome = (
  extra: Record<string, unknown> = {},
): GameModeConfig =>
  ({
    kind: 'greensome_matchplay',
    team_size: 2,
    teams_count: 2,
    allowance_pct: 100,
    ...extra,
  }) as GameModeConfig;

describe('carryPreservedModeConfigKeys', () => {
  it('bærer over en bevart nøkkel når kind er lik og skjemaet mangler den', () => {
    const existing = greensome({ team_strokes_override: { team1: 8, team2: 3 } });

    expect(carryPreservedModeConfigKeys(existing, greensome())).toEqual(
      greensome({ team_strokes_override: { team1: 8, team2: 3 } }),
    );
  });

  it('bærer ingenting over når modusen er byttet (draft kan skifte format)', () => {
    const existing = greensome({ team_strokes_override: { team1: 8, team2: 3 } });
    const next = {
      kind: 'best_ball',
      team_size: 2,
      teams_count: 2,
    } as GameModeConfig;

    expect(carryPreservedModeConfigKeys(existing, next)).toEqual(next);
  });

  it('returnerer next uendret når existing er null eller ikke et objekt', () => {
    const next = greensome();

    expect(carryPreservedModeConfigKeys(null, next)).toEqual(next);
    expect(carryPreservedModeConfigKeys(undefined, next)).toEqual(next);
    expect(carryPreservedModeConfigKeys('greensome_matchplay', next)).toEqual(
      next,
    );
    expect(carryPreservedModeConfigKeys([], next)).toEqual(next);
  });

  it('lar skjemaets verdi vinne når nøkkelen finnes begge steder', () => {
    const existing = greensome({ team_strokes_override: { team1: 8, team2: 3 } });
    const next = greensome({ team_strokes_override: { team1: 1, team2: 2 } });

    expect(carryPreservedModeConfigKeys(existing, next)).toEqual(next);
  });

  it('bærer ikke over nøkler utenfor lista (skjemaet eier resten)', () => {
    const existing = greensome({
      allowance_pct: 60,
      kr_per_unit: 50,
      team_strokes_override: { team1: 8, team2: 3 },
    });
    const next = greensome({ allowance_pct: 100 });

    const result = carryPreservedModeConfigKeys(existing, next) as Record<
      string,
      unknown
    >;
    expect(result.kr_per_unit).toBeUndefined();
    expect(result.allowance_pct).toBe(100);
    expect(result.team_strokes_override).toEqual({ team1: 8, team2: 3 });
  });
});
