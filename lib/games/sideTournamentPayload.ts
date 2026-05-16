// Shared FormData parser for the side-tournament config fields used by both
// /admin/games/new and /admin/games/[id]/edit actions. Returns a discriminated
// result so each caller can redirect to its own URL with the matching error code.

import {
  ALL_CATEGORY_IDS,
  type SideCategoryId,
} from '@/lib/scoring/sideTournamentConfig';

export type SideTournamentPayload = {
  enabled: boolean;
  ldCount: 0 | 1 | 2;
  ctpCount: 0 | 1 | 2;
  /**
   * v1.2.0 — kategorier brukeren har slått av. Tomt array betyr alle aktive
   * (Full pakke). Lagres i `games.side_disabled_categories`. Når
   * `enabled === false`, returneres alltid tomt array (irrelevant når
   * sideturneringen er av).
   */
  disabledCategories: SideCategoryId[];
};

export type SideTournamentParseResult =
  | { ok: true; payload: SideTournamentPayload }
  | {
      ok: false;
      errorCode:
        | 'bad_side_ld_count'
        | 'bad_side_ctp_count'
        | 'bad_side_disabled_categories';
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

  // Checkbox-array: each checked category submits as a separate form value
  // under the same name. `getAll` returns them as `FormDataEntryValue[]`
  // (string | File); only string values are valid here.
  const rawCategories = formData.getAll('side_disabled_categories');
  const disabledCategories: SideCategoryId[] = [];
  for (const v of rawCategories) {
    if (typeof v !== 'string') {
      return { ok: false, errorCode: 'bad_side_disabled_categories' };
    }
    if (!(ALL_CATEGORY_IDS as readonly string[]).includes(v)) {
      return { ok: false, errorCode: 'bad_side_disabled_categories' };
    }
    disabledCategories.push(v as SideCategoryId);
  }

  return {
    ok: true,
    payload: {
      enabled: true,
      ldCount: ld as 0 | 1 | 2,
      ctpCount: ctp as 0 | 1 | 2,
      disabledCategories,
    },
  };
}
