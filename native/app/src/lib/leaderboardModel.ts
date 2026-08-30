// Native N4 (#1828): teksten og radene leaderboardet viser — uten React.
//
// Alt som kan svares med en ren funksjon svares her, slik at render-laget bare
// tegner. Ingen av funksjonene regner golf: match-status kommer ferdig fra
// motoren (`holesUp`, `result.formatted`), og dette laget setter norske ord på
// den. En egen «hvem leder»-formel i appen ville vært et tredje hjem for en
// regel som alt har to.
import { revealState, shouldHideNetto } from '../../../../lib/games/visibility';
import type { ScoreVisibility } from '../../../../lib/games/visibility';
import type { GameStatus } from '../../../../lib/games/status';
import { runningStatusLabel } from '../../../../lib/scoring/modes/matchplayRunningStatus';
import type {
  GameMode,
  MatchplayHoleResult,
  MatchplayMatchResult,
} from '../../../../lib/scoring/modes/types';
import { isMatchplayFamily } from '../../../../lib/scoring/modes/types';
import type { BundlePlayer } from '../data/gameBundle';
import { displayName } from './display';

/**
 * Hvor mye leaderboardet får lov å vise.
 *
 *  - `full`       — alt: netto, poeng, plassering.
 *  - `gross-only` — kun bruttoslag. Reveal-runde som fortsatt går.
 *  - `hidden`     — ingenting. Matchplay-familien i reveal: en duell har
 *                   ingen brutto-halvdel å vise uten å røpe stillingen.
 */
export type LeaderboardVisibility = 'full' | 'gross-only' | 'hidden';

/**
 * Delt `revealState`/`shouldHideNetto` (`lib/games/visibility.ts`) avgjør OM
 * noe skal skjules; hvor strengt avgjøres av formatfamilien, samme skille som
 * webben gjør mellom `RevealHiddenView` og brutto-visningen.
 */
export function leaderboardVisibility(
  scoreVisibility: string,
  status: string,
  mode: GameMode,
): LeaderboardVisibility {
  const state = revealState(
    scoreVisibility as ScoreVisibility,
    status as GameStatus,
  );
  if (!shouldHideNetto(state)) return 'full';
  return isMatchplayFamily(mode) ? 'hidden' : 'gross-only';
}

// ---------------------------------------------------------------------------
// Navn
// ---------------------------------------------------------------------------

/** Slår opp visningsnavn på userId. Ukjent id gir en rolig plassholder. */
export function nameLookup(
  players: readonly BundlePlayer[],
): (userId: string) => string {
  const byId = new Map(players.map((player) => [player.userId, player]));
  return (userId) => {
    const player = byId.get(userId);
    return player ? displayName(player) : 'Ukjent spiller';
  };
}

/**
 * «Lag 2 · Anna, Bjørn». Lagnummeret først fordi det er det som står på
 * kortet på banen; navnene etter fordi det er dem spilleren kjenner igjen.
 */
export function teamLabel(
  teamNumber: number,
  memberIds: readonly string[],
  nameOf: (userId: string) => string,
): string {
  const names = memberIds.map(nameOf).join(', ');
  return names ? `Lag ${teamNumber} · ${names}` : `Lag ${teamNumber}`;
}

// ---------------------------------------------------------------------------
// Matchplay
// ---------------------------------------------------------------------------

/** Utfallet av ett spilt hull, sett fra side 1. */
export type StripOutcome = 'W' | 'L' | 'T';

export interface StripCell {
  holeNumber: number;
  outcome: StripOutcome;
}

/**
 * Hull-stripen: kun SPILTE hull. Et uspilt hull har ingen W/L/T å vise, og en
 * stripe full av tomme ruter forteller ingenting om matchen.
 */
export function matchStrip(
  holes: readonly { holeNumber: number; result: MatchplayHoleResult }[],
): StripCell[] {
  const cells: StripCell[] = [];
  for (const hole of holes) {
    if (hole.result === 'unplayed') continue;
    cells.push({
      holeNumber: hole.holeNumber,
      outcome:
        hole.result === 'side1_wins' ? 'W' : hole.result === 'side2_wins' ? 'L' : 'T',
    });
  }
  return cells;
}

export interface MatchStanding {
  /** Kompakt stilling: «2up» eller «AS» — golf-konvensjonen fra motoren. */
  label: string;
  /** Hvem som leder akkurat nå. `null` ved AS. */
  leader: 'side1' | 'side2' | null;
  /** True når matchen er avgjort (mat-em eller ferdigspilt). */
  decided: boolean;
}

export function matchStanding(result: {
  holesUp: number;
  result: MatchplayMatchResult | null;
}): MatchStanding {
  const decided = result.result != null;
  const label = result.result
    ? result.result.formatted
    : runningStatusLabel(result.holesUp);
  const leader =
    result.holesUp > 0 ? 'side1' : result.holesUp < 0 ? 'side2' : null;
  return { label, leader, decided };
}

/**
 * Setningen over duell-kortet.
 *
 * Avgjort match leser som en kunngjøring («Anna vant 3&2»); en match som går,
 * som en stilling («Anna 2up etter 7 hull»). Ingen hull spilt ennå gir en
 * ærlig ventetekst i stedet for «AS etter 0 hull», som ville lest som at de
 * faktisk står likt.
 */
export function matchStandingLine(opts: {
  standing: MatchStanding;
  holesPlayed: number;
  side1Name: string;
  side2Name: string;
}): string {
  const { standing, holesPlayed, side1Name, side2Name } = opts;
  const leaderName = standing.leader === 'side1' ? side1Name : side2Name;

  if (standing.decided) {
    return standing.leader === null
      ? `Matchen endte ${standing.label}`
      : `${leaderName} vant ${standing.label}`;
  }
  if (holesPlayed === 0) return 'Ingen hull er avgjort ennå.';
  return standing.leader === null
    ? `${standing.label} etter ${holesPlayed} hull`
    : `${leaderName} ${standing.label} etter ${holesPlayed} hull`;
}

// ---------------------------------------------------------------------------
// Potter
// ---------------------------------------------------------------------------

/**
 * Skins-potten som henger igjen. Motoren kjenner ikke spillets status og gir
 * bare det rå tallet, så labelen avgjøres her — som i webbens SkinsView.
 * `null` = ingenting henger, ingen linje å vise.
 */
export function carriedPotLine(
  carriedPot: number,
  status: string,
): string | null {
  if (carriedPot <= 0) return null;
  return status === 'finished'
    ? `${carriedPot} skins ble aldri vunnet.`
    : `${carriedPot} skins står i potten til neste hull.`;
}

/**
 * Status for én Nassau-seksjon (front 9 / back 9 / hele runden).
 * Delt seksjon deler ikke ut poeng — det er hele poenget med push-regelen, så
 * teksten sier det i stedet for å liste to «vinnere».
 */
export function nassauSectionLine(
  section: { winnerUserIds: string[]; isPending: boolean },
  nameOf: (userId: string) => string,
): string {
  if (section.isPending) return 'Ikke avgjort ennå';
  if (section.winnerUserIds.length === 0) return 'Ikke avgjort ennå';
  if (section.winnerUserIds.length > 1) return 'Delt — ingen poeng';
  return `Vinner: ${nameOf(section.winnerUserIds[0]!)}`;
}

export const NASSAU_SECTION_LABELS: Record<
  'front9' | 'back9' | 'total18',
  string
> = {
  front9: 'Første ni',
  back9: 'Siste ni',
  total18: 'Hele runden',
};

// ---------------------------------------------------------------------------
// Brutto-visning (reveal-runde som går)
// ---------------------------------------------------------------------------

export interface GrossLine {
  userId: string;
  name: string;
  totalGross: number;
  holesPlayed: number;
}

/**
 * Bruttotabellen i reveal-modus, regnet rett fra de lokale slagene.
 *
 * Med vilje IKKE fra motor-resultatet: da hadde netto/poeng ligget i samme
 * objekt som render-laget leser, ett felt unna en lekkasje. Rekkefølgen er
 * rosterets — en sortering på brutto ville vært en rangering, og det er
 * nettopp det reveal-runden holder tilbake.
 */
export function grossLines(
  players: readonly BundlePlayer[],
  scores: readonly { userId: string; strokes: number | null }[],
): GrossLine[] {
  const totals = new Map<string, { gross: number; holes: number }>();
  for (const score of scores) {
    if (score.strokes == null) continue;
    const entry = totals.get(score.userId) ?? { gross: 0, holes: 0 };
    entry.gross += score.strokes;
    entry.holes += 1;
    totals.set(score.userId, entry);
  }
  return players
    .filter((player) => player.withdrawnAt == null)
    .map((player) => {
      const entry = totals.get(player.userId);
      return {
        userId: player.userId,
        name: displayName(player),
        totalGross: entry?.gross ?? 0,
        holesPlayed: entry?.holes ?? 0,
      };
    });
}
