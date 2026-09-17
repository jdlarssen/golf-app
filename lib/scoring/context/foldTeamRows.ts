import {
  formerTeamRowOwnerIds,
  pickTeamCaptain,
  teamScoreOwnerId,
} from '@/lib/games/teamCaptain';
import { modeCollapsesToTeamCard, type GameMode } from '@/lib/scoring/modes/types';

/** Minste form en roster-rad må ha for at vi kan finne lagets rad-eier. */
export type FoldRosterRow = {
  user_id: string;
  team_number: number | null;
  withdrawn_at: string | null;
};

/**
 * Minste form en score-rad må ha. camelCase, som både webbens Dexie-rader og
 * appens `LocalScore`. `putts` er valgfri: rader uten felt får det ikke lagt
 * til.
 */
export type FoldScoreRow = {
  userId: string;
  holeNumber: number;
  strokes: number | null;
  putts?: number | null;
};

/**
 * Hvem foldingen legger lagets rader på.
 *
 * - `rowOwner` (default): `teamScoreOwnerId`, det lex-minste AKTIVE medlemmet.
 *   Det er dit hull-føringen skriver, så flatene som viser og teller hull
 *   (hull-siden, scorekortet, leveringen) leser herfra.
 * - `teamCaptain`: `pickTeamCaptain` over ALLE medlemmene i rosteret, også de
 *   trukne. Det er kapteinen modusene i `lib/scoring/modes/` leser når
 *   `buildUniformContext` beholder et trukket medlem på laget.
 */
export type FoldTarget = 'rowOwner' | 'teamCaptain';

/**
 * «Lagets rader følger laget» (#2067) — én regel for alle flatene.
 *
 * I én-ball-formatene eier lag-kapteinen lagets rader. Sletter kapteinen
 * kontoen midt i runden, trekkes raden (0174), og eierskapet går til neste
 * medlem. Hullene som alt er ført, ligger igjen på den trukne. Den raden kan
 * ikke skrives til (`upsert_score_if_newer` og RLS), så skrivingen fortsetter
 * på den nye eieren, og lesingen folder de to sammen her.
 *
 * Regelen, per lag med minst ett trukket OG minst ett aktivt medlem, på hvert
 * hull der laget deler rad (`modeCollapsesToTeamCard(mode, hull)`):
 *
 *  1. Har den nåværende eieren slag på hullet, vinner raden dens. En retting
 *     makkeren gjør etter slettingen, slår altså den gamle verdien.
 *  2. Ellers vinner raden til den siste trukne eieren med slag
 *     (`formerTeamRowOwnerIds`: lex-synkende).
 *  3. Har ingen slag, står eierens rad (om den finnes) som den er.
 *
 * Vinneren legges på målet (`onto`) med alle feltene sine, og de andre radene
 * til eieren og de trukne på det hullet faller bort. Har eieren en rad med
 * putter, men uten slag, beholdes eierens putter.
 *
 * Ingen endring: formater som aldri deler rad, lag uten trukne, helt trukne
 * lag (ingen eier å legge radene på), hull der laget spiller egen ball
 * (patsome 1–6), spillere uten lag. Aktive medlemmer som ikke eier raden,
 * røres ikke.
 *
 * Rekkefølgen beholdes; den foldede raden står der lagets første rad for
 * hullet stod.
 *
 * Kjent grense: «Angre» på et hull ført før slettingen tømmer bare eierens
 * rad, så den gamle verdien vises igjen. Hullet kan rettes, ikke blankes.
 *
 * Import-ren (ingen `server-only`): native-appen bruker samme funksjon.
 */
export function foldTeamRows<T extends FoldScoreRow>(opts: {
  roster: readonly FoldRosterRow[];
  rows: readonly T[];
  mode: GameMode;
  onto?: FoldTarget;
}): T[] {
  const { roster, rows, mode, onto = 'rowOwner' } = opts;
  if (!modeCollapsesToTeamCard(mode, 18)) return [...rows];

  const plans = teamFoldPlans(roster, onto);
  if (plans.size === 0) return [...rows];

  const planByUser = new Map<string, TeamFoldPlan>();
  for (const plan of plans.values()) {
    for (const id of plan.precedence) planByUser.set(id, plan);
  }

  const rowByUserHole = new Map<string, T>();
  for (const r of rows) rowByUserHole.set(`${r.userId}#${r.holeNumber}`, r);

  const out: T[] = [];
  const emitted = new Set<string>();
  for (const r of rows) {
    const plan = planByUser.get(r.userId);
    if (plan == null || !modeCollapsesToTeamCard(mode, r.holeNumber)) {
      out.push(r);
      continue;
    }
    const key = `${plan.teamNumber}#${r.holeNumber}`;
    if (emitted.has(key)) continue;
    emitted.add(key);

    const folded = foldHole(plan, r.holeNumber, rowByUserHole);
    if (folded != null) out.push(folded);
  }
  return out;
}

type TeamFoldPlan = {
  teamNumber: number;
  ownerId: string;
  /** Eieren først, så de trukne, siste eier først. */
  precedence: string[];
  targetId: string;
};

function teamFoldPlans(
  roster: readonly FoldRosterRow[],
  onto: FoldTarget,
): Map<number, TeamFoldPlan> {
  const teams = new Map<number, FoldRosterRow[]>();
  for (const p of roster) {
    if (p.team_number == null) continue;
    const members = teams.get(p.team_number) ?? [];
    members.push(p);
    teams.set(p.team_number, members);
  }

  const plans = new Map<number, TeamFoldPlan>();
  for (const [teamNumber, members] of teams) {
    const former = formerTeamRowOwnerIds(members);
    const ownerId = teamScoreOwnerId(members);
    if (former.length === 0 || ownerId == null) continue;
    plans.set(teamNumber, {
      teamNumber,
      ownerId,
      precedence: [ownerId, ...former],
      targetId:
        onto === 'teamCaptain'
          ? pickTeamCaptain(members.map((m) => m.user_id))
          : ownerId,
    });
  }
  return plans;
}

function foldHole<T extends FoldScoreRow>(
  plan: TeamFoldPlan,
  holeNumber: number,
  rowByUserHole: ReadonlyMap<string, T>,
): T | null {
  const ownerRow = rowByUserHole.get(`${plan.ownerId}#${holeNumber}`);
  const winner =
    plan.precedence
      .map((id) => rowByUserHole.get(`${id}#${holeNumber}`))
      .find((r): r is T => r != null && r.strokes != null) ?? ownerRow;
  if (winner == null) return null;

  const folded: T = { ...winner, userId: plan.targetId };
  if (
    winner !== ownerRow &&
    ownerRow != null &&
    'putts' in ownerRow &&
    ownerRow.putts != null
  ) {
    folded.putts = ownerRow.putts;
  }
  return folded;
}
