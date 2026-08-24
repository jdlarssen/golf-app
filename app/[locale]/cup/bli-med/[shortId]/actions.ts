'use server';

import { revalidateTag } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';
import { evaluateCupJoin, evaluateCupLeave } from '@/lib/cup/joinValidation';
import {
  getCupJoinContext,
  type CupJoinCup,
} from '@/lib/cup/getCupJoinContext';

/**
 * Server-actions for spillerens ene dør inn i en cup: `/cup/bli-med/[shortId]`
 * (#1490).
 *
 * Egen fil, IKKE `lib/cup/planActions.ts`: den er arrangør-gatet
 * (`requireAdminOrClubAdminOfCup`), denne er spiller-gatet. To gate-regimer i
 * samme fil er hvordan en gate ved et uhell arver den andres antakelser.
 *
 * Skrivingen går via service-role (`getAdminClient`) fordi
 * `tournament_participants` med vilje ikke har write-RLS (0155-mønsteret) —
 * gaten er `evaluateCupJoin`/`evaluateCupLeave` her i koden, og ingenting bak
 * den. Feil returneres som `{ error: kode }` (#1397); kun suksess redirecter.
 */

export type CupJoinActionError = { error: string };

function joinPath(shortId: string, sub = ''): string {
  return `/cup/bli-med/${shortId}${sub}`;
}

/**
 * Lokal kopi av `revalidateCup` i planActions — samme tagger og stier. En delt
 * helper ville måttet eksporteres fra en `'use server'`-fil (= et unødvendig
 * action-endepunkt), som er nøyaktig grunnen planActions oppgir for å holde
 * `cupPath` lokal. Endres den ene, endres den andre.
 */
function revalidateCup(id: string, groupId: string | null): void {
  revalidateTag(`tournament-${id}`, 'max');
  revalidatePath(`/admin/cup/${id}`);
  if (groupId) revalidatePath(`/klubber/${groupId}/cup/${id}`);
}

/**
 * Varsle cupens skaper om at deltakerlista endret seg. Best-effort i ordets
 * fulle betydning: en feil her skal aldri velte spillerens påmelding, så den
 * fanges og logges. Skaperen som melder seg på sin egen cup varsler ikke seg
 * selv.
 */
async function notifyCreator(
  cup: CupJoinCup,
  actorUserId: string,
  action: 'joined' | 'left',
): Promise<void> {
  if (cup.created_by === actorUserId) return;
  try {
    const admin = getAdminClient();
    const { data: actor } = await admin
      .from('users')
      .select('name, nickname')
      .eq('id', actorUserId)
      .maybeSingle<{ name: string | null; nickname: string | null }>();

    await notify({
      userId: cup.created_by,
      kind: 'cup_signup',
      payload: {
        tournament_id: cup.id,
        tournament_name: cup.name,
        group_id: cup.group_id,
        // null → innboks-kortet fyller den lokaliserte fallbacken (#583).
        participant_name: actor?.nickname?.trim() || actor?.name?.trim() || null,
        action,
      },
    });
  } catch (err) {
    console.error('[cup] cup_signup notify failed', {
      tournamentId: cup.id,
      action,
      err,
    });
  }
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

  const { cup, facts } = await getCupJoinContext(shortId, user!.id);
  const decision = evaluateCupJoin(facts);

  if (decision === 'already_joined') {
    redirect({ href: joinPath(shortId), locale });
  }
  if (decision !== 'can_join') return { error: decision };

  // Upsert med ignoreDuplicates: to raske trykk = stille no-op, ikke en feil.
  // Bevisst INGEN `expectAffected` — duplikatet ER det legitime 0-rads-utfallet
  // her, i motsetning til skrivestier der 0 rader avslører en feil (felle #2).
  const { error: insertErr } = await getAdminClient()
    .from('tournament_participants')
    .upsert(
      { tournament_id: cup!.id, user_id: user!.id },
      { onConflict: 'tournament_id,user_id', ignoreDuplicates: true },
    );
  if (insertErr) {
    console.error('[cup] joinCup failed', {
      tournamentId: cup!.id,
      userId: user!.id,
      error: insertErr,
    });
    return { error: 'save_failed' };
  }

  revalidateCup(cup!.id, cup!.group_id);
  await notifyCreator(cup!, user!.id, 'joined');

  redirect({ href: `${joinPath(shortId)}?status=joined`, locale });
  return { error: '' }; // unreachable — redirect() kaster NEXT_REDIRECT
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

  const { cup, facts } = await getCupJoinContext(shortId, user!.id);
  const decision = evaluateCupLeave(facts);

  if (decision === 'not_joined') {
    // Allerede ute — hun ville være avmeldt, og det er hun. Ærlig no-op.
    redirect({ href: joinPath(shortId), locale });
  }
  if (decision !== 'can_leave') return { error: decision };

  // Scopet til EGEN rad: `user_id`-filteret er det som gjør at en spiller
  // aldri kan melde av noen andre. Bevisst INGEN `expectAffected` — 0 rader
  // her er en ærlig no-op (raden er allerede borte), som i
  // `removeCupParticipant`.
  const { error: deleteErr } = await getAdminClient()
    .from('tournament_participants')
    .delete()
    .eq('tournament_id', cup!.id)
    .eq('user_id', user!.id);
  if (deleteErr) {
    console.error('[cup] leaveCup failed', {
      tournamentId: cup!.id,
      userId: user!.id,
      error: deleteErr,
    });
    return { error: 'save_failed' };
  }

  revalidateCup(cup!.id, cup!.group_id);
  await notifyCreator(cup!, user!.id, 'left');

  redirect({ href: `${joinPath(shortId)}?status=left`, locale });
  return { error: '' }; // unreachable — redirect() kaster NEXT_REDIRECT
}
