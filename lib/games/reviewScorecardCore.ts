import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { expireGameCache } from './expireGameCache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected, NoRowsAffectedError } from '@/lib/supabase/affectedRows';
import { notify } from '@/lib/notifications/notify';
import { NO_REJECTION_REASON } from './rejectionReason';
import { sharedCardUserIds, type SharedCardRosterRow } from './scoreOwner';
import {
  modeCollapsesToTeamCard,
  type GameMode,
} from '@/lib/scoring/modes/types';

// Kjernen for «godkjenn», «avvis» og «åpne igjen» på et levert scorekort
// (#2215). Reglene bodde i webbens server-actions (`approve/actions.ts` og
// `reopenScorecard` i `admin/games/[id]/actions.ts`). Da appen skulle få de
// samme handlingene gjennom `app/api/games/[id]/scorecards/[userId]`, ville en
// kopi gitt reglene to hjem (AGENTS trap 4) — så de flyttet hit, og action-ene
// ble tynne wrappere. Samme grep som `submitScorecardCore.ts`.
//
// **Tilgang og spillstatus ligger hos KALLEREN.** Modulen spør aldri hvem som
// ringer eller om runden er i gang; den får id-er og stoler på at de er sjekket
// FØR kallet —
//   - server-action: `loadAndAuthorize` (godkjenn/avvis) og
//     `loadAdminOrCreatorContext` + status-lesingen (åpne igjen)
//   - HTTP-rute: `scorecardReviewAccess` (lib/api/appAuth) på Bearer-tokenet
//
// **Klienten er et argument** (samme mønster som `submitScorecardCore`): webben
// sender sin cookie-bundne RLS-klient, så skrivingene er byte-identiske med
// før; ruta sender `getAdminClient()`. Da no-op-er vakt-triggerne (`auth.uid()`
// er NULL), og porten i ruta er den eneste sjekken. Avvisning av et delt
// lagkort går uansett via admin-klienten (#2213, se `rejectSharedCard`).
//
// Varsel og cache-tømming bor HER, ikke hos kalleren: et glemt varsel eller en
// glemt `expireGameCache` i ruta er nettopp mangelen #2215 lukket.
//
// Logg-prefiksene følger med fra server-action-ene med vilje: de er
// søkestrengene i Vercel-loggen, og et navnebytte hadde gjort eksisterende
// feilsøkings-oppskrifter ugyldige.

type CoreClient = SupabaseClient<Database>;

/**
 * Utfallet av en godkjenning eller avvisning.
 *
 * `alreadyDone` = kortet sto alt slik handlingen ville satt det (dobbelttrykk,
 * to telefoner). Det er suksess, men uten nytt varsel. `not_pending` = 0 rader
 * og kortet står IKKE slik: tilgang nektet under RLS, eller kortet er ikke
 * levert (godkjenn) / finnes ikke (avvis).
 */
export type ReviewScorecardResult =
  | { ok: true; alreadyDone: boolean }
  | { ok: false; reason: 'not_pending' | 'db' };

/**
 * Utfallet av «åpne igjen». 0 rader er idempotent suksess her (kortet var
 * aldri levert, eller er alt åpnet), så eneste feil er `db`.
 * `reopenedUserIds` er radene som faktisk ble åpnet — webben logger dem i
 * admin-loggen for et delt lagkort.
 */
export type ReopenScorecardResult =
  | { ok: true; alreadyDone: boolean; reopenedUserIds: string[] }
  | { ok: false; reason: 'db' };

/** Cache og sider begge handlingene på /approve tømmer, også ved `alreadyDone`. */
function expireReviewedGame(gameId: string): void {
  expireGameCache(gameId);
  revalidatePath(`/games/${gameId}`);
  revalidatePath(`/games/${gameId}/approve`);
}

/**
 * Godkjenn en medspillers scorekort. Idempotent — er kortet alt godkjent, er
 * dette en no-op uten nytt varsel. Nuller en tidligere `rejection_reason` så
 * den ikke blir hengende.
 *
 * #2200: skrivingen bærer selv vaktas regler fra 0191, fordi ruta skriver med
 * service-role og vakta da ikke kjører:
 *   - bare et levert kort godkjennes (`submitted_at` satt), uansett rolle;
 *   - godkjenneren er alltid `approverUserId`, den som faktisk gjør det;
 *   - den som leverte kortet, godkjenner det ikke, med mindre kalleren sier
 *     `delivererMayApprove` — admin eller arrangør, samme unntak som vakta.
 *     Ukjent leverandør (kort levert før 0191) er som før.
 * Regelen står i samme UPDATE som godkjenningen, så porten og skrivingen ikke
 * kan komme i utakt. Et kort regelen stopper, blir `not_pending`.
 */
export async function approveScorecardCore(opts: {
  client: CoreClient;
  gameId: string;
  approverUserId: string;
  playerUserId: string;
  approverRole: 'peer' | 'organizer';
  /**
   * Admin eller arrangør (#2200). Påkrevd, så et nytt kallsted må ta stilling.
   * Ikke det samme som `approverRole`: webbens /approve sier `peer` også for
   * en admin, fordi rollen bare styrer ordlyden i varselet.
   */
  delivererMayApprove: boolean;
}): Promise<ReviewScorecardResult> {
  const { client, gameId, approverUserId, playerUserId, approverRole } = opts;

  let approve = client
    .from('game_players')
    .update({
      approved_at: new Date().toISOString(),
      approved_by_user_id: approverUserId,
      rejection_reason: null,
    })
    .eq('game_id', gameId)
    .eq('user_id', playerUserId)
    .not('submitted_at', 'is', null)
    .is('approved_at', null);
  if (!opts.delivererMayApprove) {
    approve = approve.or(
      `submitted_by_user_id.is.null,submitted_by_user_id.neq.${approverUserId}`,
    );
  }
  const { data: updated, error } = await approve.select('user_id');

  if (error) {
    console.error('[approveScorecard] update failed', { gameId, playerUserId, error });
    return { ok: false, reason: 'db' };
  }

  // #704: en 0-rads-UPDATE returnerer error == null (Supabase-quirk), så uten
  // denne vakta ville en RLS-blokkert peer-godkjenning rapportere falsk suksess
  // og sende varsel mens approved_at aldri ble skrevet. Skiller to 0-rads-grunner:
  //   • allerede godkjent → idempotent no-op (suksess, IKKE nytt varsel)
  //   • RLS/rad-tilgang nektet, kortet er ikke levert, eller godkjenneren
  //     leverte det (#2200) → ekte feil (ingen varsel)
  if (!updated || updated.length === 0) {
    const { data: existing } = await client
      .from('game_players')
      .select('approved_at')
      .eq('game_id', gameId)
      .eq('user_id', playerUserId)
      .maybeSingle<{ approved_at: string | null }>();

    if (existing?.approved_at) {
      // Allerede godkjent — idempotent. Ikke send varsel på nytt.
      expireReviewedGame(gameId);
      return { ok: true, alreadyDone: true };
    }
    return { ok: false, reason: 'not_pending' };
  }

  // Best-effort in-app varsel til submitter om at scorekortet er godkjent.
  // Vi henter game.name + approver.name parallelt og catch-er feil — notify()
  // skal aldri blokkere selve godkjenningen (per Phase 1-implementasjonen feiler
  // den stille på DB-error, men nettverks-feil under fetch kan kaste).
  try {
    const [gameRes, approverRes] = await Promise.all([
      client
        .from('games')
        .select('name')
        .eq('id', gameId)
        .single<{ name: string }>(),
      client
        .from('users')
        .select('name')
        .eq('id', approverUserId)
        .maybeSingle<{ name: string | null }>(),
    ]);
    // #1364: null i stedet for norsk plassholdertekst. Payloaden skrives i
    // godkjennerens kontekst men leses i mottakerens locale, så kortet fyller
    // fallbacken ved render (buildNotificationText).
    // #1598: `approver_role` forteller kortet HVILKEN fallback som gjelder når
    // navnet mangler. Kalleren avgjør rollen: webbens /approve er alltid en
    // medspiller (admin/arrangør-overstyringen er adminApproveScorecard), mens
    // app-ruta får den fra porten (`scorecardReviewAccess`).
    await notify({
      userId: playerUserId,
      kind: 'scorecard_approved',
      payload: {
        game_id: gameId,
        game_name: gameRes.data?.name ?? null,
        approver_name: approverRes.data?.name?.trim() || null,
        approver_role: approverRole,
      },
    });
  } catch (err) {
    console.error('[approveScorecard] scorecard_approved notify failed', err);
  }

  expireReviewedGame(gameId);
  return { ok: true, alreadyDone: false };
}

/**
 * Avvis en medspillers scorekort. Nuller submitted_at / approved_at og lagrer
 * grunnen på game_players så spill-hjem kan vise den. Sender et best-effort
 * `scorecard_rejected`-varsel (in-app + push når spilleren er borte) så
 * spilleren får vite at runden står, uten å måtte åpne spillet (#1358).
 *
 * Idempotent siden #1395 — en ny avvisning av samme kort er en no-op som
 * fortsatt er suksess, men sender ikke et nytt varsel.
 *
 * #2213: i ett-balls-lagformatene åpner avvisningen hele det aktive laget via
 * service-role (`rejectSharedCard`), siden hvert kort der leser kapteinens
 * rader. Alle andre moduser beholder én-rads-skrivingen med kallerens klient.
 */
export async function rejectScorecardCore(opts: {
  client: CoreClient;
  gameId: string;
  gameMode: GameMode;
  rejecterUserId: string;
  playerUserId: string;
  /** Teksten slik attestanten skrev den; trimmes og kuttes her. */
  rawReason: string;
}): Promise<ReviewScorecardResult> {
  const { client, gameId, gameMode, rejecterUserId, playerUserId } = opts;
  const reasonRaw = opts.rawReason.trim();
  // #1364: uten begrunnelse lagres en maskinsentinel, ikke norsk prosa — raden
  // leses av spillere i begge locales, og banneret på spill-hjem er gated på at
  // feltet er truthy (se NO_REJECTION_REASON for hvorfor null ikke går).
  const reason =
    reasonRaw.length > 0 ? reasonRaw.slice(0, 500) : NO_REJECTION_REASON;

  const rejectPatch = {
    submitted_at: null,
    approved_at: null,
    approved_by_user_id: null,
    rejection_reason: reason,
  };
  const sharedCard = modeCollapsesToTeamCard(gameMode, 18);
  // #2200: who delivered the card, read before the reject clears it (the 0191
  // trigger nulls submitted_by_user_id together with submitted_at). A shared
  // team card notifies the whole team anyway.
  const deliverer = sharedCard ? null : await cardDeliverer(client, gameId, playerUserId);
  const { data: updated, error } = sharedCard
    ? await rejectSharedCard(gameId, gameMode, playerUserId, rejectPatch)
    : await client
        .from('game_players')
        .update(rejectPatch)
        .eq('game_id', gameId)
        .eq('user_id', playerUserId)
        // #1395: kun et innlevert kort kan avvises. Uten filteret traff et
        // dobbelttrykk (eller en re-post av skjemaet) fortsatt 1 rad og fyrte et
        // nytt scorecard_rejected-varsel + push til spilleren.
        .not('submitted_at', 'is', null)
        .select('user_id');

  if (error) {
    console.error('[rejectScorecard] update failed', { gameId, playerUserId, error });
    return { ok: false, reason: 'db' };
  }

  // #704: samme 0-rads-felle som godkjenningen. Uten denne vakta ville en
  // RLS-blokkert peer-avvisning rapportere falsk suksess mens raden aldri ble
  // rørt.
  //
  // #1395: med submitted_at-filteret har 0 rader to lovlige grunner, akkurat som
  // ved godkjenning. Ett oppfølgings-SELECT skiller dem — attestanten kan lese
  // raden («game_players select shared game»: is_admin() OR is_in_game(game_id),
  // pluss «game_players creator select» for arrangøren som ikke spiller selv):
  //   • raden synlig med submitted_at = null → kortet er allerede avvist (eller
  //     aldri levert) → idempotent suksess, og INGEN nytt varsel.
  //   • raden usynlig/borte → tilgang nektet → `not_pending`.
  if (!updated || updated.length === 0) {
    const { data: existing } = await client
      .from('game_players')
      .select('submitted_at')
      .eq('game_id', gameId)
      .eq('user_id', playerUserId)
      .maybeSingle<{ submitted_at: string | null }>();

    if (existing && existing.submitted_at === null) {
      // Allerede avvist — idempotent. Tøm cachen så et stakkars «venter på
      // godkjenning»-UI ikke blir hengende, men ikke varsle på nytt.
      expireReviewedGame(gameId);
      return { ok: true, alreadyDone: true };
    }
    return { ok: false, reason: 'not_pending' };
  }

  // #1358: best-effort in-app varsel til spilleren om at kortet ble avvist.
  // notify() skal ALDRI blokkere selve avvisningen — raden er allerede skrevet
  // her, og /approve-banneret lover at spilleren varsles. Plasseringen etter
  // 0-rads-guarden er kritisk (I3): en RLS-blokkert avvisning (0 rader,
  // error == null — #704-fella) må ikke varsle om en skriving som aldri skjedde.
  //
  // DEPLOY-REKKEFØLGE: migrasjon 0149 må være påført før dette kjører i prod.
  // Uten den avviser notifications_kind_check inserten og notify() svelger
  // feilen (console.error '[notifications] insert failed') — grønt UI, ingen
  // varsel. Verifiser med en SELECT mot notifications etter staging-runden.
  //
  // #2213: on a shared team card, every row the cascade reopened is notified
  // except the rejecter — they know already, though their own card reopens
  // too (see rejectSharedCard).
  //
  // #2200: a card someone else delivered (a flightmate's or a guest's) is
  // also told to the one who delivered it. They keyed it and can put it
  // right; a guest never receives a notice at all. Their copy names whose
  // card it is.
  const recipients = sharedCard
    ? updated.map((r) => r.user_id).filter((id) => id !== rejecterUserId)
    : [playerUserId];
  const alsoDeliverer =
    deliverer != null && deliverer !== playerUserId && deliverer !== rejecterUserId
      ? deliverer
      : null;
  try {
    const [gameRes, rejecterRes, playerRes] = await Promise.all([
      client
        .from('games')
        .select('name')
        .eq('id', gameId)
        .single<{ name: string }>(),
      client
        .from('users')
        .select('name')
        .eq('id', rejecterUserId)
        .maybeSingle<{ name: string | null }>(),
      alsoDeliverer
        ? client
            .from('users')
            .select('name')
            .eq('id', playerUserId)
            .maybeSingle<{ name: string | null }>()
        : Promise.resolve({ data: null }),
    ]);
    const payload = {
      game_id: gameId,
      game_name: gameRes.data?.name ?? null,
      rejecter_name: rejecterRes.data?.name?.trim() || null,
      // Utelat feltet helt når attestanten ikke skrev noe, så kortet kan vise
      // en lokalisert defaultReason. DB-raden bærer sentinelen i stedet —
      // den styrer spill-hjem-banneret, som oversetter på samme måte.
      ...(reasonRaw.length > 0 ? { reason } : {}),
    };
    await Promise.all([
      ...recipients.map((userId) =>
        notify({ userId, kind: 'scorecard_rejected', payload }),
      ),
      ...(alsoDeliverer
        ? [
            notify({
              userId: alsoDeliverer,
              kind: 'scorecard_rejected',
              payload: { ...payload, player_name: playerRes.data?.name?.trim() || null },
            }),
          ]
        : []),
    ]);
  } catch (err) {
    console.error('[rejectScorecard] scorecard_rejected notify failed', err);
  }

  expireReviewedGame(gameId);
  return { ok: true, alreadyDone: false };
}

/**
 * #2200: who delivered this card, or `null`. Only feeds a notice, so a failed
 * read is logged and reads as «unknown» rather than stopping the reject.
 */
async function cardDeliverer(
  client: CoreClient,
  gameId: string,
  playerUserId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from('game_players')
    .select('submitted_by_user_id')
    .eq('game_id', gameId)
    .eq('user_id', playerUserId)
    .maybeSingle<{ submitted_by_user_id: string | null }>();
  if (error) {
    console.error('[rejectScorecard] deliverer read failed', { gameId, playerUserId, error });
    return null;
  }
  return data?.submitted_by_user_id ?? null;
}

/**
 * #2213: rejecting a shared team card. In the one-ball formats
 * (`modeCollapsesToTeamCard`) every card on the team reads the captain's rows.
 * Clearing only the rejected card left the captain's row submitted, so the hole
 * page kept the team card locked (`anyTeamMemberSubmitted`) and RLS refused the
 * correction. The whole active team (`sharedCardUserIds`) reopens instead, in
 * ONE UPDATE, so the cascade is atomic (trap 5).
 *
 * The rejecter often plays on the team (in scramble with more than four players
 * flight = team), and their own card reopens too. That is deliberate: otherwise
 * one row on the team stays submitted and the lock stays. If their card was
 * approved, that approval is cleared as well, which a player cannot do on their
 * own row with the RLS client (the 0168 guard). Hence the service role. It
 * mirrors the delivery cascade (#1453) and sits behind the caller's gate:
 * `loadAndAuthorize` on the web or `scorecardReviewAccess` in the app route
 * (admin, or `canApproveScorecardFor` on the rejected card) has already let the
 * caller through.
 *
 * Returns the same shape as the one-row UPDATE, so the 0-row guard
 * (#704/#1395) and the notifications read both paths alike.
 */
async function rejectSharedCard(
  gameId: string,
  mode: GameMode,
  playerUserId: string,
  patch: {
    submitted_at: null;
    approved_at: null;
    approved_by_user_id: null;
    rejection_reason: string;
  },
) {
  const admin = getAdminClient();
  const { data: roster, error: rosterError } = await admin
    .from('game_players')
    .select('user_id, team_number, withdrawn_at')
    .eq('game_id', gameId)
    .returns<SharedCardRosterRow[]>();
  // A failed roster read is an error (`db`), not a cue to reopen just one
  // card — that would silently shrink the cascade back into the bug.
  if (rosterError) return { data: null, error: rosterError };
  return admin
    .from('game_players')
    .update(patch)
    .eq('game_id', gameId)
    .in('user_id', sharedCardUserIds(mode, roster ?? [], playerUserId))
    .not('submitted_at', 'is', null)
    .select('user_id');
}

/**
 * Åpne et levert scorekort igjen så spilleren kan rette og levere på nytt.
 * Nuller submitted_at, en eventuell godkjenning og en tidligere
 * rejection_reason — raden går tilbake til en ren «pågår»-tilstand.
 *
 * Kun arrangøren (admin eller oppretter) — det er kallerens port. Å åpne
 * oppretterens EGET godkjente kort krever i tillegg det smale unntaket i
 * trigger-vakta fra migrasjon 0159 når kalleren skriver under RLS.
 *
 * No-op-sikkert: skriver bare når raden har submitted_at satt.
 *
 * #2213: i ett-balls-lagformatene åpnes hele det aktive laget
 * (`reopenSharedCard`), siden hvert kort der leser kapteinens rader.
 *
 * Admin-loggen (`logAdminEvent`) bor hos webbens wrapper, ikke her: appens
 * logg for arrangørhandlinger er et bokført gap (#2215 «Ut av scope»).
 */
export async function reopenScorecardCore(opts: {
  client: CoreClient;
  gameId: string;
  gameMode: GameMode;
  gameName: string;
  /** Rått profilnavn eller null — aldri audit-strengen med «Admin»-fallback (#1598). */
  actorName: string | null;
  playerUserId: string;
}): Promise<ReopenScorecardResult> {
  const { client, gameId, gameMode, gameName, actorName, playerUserId } = opts;

  // #1363: expectAffected turns the silent 0-row UPDATE into an explicit
  // signal. 0 rows here means the scorecard was never submitted (already
  // reopened, idempotent no-op) or the player row doesn't exist. Same
  // precedent as adminApproveScorecard: success rather than an error, but
  // WITHOUT the audit log and the varsel for a write that never happened.
  const reopenPatch = {
    submitted_at: null,
    approved_at: null,
    approved_by_user_id: null,
    rejection_reason: null,
  };
  const sharedCard = modeCollapsesToTeamCard(gameMode, 18);
  let reopened: { user_id: string }[];
  try {
    reopened = expectAffected(
      sharedCard
        ? await reopenSharedCard(client, gameId, gameMode, playerUserId, reopenPatch)
        : await client
            .from('game_players')
            .update(reopenPatch)
            .eq('game_id', gameId)
            .eq('user_id', playerUserId)
            .not('submitted_at', 'is', null)
            .select('user_id'),
      'reopenScorecard',
    );
  } catch (err) {
    // NoRowsAffectedError → nothing to reopen (idempotent). Plain Error → DB failure.
    // instanceof (not constructor.name) survives prod server minification — the
    // helper restores the prototype chain for exactly this check.
    if (!(err instanceof NoRowsAffectedError)) {
      console.error('[reopenScorecard] reopen update failed', err);
      return { ok: false, reason: 'db' };
    }
    expireGameCache(gameId);
    return { ok: true, alreadyDone: true, reopenedUserIds: [] };
  }

  // #1363: best-effort varsel til spilleren som eier kortet. Uten det tror hen
  // fortsatt at kortet er levert og godkjent, mens avslutningen blokkerer på
  // not_all_submitted. Feil her endrer ikke utfallet av gjenåpningen.
  // #1598: payloaden bærer det RÅ navnet (`actorName`), ikke audit-strengen
  // med hardkodet 'Admin'-fallback. Mangler navnet, fyller kortet
  // `organizerFallback` i MOTTAKERENS locale — samme regel som #1364 satte for
  // de andre varsel-payloadene.
  // #2213: on a shared team card every reopened row is told, so nobody sees
  // their card drop back to «not submitted» without a reason.
  const recipients = sharedCard
    ? reopened.map((r) => r.user_id)
    : [playerUserId];
  try {
    await Promise.all(
      recipients.map((userId) =>
        notify({
          userId,
          kind: 'scorecard_reopened',
          payload: {
            game_id: gameId,
            game_name: gameName,
            actor_name: actorName,
          },
        }),
      ),
    );
  } catch (err) {
    console.error('[reopenScorecard] scorecard_reopened notify failed', err);
  }

  expireGameCache(gameId);
  revalidatePath(`/games/${gameId}`);
  return {
    ok: true,
    alreadyDone: false,
    reopenedUserIds: reopened.map((r) => r.user_id),
  };
}

/**
 * #2213: reopening a shared team card. In the one-ball formats
 * (`modeCollapsesToTeamCard`) every card on the team reads the captain's rows,
 * and the organizer cannot see who the captain is. Reopening only the tapped
 * card left the captain's row submitted, so the hole page kept the team card
 * locked (`anyTeamMemberSubmitted`) and RLS refused the correction. The whole
 * active team (`sharedCardUserIds`) reopens instead, in ONE UPDATE (trap 5).
 *
 * Same client as the one-row path, no service role of its own: on the web the
 * action is gated to admin or creator, and the base allows the write —
 * «game_players creator update» (0071), «game_players creator select» (0160),
 * and the 0168 guard lets the creator clear their own approval. Admin passes on
 * is_admin(). The app route passes the admin client behind its own gate.
 */
async function reopenSharedCard(
  client: CoreClient,
  gameId: string,
  mode: GameMode,
  playerUserId: string,
  patch: {
    submitted_at: null;
    approved_at: null;
    approved_by_user_id: null;
    rejection_reason: null;
  },
) {
  const { data: roster, error: rosterError } = await client
    .from('game_players')
    .select('user_id, team_number, withdrawn_at')
    .eq('game_id', gameId)
    .returns<SharedCardRosterRow[]>();
  // A failed roster read is an error (`db`), not a cue to reopen just one
  // card — that would silently shrink the cascade back into the bug.
  if (rosterError) return { data: null, error: rosterError };
  return client
    .from('game_players')
    .update(patch)
    .eq('game_id', gameId)
    .in('user_id', sharedCardUserIds(mode, roster ?? [], playerUserId))
    .not('submitted_at', 'is', null)
    .select('user_id');
}
