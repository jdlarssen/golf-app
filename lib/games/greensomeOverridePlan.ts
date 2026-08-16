import { greensomeTeamHandicap } from '@/lib/scoring/modes/greensomeMatchplay';

/**
 * Rene regler for greensomens lagrede lag-slag (`mode_config.team_strokes_override`).
 *
 * Egen modul, ikke en del av `recomputeCourseHandicap.ts` (#1628): start-flyten
 * (`startScheduledGame`) trenger reglene, og den fila drar med seg `next/cache`
 * + service-role-klienten inn i importgrafen. Her er det ren logikk — kun
 * motorens egen 60/40-formel importeres.
 */

/**
 * `games.mode_config.team_strokes_override` (#1441, D10) — begge sider. Type
 * alias, ikke interface: den skrives tilbake inn i `mode_config` (`Json`), og
 * kun literal-typer får den implisitte index-signaturen `Json` krever.
 */
export type TeamStrokesOverride = { team1: number; team2: number };

/** Reads `{team1, team2}` off raw mode_config JSON, or null when unusable. */
function readOverrideKey(
  modeConfig: unknown,
  key: 'team_strokes_override' | 'team_strokes_override_auto',
): TeamStrokesOverride | null {
  if (!modeConfig || typeof modeConfig !== 'object') return null;
  const raw = (modeConfig as Record<string, unknown>)[key];
  if (!raw || typeof raw !== 'object') return null;
  const { team1, team2 } = raw as { team1?: unknown; team2?: unknown };
  if (typeof team1 !== 'number' || !Number.isFinite(team1)) return null;
  if (typeof team2 !== 'number' || !Number.isFinite(team2)) return null;
  return { team1, team2 };
}

/** Reads `{team1, team2}` off raw mode_config JSON, or null when unusable. */
export function readStoredTeamStrokesOverride(
  modeConfig: unknown,
): TeamStrokesOverride | null {
  return readOverrideKey(modeConfig, 'team_strokes_override');
}

/**
 * Én rad fra kampens `game_players`, flatet ut til det regelen trenger: hvilken
 * side spilleren er på, om hen er trukket, og det RÅ banehandicapet (FØR
 * allowance) start-flyten nettopp regnet ut for hen.
 *
 * Rå, ikke allowance-justert: det er nøyaktig samme basis genereringen brukte
 * da forslaget ble laget (`calculateCourseHandicap` uten allowance). Cup-
 * greensome kjører uansett `games.hcp_allowance_pct = 100`
 * (`lib/cup/cupMatchAllowance.ts`), så de to er like i praksis — men regelen
 * skal være riktig av seg selv, ikke ved et sammentreff.
 */
export interface GreensomeStartPlayer {
  /** `game_players.team_number` (1 eller 2); null når raden mangler side. */
  teamNumber: number | null;
  /** `game_players.withdrawn_at` — trukkede rader teller ikke som partner. */
  withdrawnAt: string | null;
  /** Rått banehandicap regnet ut ved frysing, FØR allowance. */
  rawCourseHandicap: number;
}

/** Begge JSONB-feltene slik de skal se ut etter skrivingen. */
export interface GreensomeStartOverridePlan {
  teamStrokesOverride: TeamStrokesOverride;
  teamStrokesOverrideAuto: TeamStrokesOverride;
}

/**
 * Regner ut ett lags 60/40-forslag fra de aktive radene på siden. Returnerer
 * null når siden ikke har NØYAKTIG to aktive spillere (samme konservative
 * regel som #1537: en trukket spiller + erstatter kan gi tre rader, og tre
 * AKTIVE rader gir ingen entydig makker) eller når et av tallene ikke er
 * endelig.
 */
function sideSuggestion(
  players: GreensomeStartPlayer[],
  teamNumber: 1 | 2,
): number | null {
  const active = players.filter(
    (p) => p.teamNumber === teamNumber && p.withdrawnAt === null,
  );
  if (active.length !== 2) return null;
  const [a, b] = active;
  if (!Number.isFinite(a.rawCourseHandicap)) return null;
  if (!Number.isFinite(b.rawCourseHandicap)) return null;
  return greensomeTeamHandicap(a.rawCourseHandicap, b.rawCourseHandicap);
}

/**
 * Ren regel for #1628: skal en planlagt greensome-kamps lagrede lag-slag
 * re-deriveres fra de ferske banehandicapene når runden starter — og til hva?
 *
 * Bakgrunnen: cup-genereringen fyller `team_strokes_override` med
 * `greensomeTeamHandicap(chA, chB)` som et FORSLAG, frosset i det øyeblikket
 * planen ble generert (typisk dagen før spilledag). Rettes et handicap i
 * mellomtiden, står forslaget urørt — #1537-omregningen tar bare `active`
 * kamper (en `scheduled` kamp har ingen frosne banehandicap å sammenlikne
 * mot), så kampen kunne starte med lag-slag basert på et handicap som ble
 * rettet for lengst.
 *
 * Løsningen er at genereringen ALSO lagrer forslaget i
 * `team_strokes_override_auto`. Da er «urørt» avgjørbart uten frosne
 * handicap: er `override.teamN` bit-for-bit lik `auto.teamN`, har ingen rørt
 * feltet, og siden re-deriveres fra de ferske tallene. Alt annet er
 * arrangørens eget tall og overlever (samme kontrakt som #1537).
 *
 * Fail-safe på begge kanter: mangler `_auto` (kamper generert før #1628) eller
 * `team_strokes_override`, skjer ingenting. Ingen skriving når re-deriveringen
 * gir nøyaktig det som allerede står — da er det ingenting å oppdatere.
 *
 * Gjenbruker motorens egen `greensomeTeamHandicap` — formelen har ett hjem.
 */
export function planGreensomeStartOverride(input: {
  /** `games.game_mode` — kun `greensome_matchplay` kjenner feltene. */
  gameMode: string;
  /** `games.mode_config`, rå JSON — leses defensivt. */
  modeConfig: unknown;
  players: GreensomeStartPlayer[];
}): GreensomeStartOverridePlan | null {
  if (input.gameMode !== 'greensome_matchplay') return null;

  const stored = readStoredTeamStrokesOverride(input.modeConfig);
  if (!stored) return null;
  const auto = readOverrideKey(input.modeConfig, 'team_strokes_override_auto');
  if (!auto) return null;

  const nextOverride = { ...stored };
  const nextAuto = { ...auto };
  let changed = false;

  for (const teamNumber of [1, 2] as const) {
    const side = teamNumber === 1 ? 'team1' : 'team2';
    // Ikke det urørte auto-forslaget → arrangøren tastet det. La det stå.
    if (stored[side] !== auto[side]) continue;
    const suggestion = sideSuggestion(input.players, teamNumber);
    if (suggestion === null) continue;
    if (suggestion === stored[side]) continue;
    nextOverride[side] = suggestion;
    nextAuto[side] = suggestion;
    changed = true;
  }

  if (!changed) return null;
  return { teamStrokesOverride: nextOverride, teamStrokesOverrideAuto: nextAuto };
}
