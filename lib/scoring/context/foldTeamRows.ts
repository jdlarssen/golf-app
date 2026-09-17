import {
  formerTeamRowOwnerIds,
  latestOwnerFirst,
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
 * appens `LocalScore`.
 *
 * `strokes` kan mangle: da regnes raden som ført. Det er kontrakten
 * `scoredHoleNumbers` og `filledHoles` alltid har hatt: kalleren har filtrert
 * på slag (`.not('strokes', 'is', null)`) og henter ikke kolonnen. Rader MED
 * feltet og `null` er ikke ført. `putts` er valgfri: rader uten felt får det
 * ikke lagt til.
 */
export type FoldScoreRow = {
  userId: string;
  holeNumber: number;
  strokes?: number | null;
  putts?: number | null;
};

/** Samme rad i snake_case, slik PostgREST gir den. */
export type FoldSnakeScoreRow = {
  user_id: string;
  hole_number: number;
  strokes?: number | null;
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
 * røres ikke. Urørte rader kommer tilbake som de samme objektene.
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
  return foldWithPlans(rows, mode, teamFoldPlans(roster, onto));
}

/**
 * `foldTeamRows` for snake_case-rader fra PostgREST. Radene kommer tilbake
 * med `user_id` byttet til målet og de øvrige feltene i behold.
 */
export function foldTeamScoreRows<T extends FoldSnakeScoreRow>(opts: {
  roster: readonly FoldRosterRow[];
  rows: readonly T[];
  mode: GameMode;
  onto?: FoldTarget;
}): T[] {
  const wrapped = opts.rows.map((row) => ({
    userId: row.user_id,
    holeNumber: row.hole_number,
    ...('strokes' in row ? { strokes: row.strokes } : {}),
    ...('putts' in row ? { putts: row.putts } : {}),
    row,
  }));
  return foldTeamRows({ ...opts, rows: wrapped }).map((w) =>
    w.userId === w.row.user_id && w.putts === w.row.putts
      ? w.row
      : {
          ...w.row,
          user_id: w.userId,
          ...('putts' in w.row ? { putts: w.putts } : {}),
        },
  );
}

/**
 * Samme regel sett fra én seer som bare kjenner sitt eget lag: eieren
 * (`teamScoreOwnerId`) og de tidligere eierne (`formerTeamRowOwnerIds`).
 * Hull-siden på klienten og de seer-baserte hjelperne i
 * `lib/games/scoreOwner.ts` har ikke rosteret, bare de to.
 */
export function foldRowsOntoOwner<T extends FoldScoreRow>(
  rows: readonly T[],
  mode: GameMode,
  ownerId: string | null,
  formerOwnerIds: readonly string[],
): T[] {
  if (ownerId == null || formerOwnerIds.length === 0) return [...rows];
  if (!modeCollapsesToTeamCard(mode, 18)) return [...rows];
  return foldWithPlans(rows, mode, [
    planFor(0, ownerId, latestOwnerFirst(formerOwnerIds), ownerId),
  ]);
}

type TeamFoldPlan = {
  /** Nøkkel som skiller lagene innad i én folding. */
  teamKey: number;
  ownerId: string;
  /** Eieren først, så de tidligere eierne, siste eier først. */
  precedence: string[];
  targetId: string;
};

function planFor(
  teamKey: number,
  ownerId: string,
  formerOwnerIds: readonly string[],
  targetId: string,
): TeamFoldPlan {
  return {
    teamKey,
    ownerId,
    precedence: [ownerId, ...formerOwnerIds.filter((id) => id !== ownerId)],
    targetId,
  };
}

function teamFoldPlans(
  roster: readonly FoldRosterRow[],
  onto: FoldTarget,
): TeamFoldPlan[] {
  const teams = new Map<number, FoldRosterRow[]>();
  for (const p of roster) {
    if (p.team_number == null) continue;
    const members = teams.get(p.team_number) ?? [];
    members.push(p);
    teams.set(p.team_number, members);
  }

  const plans: TeamFoldPlan[] = [];
  for (const [teamNumber, members] of teams) {
    const former = formerTeamRowOwnerIds(members);
    const ownerId = teamScoreOwnerId(members);
    if (former.length === 0 || ownerId == null) continue;
    const targetId =
      onto === 'teamCaptain'
        ? pickTeamCaptain(members.map((m) => m.user_id))
        : ownerId;
    plans.push(planFor(teamNumber, ownerId, former, targetId));
  }
  return plans;
}

function foldWithPlans<T extends FoldScoreRow>(
  rows: readonly T[],
  mode: GameMode,
  plans: readonly TeamFoldPlan[],
): T[] {
  if (plans.length === 0) return [...rows];

  const planByUser = new Map<string, TeamFoldPlan>();
  for (const plan of plans) {
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
    const key = `${plan.teamKey}#${r.holeNumber}`;
    if (emitted.has(key)) continue;
    emitted.add(key);

    const folded = foldHole(plan, r.holeNumber, rowByUserHole);
    if (folded != null) out.push(folded);
  }
  return out;
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
      .find((r): r is T => r != null && r.strokes !== null) ?? ownerRow;
  if (winner == null) return null;

  const keepOwnerPutts =
    winner !== ownerRow && ownerRow?.putts != null;
  if (winner.userId === plan.targetId && !keepOwnerPutts) return winner;

  const folded: T = { ...winner, userId: plan.targetId };
  if (keepOwnerPutts) folded.putts = ownerRow!.putts;
  return folded;
}
