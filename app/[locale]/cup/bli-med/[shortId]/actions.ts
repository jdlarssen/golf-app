'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { joinCupCore, leaveCupCore } from '@/lib/cup/cupJoinCore';

/**
 * Server-actions for spillerens ene dør inn i en cup: `/cup/bli-med/[shortId]`
 * (#1490).
 *
 * Egen fil, IKKE `lib/cup/planActions.ts`: den er arrangør-gatet
 * (`requireAdminOrClubAdminOfCup`), denne er spiller-gatet. To gate-regimer i
 * samme fil er hvordan en gate ved et uhell arver den andres antakelser.
 *
 * Reglene og skrivingen bor i `lib/cup/cupJoinCore.ts`, delt med appens rute (#2752).
 * Feil returneres som `{ error: kode }` (#1397); kun suksess redirecter.
 */

export type CupJoinActionError = { error: string };

function joinPath(shortId: string, sub = ''): string {
  return `/cup/bli-med/${shortId}${sub}`;
}

/**
 * Meld meg på. Vaktene kjøres i `evaluateCupJoin` (ren logikk) FØR noe skrives.
 *
 * `already_joined` er ingen feil — spilleren står der hun ville stå, så vi
 * redirecter til bekreftelses-tilstanden i stedet for å vise et banner.
 */
export async function joinCup(
  formData: FormData,
): Promise<CupJoinActionError> {
  const shortId = String(formData.get('short_id') ?? '').trim();
  const locale = await getLocale();
  if (!shortId) return { error: 'not_found' };

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Utløpt session: samme dør som den anonyme besøkende får på selve siden, så
  // de to inngangene er enige. Ingen skjema-input går tapt (#1397 gjelder felt,
  // og her finnes ingen).
  if (!user) redirect({ href: `/login?next=${joinPath(shortId)}`, locale });

  const result = await joinCupCore(shortId, user.id);
  if (!result.ok) return { error: result.error };
  if (result.status === 'already_joined') redirect({ href: joinPath(shortId), locale });

  redirect({ href: `${joinPath(shortId)}?status=${result.status}`, locale });
}

/**
 * Meld meg av. Rører ALDRI allerede genererte matcher — samme semantikk som
 * `removeCupParticipant`: `games` er fasit, og arrangøren regenererer eller
 * setter inn en reserve. Varselet til skaperen er kompensasjonen.
 */
export async function leaveCup(
  formData: FormData,
): Promise<CupJoinActionError> {
  const shortId = String(formData.get('short_id') ?? '').trim();
  const locale = await getLocale();
  if (!shortId) return { error: 'not_found' };

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: `/login?next=${joinPath(shortId)}`, locale });

  const result = await leaveCupCore(shortId, user.id);
  if (!result.ok) return { error: result.error };
  // Allerede ute: hun ville være avmeldt, og det er hun.
  if (result.status === 'not_joined') redirect({ href: joinPath(shortId), locale });

  redirect({ href: `${joinPath(shortId)}?status=${result.status}`, locale });
}
