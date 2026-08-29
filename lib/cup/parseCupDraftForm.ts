import { ALLOWANCE_DEFAULTS, parseAllowancePct } from './allowance';
import { parseTiePoints, parseWinPoints } from './pointsToWin';

/**
 * Feltvalideringen for cup-opprettelsesformen, trukket ut av
 * `createTournamentDraft` (#1778 — action-en lå på kompleksitet 30 mot
 * ESLint-grensen 25, siste complexity-warning i `lib/cup/`).
 *
 * Ren funksjon: rå strenger inn, ferdig validerte verdier ut. Ingen FormData
 * og ingen Supabase — action-en leser feltene og beholder auth + insert +
 * redirect. Det gjør regelen Type-A-testbar uten supabase-mocks.
 *
 * REKKEFØLGEN er kontrakt, ikke en detalj: `CupSetup` viser ÉN feilmelding om
 * gangen (`cup.create.errors.*`), så når to felt er ugyldige samtidig er det
 * den FØRSTE koden arrangøren får se. Endrer du rekkefølgen her, endrer du
 * hva skjemaet sier.
 *
 * `parseAllowancePct` (./allowance) og `parseWinPoints`/`parseTiePoints`
 * (./pointsToWin) importeres bevisst i stedet for å flyttes hit: de har egne
 * suiter og — for allowance-parseren — konsumenter utenfor denne flyten.
 */

const NAME_RE = /^.{1,80}$/;
const TEAM_NAME_RE = /^.{1,40}$/;

/**
 * De elleve feilkodene formen kan svare med. Union, ikke `string`, så en
 * omdøpt kode gir kompileringsfeil her i stedet for en i18n-nøkkel som
 * stille faller til `unexpected` i `CupSetup`.
 */
export type CupDraftFormError =
  | 'cup_name'
  | 'cup_team_1'
  | 'cup_team_2'
  | 'cup_team_dup'
  | 'cup_allowance'
  | 'cup_foursomes_allowance'
  | 'cup_greensome_allowance'
  | 'cup_chapman_allowance'
  | 'cup_gruesome_allowance'
  | 'cup_win_points'
  | 'cup_tie_points';

/** Rå form-strenger. Trimming av navnefeltene skjer her, ikke hos kalleren. */
export type CupDraftFormInput = {
  name: string;
  team1: string;
  team2: string;
  fourballAllowanceRaw: string;
  foursomesAllowanceRaw: string;
  greensomeAllowanceRaw: string;
  chapmanAllowanceRaw: string;
  gruesomeAllowanceRaw: string;
  winPointsRaw: string;
  tiePointsRaw: string;
};

export type CupDraftValues = {
  /** Trimmet — det er denne verdien som skal inserteres. */
  name: string;
  team1: string;
  team2: string;
  fourballAllowance: number;
  foursomesAllowance: number;
  greensomeAllowance: number;
  chapmanAllowance: number;
  gruesomeAllowance: number;
  /**
   * #1441 (D8): tomt felt → `undefined`. Kalleren utelater da kolonnen fra
   * inserten, slik at DB-defaulten (1 for seier, 0,5 for delt — migrasjon
   * 0153) gjelder. `undefined` betyr altså «ikke oppgitt», ikke «null».
   */
  winPoints: number | undefined;
  tiePoints: number | undefined;
};

export type CupDraftParseResult =
  | { ok: true; values: CupDraftValues }
  | { ok: false; error: CupDraftFormError };

export function parseCupDraftForm(input: CupDraftFormInput): CupDraftParseResult {
  const name = input.name.trim();
  const team1 = input.team1.trim();
  const team2 = input.team2.trim();

  if (!NAME_RE.test(name)) return { ok: false, error: 'cup_name' };
  if (!TEAM_NAME_RE.test(team1)) return { ok: false, error: 'cup_team_1' };
  if (!TEAM_NAME_RE.test(team2)) return { ok: false, error: 'cup_team_2' };
  // Case-insensitiv: «Lag» og «lag» er samme lagnavn på et leaderboard.
  if (team1.toLowerCase() === team2.toLowerCase()) {
    return { ok: false, error: 'cup_team_dup' };
  }

  const fourballAllowance = parseAllowancePct(
    input.fourballAllowanceRaw,
    ALLOWANCE_DEFAULTS.fourball,
  );
  if (fourballAllowance === null) return { ok: false, error: 'cup_allowance' };
  const foursomesAllowance = parseAllowancePct(
    input.foursomesAllowanceRaw,
    ALLOWANCE_DEFAULTS.foursomes,
  );
  if (foursomesAllowance === null) {
    return { ok: false, error: 'cup_foursomes_allowance' };
  }
  const greensomeAllowance = parseAllowancePct(
    input.greensomeAllowanceRaw,
    ALLOWANCE_DEFAULTS.greensome,
  );
  if (greensomeAllowance === null) {
    return { ok: false, error: 'cup_greensome_allowance' };
  }
  const chapmanAllowance = parseAllowancePct(
    input.chapmanAllowanceRaw,
    ALLOWANCE_DEFAULTS.chapman,
  );
  if (chapmanAllowance === null) {
    return { ok: false, error: 'cup_chapman_allowance' };
  }
  const gruesomeAllowance = parseAllowancePct(
    input.gruesomeAllowanceRaw,
    ALLOWANCE_DEFAULTS.gruesome,
  );
  if (gruesomeAllowance === null) {
    return { ok: false, error: 'cup_gruesome_allowance' };
  }

  // #1441 (D8): win_points > 0, tie_points >= 0 (migrasjon 0153 CHECK-ene).
  const winPoints = parseWinPoints(input.winPointsRaw);
  if (winPoints === null) return { ok: false, error: 'cup_win_points' };
  const tiePoints = parseTiePoints(input.tiePointsRaw);
  if (tiePoints === null) return { ok: false, error: 'cup_tie_points' };

  return {
    ok: true,
    values: {
      name,
      team1,
      team2,
      fourballAllowance,
      foursomesAllowance,
      greensomeAllowance,
      chapmanAllowance,
      gruesomeAllowance,
      winPoints,
      tiePoints,
    },
  };
}
