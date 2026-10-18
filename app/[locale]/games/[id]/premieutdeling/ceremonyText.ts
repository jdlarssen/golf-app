import { formatVsPar } from '@/lib/leaderboard/vsPar';
import type { CeremonyLine, CeremonyPlace } from '@/lib/games/ceremony';
import { sideLabel } from '@/lib/games/sideLabel';
import type { CeremonySidePrize } from './ceremonyData';

/**
 * The prize-giving's words, shared by the phone and the TV (#2298). The
 * callers pass the translated pieces, so this stays free of next-intl.
 */

export interface CeremonyUnits {
  points: string;
  net: string;
  toPar: string;
}

/** «36» + «poeng», «70» + «slag», «−2» + «mot par» — the podium's own form. */
export function ceremonyScore(line: CeremonyLine, units: CeremonyUnits): { value: string; unit: string } {
  if (line.unit === 'toPar') return { value: formatVsPar(line.total), unit: units.toPar };
  return { value: String(line.total), unit: line.unit === 'points' ? units.points : units.net };
}

/** The line's members by name; an unknown player keeps a place in the list. */
export function memberNames(line: CeremonyLine, names: Record<string, string>, unknown: string): string[] {
  return line.members.map((id) => names[id] ?? unknown);
}

export interface PlaceWords {
  /** «2. plass», or «Delt 2. plass» when the place is shared. */
  placeTitle: (place: CeremonyPlace) => string;
  teamLabel: (teamNumber: number) => string;
  units: CeremonyUnits;
  names: Record<string, string>;
  unknown: string;
}

/**
 * One place as the phone reads it out: «2. plass · Jonas Berg · 36 poeng»,
 * «2. plass · Lag 3 · Marte Lie, Jonas Berg · 61 slag». A shared place lists
 * everyone on it; they share the number.
 */
export function placeText(place: CeremonyPlace, w: PlaceWords): string {
  const who = place.lines.map((line) =>
    line.teamNumber === null
      ? memberNames(line, w.names, w.unknown).join(', ')
      : `${w.teamLabel(line.teamNumber)} · ${memberNames(line, w.names, w.unknown).join(', ')}`,
  );
  const score = place.lines[0] ? ceremonyScore(place.lines[0], w.units) : null;
  return [w.placeTitle(place), who.join('; '), score ? `${score.value} ${score.unit}` : null]
    .filter(Boolean)
    .join(' · ');
}

/** «Lengste drive 1», «Nærmest pinnen» — the label the prize card uses. */
export function sidePrizeLabel(prize: CeremonySidePrize, labels: { ld: string; ctp: string }): string {
  return sideLabel(prize.category === 'longest_drive' ? labels.ld : labels.ctp, prize.position, prize.count);
}
