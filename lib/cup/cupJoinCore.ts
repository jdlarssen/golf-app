import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';
import { CupJoinReadError } from './cupJoinErrors';
import { getCupJoinContext, type CupJoinContext, type CupJoinCup } from './getCupJoinContext';
import { evaluateCupJoin, evaluateCupLeave, type CupJoinDecision, type CupLeaveDecision } from './joinValidation';
import { revalidateCupSetup } from './setupCore';

/**
 * Spillerens ene dør inn i en cup (#1490), delt av nettets `/cup/bli-med/[shortId]` og
 * appens rute (#2752). Skrivingen går via service-role fordi `tournament_participants`
 * med vilje ikke har write-RLS (0155-mønsteret), så gaten er `evaluateCupJoin` og
 * `evaluateCupLeave` her, og ingenting bak den. `userId` kommer fra kalleren sin
 * innlogging, aldri fra en kropp.
 */

export type CupJoinError = Exclude<CupJoinDecision, 'can_join' | 'already_joined'> | 'read_failed' | 'save_failed';
export type CupLeaveError = Exclude<CupLeaveDecision, 'can_leave' | 'not_joined'> | 'read_failed' | 'save_failed';

export type CupJoinResult =
  | { ok: true; status: 'joined' | 'joined_self' | 'already_joined' }
  | { ok: false; error: CupJoinError };
export type CupLeaveResult =
  | { ok: true; status: 'left' | 'left_self' | 'not_joined' }
  | { ok: false; error: CupLeaveError };

/**
 * Er den som trykker cupens egen skaper? Ett hjem for fakta, to konsekvenser:
 * varselet droppes (ingen varsler seg selv), OG bekreftelsen sier noe annet —
 * «vi sa fra til arrangøren» er usant når arrangøren er deg.
 */
function actorIsCreator(cup: CupJoinCup, actorUserId: string): boolean {
  return cup.created_by === actorUserId;
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
  if (actorIsCreator(cup, actorUserId)) return;
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

/** KUN lesingen fanges. Feiler den, vet vi ingenting, og vi sier nei (#1863). */
async function readContext(shortId: string, userId: string): Promise<CupJoinContext | null> {
  try {
    return await getCupJoinContext(shortId, userId);
  } catch (err) {
    if (err instanceof CupJoinReadError) return null;
    throw err;
  }
}

/**
 * Meld meg på. `already_joined` er ingen feil: spilleren står der hun ville stå.
 * Egen cup gir egen bekreftelse, for da fikk ingen beskjed.
 */
export async function joinCupCore(shortId: string, userId: string): Promise<CupJoinResult> {
  const context = await readContext(shortId, userId);
  if (!context) return { ok: false, error: 'read_failed' };

  const { cup, facts } = context;
  const decision = evaluateCupJoin(facts);
  if (decision === 'already_joined') return { ok: true, status: 'already_joined' };
  if (decision !== 'can_join') return { ok: false, error: decision };

  // Upsert med ignoreDuplicates: to raske trykk = stille no-op, ikke en feil.
  // Bevisst INGEN `expectAffected`: duplikatet ER det legitime 0-rads-utfallet her,
  // i motsetning til skrivestier der 0 rader avslører en feil (felle #2).
  const { error: insertErr } = await getAdminClient()
    .from('tournament_participants')
    .upsert(
      { tournament_id: cup!.id, user_id: userId },
      { onConflict: 'tournament_id,user_id', ignoreDuplicates: true },
    );
  if (insertErr) {
    console.error('[cup] joinCup failed', { tournamentId: cup!.id, userId, error: insertErr });
    return { ok: false, error: 'save_failed' };
  }

  revalidateCupSetup(cup!.id, cup!.group_id);
  await notifyCreator(cup!, userId, 'joined');
  return { ok: true, status: actorIsCreator(cup!, userId) ? 'joined_self' : 'joined' };
}

/**
 * Meld meg av. Rører ALDRI allerede genererte matcher, som `removeCupParticipant`:
 * `games` er fasit, og arrangøren regenererer eller setter inn en reserve. Varselet til
 * skaperen er kompensasjonen.
 */
export async function leaveCupCore(shortId: string, userId: string): Promise<CupLeaveResult> {
  const context = await readContext(shortId, userId);
  if (!context) return { ok: false, error: 'read_failed' };

  const { cup, facts } = context;
  const decision = evaluateCupLeave(facts);
  if (decision === 'not_joined') return { ok: true, status: 'not_joined' };
  if (decision !== 'can_leave') return { ok: false, error: decision };

  // Scopet til EGEN rad: `user_id`-filteret er det som gjør at en spiller aldri kan
  // melde av noen andre. 0 rader her er en ærlig no-op (raden er alt borte).
  const { error: deleteErr } = await getAdminClient()
    .from('tournament_participants')
    .delete()
    .eq('tournament_id', cup!.id)
    .eq('user_id', userId);
  if (deleteErr) {
    console.error('[cup] leaveCup failed', { tournamentId: cup!.id, userId, error: deleteErr });
    return { ok: false, error: 'save_failed' };
  }

  revalidateCupSetup(cup!.id, cup!.group_id);
  await notifyCreator(cup!, userId, 'left');
  return { ok: true, status: actorIsCreator(cup!, userId) ? 'left_self' : 'left' };
}
