'use server';

import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import {
  logKavalkadeShareFor,
  type LogShareResult,
} from '@/lib/kavalkade/logKavalkadeShare';

/**
 * Teller én deling av et kavalkade-kort fra webben (#2130, epic #1040).
 *
 * Kjernen (kort-sjekken, skrivingen og feilhåndteringen) bor i
 * `lib/kavalkade/logKavalkadeShare.ts`, delt med appens rute (#2265). Actionen
 * gjør bare det som er webbens: `user_id` leses fra sesjonen og aldri fra
 * argumentene, så en klient bare kan telle sine EGNE delinger.
 */
export async function logKavalkadeShare(
  year: number,
  cardKind: string,
): Promise<LogShareResult> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return { ok: false, error: 'not_authed' };

  return logKavalkadeShareFor(userId, year, cardKind);
}
