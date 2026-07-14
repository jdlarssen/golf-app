// Shared FormData parser for the side-tournament config fields used by both
// /admin/games/new and /admin/games/[id]/edit actions. Returns a discriminated
// result so each caller can redirect to its own URL with the matching error code.

import { type SideCategoryId } from '@/lib/scoring/sideTournamentConfig';

export type SideTournamentPayload = {
  enabled: boolean;
  ldCount: 0 | 1 | 2;
  ctpCount: 0 | 1 | 2;
  /**
   * Alltid tom — kategori-config er fjernet (#1139); alle kategorier er alltid
   * aktive for nye spill (Full pakke). Feltet beholdes fordi det skrives til
   * `games.side_disabled_categories`, og lese-siden fortsatt leser kolonnen for
   * eldre spill.
   */
  disabledCategories: SideCategoryId[];
};

export type SideTournamentParseResult =
  | { ok: true; payload: SideTournamentPayload }
  | {
      ok: false;
      errorCode: 'bad_side_ld_count' | 'bad_side_ctp_count';
    };

export function parseSideTournamentFromFormData(
  formData: FormData,
): SideTournamentParseResult {
  const enabledRaw = formData.get('side_tournament_enabled');
  const enabled = enabledRaw === 'true';

  if (!enabled) {
    return {
      ok: true,
      payload: {
        enabled: false,
        ldCount: 0,
        ctpCount: 0,
        disabledCategories: [],
      },
    };
  }

  const ld = Number(formData.get('side_ld_count'));
  if (!Number.isInteger(ld) || ld < 0 || ld > 2) {
    return { ok: false, errorCode: 'bad_side_ld_count' };
  }
  const ctp = Number(formData.get('side_ctp_count'));
  if (!Number.isInteger(ctp) || ctp < 0 || ctp > 2) {
    return { ok: false, errorCode: 'bad_side_ctp_count' };
  }

  // Kategori-config er fjernet (#1139): alle kategorier er alltid aktive for nye
  // spill. Vi ignorerer bevisst enhver `side_disabled_categories` i FormData, så
  // en håndlaget POST ikke kan slå av kategorier (T3-kompensasjon).
  return {
    ok: true,
    payload: {
      enabled: true,
      ldCount: ld as 0 | 1 | 2,
      ctpCount: ctp as 0 | 1 | 2,
      disabledCategories: [],
    },
  };
}
