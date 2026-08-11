import type { CupBundleFormat } from './cupPairing';

/**
 * Hvor en cup-matchs HCP-allowance skal bo (#1539/#1551).
 *
 * Appen har to lag som kan bære en allowance, og de anvendes på hver sin side
 * av frysingen:
 *
 * 1. `games.hcp_allowance_pct` — anvendt ÉN gang ved start, når
 *    `startScheduledGame` fryser `game_players.course_handicap`. Alle flater
 *    leser den frosne verdien rått etterpå.
 * 2. `mode_config.allowance_pct` — anvendt ved BEREGNING, per spiller, oppå det
 *    frosne banehandicapet (`fourballMatchplay.ts`-mønsteret).
 *
 * Bærer begge lagene en verdi ≠ 100 for samme spill, trekkes allowancen to
 * ganger. Det var feilen i Ryder Cup 2026: 85 % ved frysing OG 85 % i
 * cup-poenget ga effektivt ~72 %, mens kampens egen tavle viste 85 %. Denne
 * modulen er det ene stedet fordelingen bestemmes, og
 * `cupMatchAllowance.test.ts` håndhever at høyst ett lag bærer den.
 *
 * Fordelingen per format:
 * - `best_ball` bor i lag 1. Motoren (`lib/scoring/modes/bestBall.ts`) leser
 *   det frosne banehandicapet rått og har ingen `allowance_pct` i sin
 *   `GameModeConfig` — akkurat som frittstående best ball opprettet i
 *   veiviseren, som får allowancen fra `games.hcp_allowance_pct`. Cup-best-ball
 *   og frittstående best ball regner dermed likt.
 * - Matchplay-familiens 2v2-format bor i lag 2: deres compute-funksjoner kaller
 *   `applyAllowance` selv og forutsetter at det frosne tallet er rått.
 * - `singles_matchplay` spilles på fullt banehandicap og bærer ingen allowance.
 */
export type CupAllowancePcts = {
  fourball: number;
  foursomes: number;
  greensome: number;
  chapman: number;
  gruesome: number;
  /**
   * #1441 (D4/D11) ASSUMPTION: `tournaments` har ingen egen
   * `best_ball_allowance_pct`-kolonne (ingen migrasjon la til én — 0153/0154
   * dekker kun win/tie-poeng + sidepoeng) — og best_ball ER fourball spilt
   * som slagspill, med samme WHS-default (85 %, `ALLOWANCE_DEFAULTS.fourball
   * === ALLOWANCE_DEFAULTS.bestBall`). Kilde, i prioritert rekkefølge (F3c
   * → #1472): planens lagrede `best_ball_allowance_pct` (splittet-cup-dag-
   * feltet i Oppsett-rommet) → cupens `fourball_allowance_pct`-override
   * (default 85 når cupen ikke har satt en). Splittet-cup-dag-bunten bruker ALDRI
   * `fourball_matchplay` som eget sesjonsformat (bunten er
   * greensome+best_ball+singles, se `cupTemplates.ts`), så gjenbruket
   * kolliderer aldri med en faktisk fourball-matches egen allowance i samme
   * cup.
   */
  bestBall: number;
};

export type CupMatchAllowance = {
  /** Verdien `games.hcp_allowance_pct` skal ha. 100 = ingen allowance ved frysing. */
  hcpAllowancePct: number;
  /** Verdien `mode_config.allowance_pct` skal ha, eller `null` for «feltet skal ikke finnes». */
  modeConfigAllowancePct: number | null;
};

/**
 * Alle formater en cup-match kan ha — invariant-testen itererer over denne.
 *
 * Utledet fra et `Record<CupBundleFormat, true>` og ikke skrevet som en løs
 * liste: en ny `CupBundleFormat` som ikke legges til her gir kompileringsfeil.
 * En liste med `satisfies readonly CupBundleFormat[]` ville bare sjekket at
 * hvert element ER et gyldig format, ikke at ALLE formatene er med — og et
 * format som mangler her ville sluppet stille forbi invarianten.
 */
const CUP_MATCH_FORMAT_KEYS: Record<CupBundleFormat, true> = {
  singles_matchplay: true,
  fourball_matchplay: true,
  foursomes_matchplay: true,
  greensome_matchplay: true,
  chapman_matchplay: true,
  gruesome_matchplay: true,
  best_ball: true,
};

export const ALL_CUP_MATCH_FORMATS = Object.keys(
  CUP_MATCH_FORMAT_KEYS,
) as CupBundleFormat[];

/**
 * Bestemmer hvilket lag som bærer allowancen for én cup-match.
 *
 * Kalles av `createCupMatchesFromPlan` for både `games`-raden og `mode_config`,
 * slik at de to feltene ikke kan settes uavhengig av hverandre.
 */
export function cupMatchAllowance(
  format: CupBundleFormat,
  allowances: CupAllowancePcts,
): CupMatchAllowance {
  if (format === 'best_ball') {
    return { hcpAllowancePct: allowances.bestBall, modeConfigAllowancePct: null };
  }
  if (format === 'singles_matchplay') {
    return { hcpAllowancePct: 100, modeConfigAllowancePct: null };
  }
  // Uttømmende switch, ikke en ternær-kjede med hale: et framtidig format som
  // ikke får en egen gren feiler på `never`-vakten i stedet for å arve
  // gruesomes prosent i det stille.
  let modeConfigAllowancePct: number;
  switch (format) {
    case 'fourball_matchplay':
      modeConfigAllowancePct = allowances.fourball;
      break;
    case 'foursomes_matchplay':
      modeConfigAllowancePct = allowances.foursomes;
      break;
    case 'greensome_matchplay':
      modeConfigAllowancePct = allowances.greensome;
      break;
    case 'chapman_matchplay':
      modeConfigAllowancePct = allowances.chapman;
      break;
    case 'gruesome_matchplay':
      modeConfigAllowancePct = allowances.gruesome;
      break;
    default: {
      const unreachable: never = format;
      throw new Error(`Ukjent cup-format: ${String(unreachable)}`);
    }
  }
  return { hcpAllowancePct: 100, modeConfigAllowancePct };
}
