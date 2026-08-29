/**
 * Ren validering av Oppsett-rommets form-verdier (#1472, Rom 1).
 *
 * Egen modul (ikke i `planActions.ts`) fordi den fila er `'use server'` — der er
 * kun async exports lov, og denne logikken skal testes direkte (Type A). Samme
 * grep som `pointsToWin.ts` / `allowance.ts` gjør for sine parsere.
 *
 * Ansvaret her er de DB-UAVHENGIGE feltene: preset, strategi, tilpasset-
 * sesjonsliste og best-ball-%. Bane/tee-eksistens og tee-off-parsing krever
 * DB/klokke og bor i server-actionen. Feilkodene er en fast kontrakt delt med
 * UI-chunken — regelens ene hjem for preset-gyldighet er `cupTemplates.ts`
 * (`CUP_PRESETS`), så ingen DB-CHECK duplikerer lista (AGENTS.md-felle #4).
 */

import { CUP_PRESETS, type CupSessionFormat } from './cupTemplates';

/**
 * Alle feilkodene Oppsett-rommet kan produsere (validator + server-action).
 * Fast kontrakt med UI-chunken som mapper hver kode til norsk copy.
 */
export type CupPlanError =
  | 'plan_course'
  | 'plan_tee'
  | 'plan_preset'
  | 'plan_strategy'
  | 'plan_sessions'
  | 'plan_best_ball'
  | 'plan_tee_off_invalid'
  | 'plan_tee_off_past'
  | 'not_found'
  | 'not_draft'
  | 'plan_save_failed';

export type CupStrategy = 'handicap' | 'random';

/** Normaliserte, validerte plan-verdier fra Oppsett-formen. */
export type CupPlanValues = {
  /** En av `CUP_PRESETS`- id-ene eller 'tilpasset'. */
  presetId: string;
  strategy: CupStrategy;
  /** Kun satt (≥1 element) for 'tilpasset'; `null` for de innebygde presetene. */
  customSessions: CupSessionFormat[] | null;
  /** Heltall 0–100, eller `null` når feltet var tomt. */
  bestBallAllowancePct: number | null;
};

export type CupPlanFormInput = {
  presetId: string;
  strategy: string;
  /** JSON-streng fra det skjulte custom-sessions-feltet (kun lest for 'tilpasset'). */
  customSessionsRaw: string;
  bestBallAllowanceRaw: string;
};

const VALID_PRESET_IDS = new Set<string>([
  ...CUP_PRESETS.map((p) => p.id),
  'tilpasset',
]);

/**
 * Runtime-oppslag over gyldige `CupSessionFormat`-medlemmer. Record-formen gir
 * kompileringstids-uttømmethet: legges et nytt medlem til unionen uten å oppdatere
 * dette objektet, feiler `tsc` her (samme grep som exhaustive switch-er).
 */
const SESSION_FORMAT_SET: Record<CupSessionFormat, true> = {
  foursomes_matchplay: true,
  fourball_matchplay: true,
  singles_matchplay: true,
  greensome_matchplay: true,
  chapman_matchplay: true,
  gruesome_matchplay: true,
};

function isCupSessionFormat(v: unknown): v is CupSessionFormat {
  return (
    typeof v === 'string' &&
    Object.prototype.hasOwnProperty.call(SESSION_FORMAT_SET, v)
  );
}

/**
 * Trygg normalisering av en jsonb `custom_sessions`-verdi → `CupSessionFormat[]`
 * (#1488, K7). Ett hjem for regelen som før lå duplisert verbatim i både
 * Oppsett- og Generer-flatene med hver sin lokale format-liste.
 * Gjenbruker `isCupSessionFormat`s `SESSION_FORMAT_SET`-uttømmelighet, så et nytt
 * `CupSessionFormat`-medlem dekkes automatisk. Ikke-array → `[]`.
 */
export function normalizeCustomSessions(raw: unknown): CupSessionFormat[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isCupSessionFormat);
}

/**
 * Parser best-ball-%: tom (etter trim) → `null`; ellers må det være et heltall
 * 0–100. Speiler tom/gyldig/ugyldig-kontrakten til `parseAllowancePct`, men
 * tomt betyr her «ingen verdi» (NULL i planen), ikke en app-fylt default.
 */
function parseBestBall(
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: 'plan_best_ball' } {
  const cleaned = raw.trim();
  if (cleaned === '') return { ok: true, value: null };
  const n = Number(cleaned);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    return { ok: false, error: 'plan_best_ball' };
  }
  return { ok: true, value: n };
}

/**
 * Flagg-formen (`ok: true/false`) er repoets dominante parser-idiom (#1783) —
 * samme som `CupDraftParseResult` og `SideAwardActionResult`.
 */
export type CupPlanParseResult =
  | { ok: true; values: CupPlanValues }
  | { ok: false; error: CupPlanError };

/**
 * Validerer og normaliserer Oppsett-formens DB-uavhengige felt.
 * `{ ok: true, values }` ved suksess, `{ ok: false, error }` ved første feil.
 */
export function parseCupPlanForm(input: CupPlanFormInput): CupPlanParseResult {
  const presetId = input.presetId.trim();
  if (!VALID_PRESET_IDS.has(presetId)) return { ok: false, error: 'plan_preset' };

  const strategy = input.strategy.trim();
  if (strategy !== 'handicap' && strategy !== 'random') {
    return { ok: false, error: 'plan_strategy' };
  }

  let customSessions: CupSessionFormat[] | null = null;
  if (presetId === 'tilpasset') {
    let parsed: unknown;
    try {
      // Tom streng er ikke gyldig JSON — fanges av catch-en → plan_sessions
      // (en tilpasset preset MÅ ha minst én sesjon).
      parsed = JSON.parse(input.customSessionsRaw);
    } catch {
      return { ok: false, error: 'plan_sessions' };
    }
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !parsed.every(isCupSessionFormat)
    ) {
      return { ok: false, error: 'plan_sessions' };
    }
    customSessions = parsed;
  }

  const bestBall = parseBestBall(input.bestBallAllowanceRaw);
  if (!bestBall.ok) return { ok: false, error: bestBall.error };

  return {
    ok: true,
    values: {
      presetId,
      strategy,
      customSessions,
      bestBallAllowancePct: bestBall.value,
    },
  };
}
