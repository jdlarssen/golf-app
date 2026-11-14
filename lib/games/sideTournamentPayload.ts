// Shared FormData parser for the side-tournament config fields used by both
// /admin/games/new and /admin/games/[id]/edit actions. Returns a discriminated
// result so each caller can redirect to its own URL with the matching error code.

import { type SideCategoryId } from '@/lib/scoring/sideTournamentConfig';
import { parseSideContestHole } from './sideContest';

/**
 * #2283: the hole for each slot, `games.side_ld_holes`/`side_ctp_holes`. One
 * element per slot up to the count; null for a slot without a hole. Null for
 * the whole column when no slot has one, as before the holes existed.
 */
export type SideSlotHoles = (number | null)[] | null;

export type SideTournamentPayload = {
  enabled: boolean;
  ldCount: 0 | 1 | 2;
  ctpCount: 0 | 1 | 2;
  ldHoles: SideSlotHoles;
  ctpHoles: SideSlotHoles;
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
      errorCode:
        | 'bad_side_ld_count'
        | 'bad_side_ctp_count'
        | 'bad_side_ld_holes'
        | 'bad_side_ctp_holes';
    };

/**
 * #2283: `side_ld_hole_N`/`side_ctp_hole_N` for slot 1…count. A field that is
 * missing or blank is a slot without a hole; a slot past the count is never
 * read. Fails on a value outside 1–18 and on two slots of one category on the
 * same hole: the flights report per category and hole, so the two slots would
 * share one report.
 */
function parseSlotHoles(
  formData: FormData,
  prefix: 'side_ld_hole_' | 'side_ctp_hole_',
  count: number,
): { ok: true; holes: SideSlotHoles } | { ok: false } {
  const holes: (number | null)[] = [];
  for (let slot = 1; slot <= count; slot++) {
    const raw = formData.get(`${prefix}${slot}`);
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (text === '') {
      holes.push(null);
      continue;
    }
    const hole = parseSideContestHole(text);
    if (hole === null) return { ok: false };
    holes.push(hole);
  }
  const chosen = holes.filter((hole) => hole !== null);
  if (new Set(chosen).size !== chosen.length) return { ok: false };
  return { ok: true, holes: chosen.length === 0 ? null : holes };
}

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
        ldHoles: null,
        ctpHoles: null,
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

  const ldHoles = parseSlotHoles(formData, 'side_ld_hole_', ld);
  if (!ldHoles.ok) {
    return { ok: false, errorCode: 'bad_side_ld_holes' };
  }
  const ctpHoles = parseSlotHoles(formData, 'side_ctp_hole_', ctp);
  if (!ctpHoles.ok) {
    return { ok: false, errorCode: 'bad_side_ctp_holes' };
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
      ldHoles: ldHoles.holes,
      ctpHoles: ctpHoles.holes,
      disabledCategories: [],
    },
  };
}
