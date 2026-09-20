'use server';

import { getAdminClient } from '@/lib/supabase/admin';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { expectOne } from '@/lib/supabase/affectedRows';
import { isKavalkadeCardKind } from '@/lib/kavalkade/cardModel';

export type LogShareResult = { ok: true } | { ok: false; error: LogShareError };

export type LogShareError =
  | 'not_authed'
  | 'unknown_card'
  | 'db_error';

/**
 * Teller én deling av et kavalkade-kort (#2130, epic #1040).
 *
 * Kalles av deleknappen når Web Share tok imot filen, eller når nedlastingen
 * startet. Det er så nær «kortet forlot appen» vi kommer: Web Share sier aldri
 * hvor filen havnet, og det skal den heller ikke.
 *
 * ## Hvorfor spilleren kommer fra sesjonen
 *
 * `user_id` leses fra sesjonen og aldri fra argumentene. En klient kan da
 * bare telle sine EGNE delinger, og desember-tallet i #1040 («delt av minst
 * tre spillere som ikke er Jørgen») kan ikke blåses opp med et POST-kall.
 * Skrivingen går med service-rollen, som er den eneste som har rettigheten
 * (migrasjon 0183).
 *
 * ## Best-effort, men aldri stille
 *
 * Knappen bryr seg ikke om svaret — en mislykket telling skal ikke ta fra
 * spilleren en deling som gikk fint. Men en skriving som traff null rader er
 * en feil, ikke en suksess (felle 2), så `expectOne` kaster, og vi logger den
 * på serveren før vi svarer `db_error`.
 */
export async function logKavalkadeShare(
  year: number,
  cardKind: string,
): Promise<LogShareResult> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return { ok: false, error: 'not_authed' };

  if (!Number.isInteger(year) || !isKavalkadeCardKind(cardKind)) {
    return { ok: false, error: 'unknown_card' };
  }

  try {
    expectOne(
      await getAdminClient()
        .from('kavalkade_shares')
        .insert({ user_id: userId, year, card_kind: cardKind })
        .select('id'),
      'logKavalkadeShare',
    );
    return { ok: true };
  } catch (err) {
    console.error('[logKavalkadeShare] could not record the share', {
      year,
      cardKind,
      err,
    });
    return { ok: false, error: 'db_error' };
  }
}
