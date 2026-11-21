'use server';

import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { expectOne } from '@/lib/supabase/affectedRows';
import { isAcceptablePinAccuracy } from '@/lib/geo/pinRules';

/** `unique_violation`, raised by green_pins_gate (0251) for a repeat pin. */
const ALREADY_PINNED_CODE = '23505';

export type SaveGreenPinResult =
  | { ok: true }
  | { ok: false; error: 'unauthenticated' | 'invalid' | 'weak_gps' | 'save_failed' };

/**
 * Lagrer et green-pin (#1210): spillerens GPS-posisjon i det score tastes
 * på/ved greenen. Én rad per trykk; medianen av radene blir green-senteret
 * (lib/geo/greenCenter.ts, regnet server-side ved lesing).
 *
 * Authz-lag (bug-prevention trap #3 — enforcement bor i DB-en):
 *  - `getServerClient` (user-scoped) — ALDRI admin-client her: RLS-policyen
 *    `green_pins insert own` (with check user_id = auth.uid()) er selve
 *    håndhevelsen, og admin-clienten ville bypasset akkurat den.
 *  - `user_id` settes fra proxy-verifisert session, aldri fra klient-payload.
 *  - `green_pins_gate`-triggeren (0142, 0251) er ytre vakt mot masse-insert:
 *    maks tre pins per hull i vinduet, bare fra en spiller i en runde som
 *    pågår på banen, og én per spiller og hull. Chip-gaten
 *    (freshPinCount < 3) er bare rådgivende klient-side.
 *
 * Accuracy-taket (30 m) håndheves HER — server-action er autoritativ, klienten
 * pre-sjekker samme konstant fra lib/geo/pinRules.ts (contract Key Decisions).
 */
export async function saveGreenPin(input: {
  courseId: string;
  holeNumber: number;
  lat: number;
  lng: number;
  accuracyM: number | null;
}): Promise<SaveGreenPinResult> {
  const callerId = await getProxyVerifiedUserId();
  if (!callerId) return { ok: false, error: 'unauthenticated' };

  const { courseId, holeNumber, lat, lng, accuracyM } = input;
  if (
    typeof courseId !== 'string' ||
    courseId.length === 0 ||
    !Number.isInteger(holeNumber) ||
    holeNumber < 1 ||
    holeNumber > 18 ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return { ok: false, error: 'invalid' };
  }

  // Autoritativ kvalitetssjekk: manglende eller svak accuracy avvises (kvalitet
  // per datapunkt er viktig ved 4–20 brukere, designdok §Pinne).
  if (!isAcceptablePinAccuracy(accuracyM)) {
    return { ok: false, error: 'weak_gps' };
  }

  const supabase = await getServerClient();
  try {
    // .select('id') uten user_id — authenticated har ikke kolonne-privilegium
    // på user_id (presence-vernet i 0142), så en select * her ville feilet.
    const inserted = await supabase
      .from('green_pins')
      .insert({
        course_id: courseId,
        hole_number: holeNumber,
        lat,
        lng,
        accuracy_m: accuracyM,
        user_id: callerId,
      })
      .select('id');
    // 0251: one pin per player and hole inside the gate's window. The gate
    // answers a second one with unique_violation. The player already gave
    // this hole its position, so the chip thanks them and goes away.
    if (inserted.error?.code === ALREADY_PINNED_CODE) return { ok: true };
    expectOne(inserted, 'saveGreenPin');
  } catch (error) {
    // Dekker RLS-avvisning, gate-trigger (pin #4 i vinduet — chip-gaten var
    // stale), CHECK-brudd og nettverksfeil. Alle er ikke-kritiske for brukeren:
    // et tapt pin koster ingenting, neste runde tar det.
    console.error('[saveGreenPin] insert failed', {
      courseId,
      holeNumber,
      error,
    });
    return { ok: false, error: 'save_failed' };
  }

  // Ingen revalidateTag: pins leses direkte per request i hull-page-en
  // (course-data, holdt UTENFOR game-${id}-cachen — se kontrakt §Design 3).
  return { ok: true };
}
