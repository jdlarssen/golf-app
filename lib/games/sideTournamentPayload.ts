// Shared FormData parser for the side-tournament config fields used by both
// /admin/games/new and /admin/games/[id]/edit actions. Returns a discriminated
// result so each caller can redirect to its own URL with the matching error code.

export type SideTournamentPayload = {
  enabled: boolean;
  ldCount: 0 | 1 | 2;
  ctpCount: 0 | 1 | 2;
};

export type SideTournamentParseResult =
  | { ok: true; payload: SideTournamentPayload }
  | { ok: false; errorCode: 'bad_side_ld_count' | 'bad_side_ctp_count' };

export function parseSideTournamentFromFormData(
  formData: FormData,
): SideTournamentParseResult {
  const enabledRaw = formData.get('side_tournament_enabled');
  const enabled = enabledRaw === 'true';

  if (!enabled) {
    return { ok: true, payload: { enabled: false, ldCount: 0, ctpCount: 0 } };
  }

  const ld = Number(formData.get('side_ld_count'));
  if (!Number.isInteger(ld) || ld < 0 || ld > 2) {
    return { ok: false, errorCode: 'bad_side_ld_count' };
  }
  const ctp = Number(formData.get('side_ctp_count'));
  if (!Number.isInteger(ctp) || ctp < 0 || ctp > 2) {
    return { ok: false, errorCode: 'bad_side_ctp_count' };
  }

  return {
    ok: true,
    payload: {
      enabled: true,
      ldCount: ld as 0 | 1 | 2,
      ctpCount: ctp as 0 | 1 | 2,
    },
  };
}
