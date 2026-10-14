// Oppsummeringen etter siste hull (#2299): dagens beste hull og det som
// svidde, hvem i flighten som har ført alt, og hvilket tall som står først.
// Ett hjem for reglene. Appens scorekort bruker dem i dag; nettsidens
// lever-side kan bruke de samme senere.
//
// Bare relative importer, og typer med `import type`, så appen kan importere
// fila rett fra `lib/` (Metro-fella, #1901). Hvem som eier hvilke hull i
// lagformatene, spør vi den delte `ownedScoresByPlayer` om; fila leser ingen
// kaptein selv.

import {
  ownedScoresByPlayer,
  type FilledRosterRow,
  type FilledScoreRow,
} from '../games/filledHoles';
import { isStablefordFamily, type GameMode } from '../scoring/modes/types';
import type { HoleScore } from '../stats/achievements';
import { strokeTerm, type StrokeTerm } from './scoreRail';

/** Ett hull som skiller seg ut i runden. */
export type RoundHighlight = {
  holeNumber: number;
  strokes: number;
  par: number;
  term: StrokeTerm;
  holeInOne: boolean;
};

/**
 * Dagens beste hull og det som svidde. `best` er hullet med lavest slag mot
 * par når det er par eller bedre; `worst` er hullet med høyest slag mot par
 * når det er dobbel bogey eller verre. Ved likhet vinner laveste hullnummer.
 * Uspilte hull hoppes over.
 */
export function roundHighlights(holes: readonly HoleScore[]): {
  best: RoundHighlight | null;
  worst: RoundHighlight | null;
} {
  const played = holes
    .filter((h): h is HoleScore & { strokes: number } => h.strokes != null)
    .slice()
    .sort((a, b) => a.holeNumber - b.holeNumber);

  let best: (HoleScore & { strokes: number }) | null = null;
  let worst: (HoleScore & { strokes: number }) | null = null;
  for (const hole of played) {
    const diff = hole.strokes - hole.par;
    if (diff <= 0 && (best === null || diff < best.strokes - best.par)) best = hole;
    if (diff >= 2 && (worst === null || diff > worst.strokes - worst.par)) worst = hole;
  }

  const highlight = (hole: (HoleScore & { strokes: number }) | null): RoundHighlight | null =>
    hole === null
      ? null
      : {
          holeNumber: hole.holeNumber,
          strokes: hole.strokes,
          par: hole.par,
          term: strokeTerm(hole.strokes, hole.par),
          holeInOne: hole.strokes === 1,
        };

  return { best: highlight(best), worst: highlight(worst) };
}

/** En rad i rosteret: det eier-regelen trenger, pluss leveringen. */
export type RoundRosterRow = FilledRosterRow & { submitted_at: string | null };

/** En rad i `scores`, med slagene: rader uten slag teller ikke som ført. */
export type RoundScoreRow = FilledScoreRow & { strokes: number | null };

/**
 * Hvor langt hver medspiller har kommet. Levert går foran alt annet. Ellers
 * har spilleren enten ført alle hullene i `holeNumbers` eller mangler noen,
 * stigende. Hver liste står i rekkefølgen fra `mateIds`.
 *
 * `players` er hele rosteret, trukne med: eier-regelen trenger hele laget for
 * å finne hvem som eier lagets rader.
 */
export function flightRoundStatus(opts: {
  players: readonly RoundRosterRow[];
  mateIds: readonly string[];
  scores: readonly RoundScoreRow[];
  mode: GameMode;
  holeNumbers: readonly number[];
}): {
  submitted: string[];
  complete: string[];
  missing: { userId: string; holes: number[] }[];
} {
  const owned = ownedScoresByPlayer({
    players: opts.players,
    scores: opts.scores.filter((row) => row.strokes != null),
    mode: opts.mode,
  });
  const submittedIds = new Set(
    opts.players.filter((p) => p.submitted_at != null).map((p) => p.user_id),
  );

  const submitted: string[] = [];
  const complete: string[] = [];
  const missing: { userId: string; holes: number[] }[] = [];
  for (const userId of opts.mateIds) {
    if (submittedIds.has(userId)) {
      submitted.push(userId);
      continue;
    }
    const filled = new Set((owned.get(userId) ?? []).map((row) => row.hole_number));
    const holes = opts.holeNumbers.filter((n) => !filled.has(n)).sort((a, b) => a - b);
    if (holes.length === 0) complete.push(userId);
    else missing.push({ userId, holes });
  }
  return { submitted, complete, missing };
}

/**
 * Tallet som står først: poeng i stableford-familien, netto i solo slagspill
 * og slag ellers. Skjult netto (en blind runde som pågår) gir alltid slag.
 */
export function roundDoneHeadline(mode: GameMode, hidden: boolean): 'points' | 'net' | 'gross' {
  if (hidden) return 'gross';
  if (isStablefordFamily(mode)) return 'points';
  if (mode === 'solo_strokeplay') return 'net';
  return 'gross';
}
