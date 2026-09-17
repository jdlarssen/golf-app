import type {
  UniformContextHoleRow,
  UniformContextPlayerRow,
  UniformContextScoreRow,
} from '@/lib/scoring/context/buildUniformContext';

// #2067 — delt fikstur for «kapteinen sletter kontoen midt i runden» i
// én-ball-formatene. Rå rader, slik tavla og resultat-byggeren sender dem inn
// i `buildUniformContext`, så modus-testene prøver hele veien fra rad til
// resultat.

export const WITHDRAWN_AT = '2026-09-17T10:00:00Z';

/** 18 hull, par 4, SI = hullnummer. */
export const HOLES_18: UniformContextHoleRow[] = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par_mens: 4,
  par_ladies: 4,
  par_juniors: 4,
  stroke_index: i + 1,
}));

function player(
  user_id: string,
  team_number: number,
  course_handicap: number,
  withdrawn_at: string | null = null,
): UniformContextPlayerRow {
  return {
    user_id,
    team_number,
    course_handicap,
    tee_gender: 'mens',
    withdrawn_at,
    users: { name: user_id, nickname: null },
  };
}

/**
 * Lag 1: kaptein `a` (CH 10) + makker `b` (CH 20).
 * Lag 2: kaptein `c` (CH 12) + makker `d` (CH 16).
 * `captainWithdrawn` trekker `a`, slik `anonymize_user` gjør (0174).
 */
export function twoTeamRoster(opts: {
  captainWithdrawn: boolean;
}): UniformContextPlayerRow[] {
  return [
    player('a', 1, 10, opts.captainWithdrawn ? WITHDRAWN_AT : null),
    player('b', 1, 20),
    player('c', 2, 12),
    player('d', 2, 16),
  ];
}

/** Én rad per hull fra `from` til `to`, alle med `strokes` slag. */
export function scoreRows(
  userId: string,
  from: number,
  to: number,
  strokes: number,
): UniformContextScoreRow[] {
  return Array.from({ length: to - from + 1 }, (_, i) => ({
    user_id: userId,
    hole_number: from + i,
    strokes,
  }));
}
