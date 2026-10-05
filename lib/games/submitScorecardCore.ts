import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { expireGameCache } from './expireGameCache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';
import { notifyOrganizerIfAllDelivered } from '@/lib/notifications/organizerNotices';
import { deliveryNoticeRecipient } from '@/lib/games/organizerNoticeRules';
import { peersForApproval } from '@/lib/games/flightScope';
import { findSegmentSibling } from '@/lib/games/segmentSibling';
import { loadFlightDeliveryCards } from '@/lib/games/loadFlightDelivery';
import type { DeliveryGame } from '@/lib/games/flightDelivery';
import { deliveryCoversWholeTeam } from '@/lib/games/teamDelivery';
import type { GameMode } from '@/lib/scoring/modes/types';

// Leverings-kjernen (#1453/#1466 → #1918): ett hjem for «marker kortet som
// levert». Regelen bodde inni server-action-en `submitScorecard` på webbens
// lever-side. Da native-appen skulle få den samme knappen for lagkort via
// `app/api/games/[id]/submit-team`, ville en kopi gitt regelen to hjem (AGENTS
// trap 4) — så den flyttet hit, og action-en ble en tynn wrapper.
//
// **Authz ligger hos KALLEREN.** Modulen spør aldri hvem som ringer; den får en
// bruker-id og stoler på at den er verifisert. Hver kaller må ha gatet FØR den
// kaller hit —
//   - server-action: `auth.getUser()` på cookie-sesjonen
//   - HTTP-rute: `authenticatedUserId` (lib/api/appAuth) på Bearer-tokenet
// Selve skrivingen er likevel selv-avgrenset: kjernen rører kun raden der
// `user_id` = innsenderen, eller radene med samme `team_number` som
// innsenderens EGEN rad. Det er derfor ruta klarer seg uten arrangør-sjekk.
//
// **Klienten er et argument** (samme mønster som `endGameCore`): webben sender
// sin cookie-bundne RLS-klient, så solo-leveringen er byte-identisk med før;
// ruta sender `getAdminClient()`, siden ruter under `api/` ligger utenfor
// proxy-matcheren og hverken har cookie-sesjon eller RLS-klient. Lag-bredden og
// søsken-kaskaden går uansett via admin-klienten — RLS-flightmate-policyen
// (`can_score_for`) dekker ikke alle flight-konfigurasjoner.
//
// Revalideringen bor HER, ikke hos kalleren: en glemt tag-bust i ruta hadde
// gitt et stille stale kort på nettsiden.
//
// **Levering for flighten (#2200).** Den som fører, kan levere makkernes kort
// sammen med sitt eget (`opts.alsoFor`). Klienten kan bare snevre inn: kjernen
// spør selv `flightDeliveryCandidates` (via `loadFlightDeliveryCards`) og
// leverer snittet. En id utenfor snittet ignoreres, uten feil. Eget kort og
// makkerkortene skrives i ÉN UPDATE gjennom kallerens klient, så på webben er
// det `can_score_for`-policyen som håndhever regelen i basen.

// Logg-prefikset følger med fra server-action-en med vilje: det er
// søkestrengen for leverings-feil i Vercel-loggen (CLAUDE.md «Mail-debug»), og
// et navnebytte hadde gjort eksisterende feilsøkings-oppskrifter ugyldige.
const LOG_PREFIX = 'submitScorecard';

/**
 * What a revert writes. #2200: the approval goes with the delivery — the
 * service role skips the guard, and an approval left on an undelivered card
 * could later be completed by a delivery with the deliverer as approver
 * (0191, clause (f) is the same rule for signed-in callers). The trigger in
 * 0191 clears `submitted_by_user_id` when `submitted_at` goes to null.
 */
const UNDELIVER_PATCH = {
  submitted_at: null,
  approved_at: null,
  approved_by_user_id: null,
} as const;

/**
 * Utfallet av en levering.
 *
 * `submitted` = antall rader UPDATE-en traff (1 solo, N for laget).
 * `alreadySubmitted` dekker begge idempotens-greinene: innsenderen sto alt som
 * levert, eller UPDATE-en traff 0 rader (dobbelttrykk / to telefoner på laget).
 * Begge er suksess — 0 rader er lovlig her, så ingen `expectAffected`.
 */
export type SubmitScorecardResult =
  | {
      ok: true;
      alreadySubmitted: boolean;
      submitted: number;
      /** #2200: how many of `submitted` were flightmates' cards, not the caller's. */
      alsoDelivered: number;
    }
  | {
      ok: false;
      reason: 'not_found' | 'not_active' | 'not_player' | 'withdrawn' | 'db';
    };

/**
 * Marker innsenderens scorekort som levert — og hele lagets kort i formatene
 * som fører én ball.
 *
 * Idempotent: `.is('submitted_at', null)` gjør at et andre kall etter et
 * vellykket første treffer null rader. Vi leser rad-antallet via `.select()` og
 * hopper over varslene når det er 0 — Supabase returnerer `error == null`
 * også for 0 oppdaterte rader (AGENTS trap 2), så uten tellingen ville et
 * dobbelttrykk fyrt peer- og arrangør-varsler på nytt hver gang.
 *
 * Side-effekter, best-effort (#2203): arrangøren (`games.created_by`) får
 * `scorecard_submitted` per levert kort, i innboksen og som push, aldri på
 * e-post. Admin-ene får ingenting. Gjør leveringen spillet klart til å
 * avsluttes, får arrangøren én «Alle har levert» (`notifyOrganizerIfAllDelivered`,
 * som kan sende én e-post når hen er utenfor appen).
 */
export async function submitScorecardCore(
  supabase: SupabaseClient<Database>,
  gameId: string,
  userId: string,
  opts: {
    /**
     * #2200: flightmates whose cards the caller also delivers. Only the ids
     * `flightDeliveryCandidates` allows are delivered; the rest are ignored.
     */
    alsoFor?: readonly string[];
  } = {},
): Promise<SubmitScorecardResult> {
  // Refuse to submit if the game isn't active. Draft games shouldn't have
  // scores yet and finished games are read-only. `name` is fetched here so
  // we can use it as the mail subject + body without a re-fetch.
  // `require_peer_approval` brukes nedenfor til å gate peer-varsel-loopen.
  // `game_mode` trengs for peersForApproval (#543). `created_by` er arrangøren,
  // som får leveringsvarselet (#2203).
  // #1466: `hole_segment` + `tournament_id` + `source_game_id` drive the
  // one-delivery cascade below — a back9 split-cup host delivers its front9
  // sibling in the same call.
  const { data: game } = await supabase
    .from('games')
    .select(
      'name, status, require_peer_approval, game_mode, hole_segment, tournament_id, source_game_id, created_by',
    )
    .eq('id', gameId)
    .single<{
      name: string;
      status: 'draft' | 'scheduled' | 'active' | 'finished';
      require_peer_approval: boolean;
      game_mode: string;
      hole_segment: 'full' | 'front9' | 'back9';
      tournament_id: string | null;
      source_game_id: string | null;
      created_by: string | null;
    }>();

  if (!game) return { ok: false, reason: 'not_found' };
  if (game.status !== 'active') return { ok: false, reason: 'not_active' };

  // Withdrawn (#387): a trukket spiller can't submit. The submit page redirects
  // them away, but a direct POST to this action must also be refused — defense-
  // in-depth. Webben sender dem til game-home, som viser «Du har trukket
  // deg»-banneret.
  const { data: meRow } = await supabase
    .from('game_players')
    .select('withdrawn_at, submitted_at, team_number')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle<{
      withdrawn_at: string | null;
      submitted_at: string | null;
      team_number: number | null;
    }>();

  // #1918: ingen `game_players`-rad = ingen levering. Før uttrekket falt dette
  // gjennom til en UPDATE som traff 0 rader og svarte som suksess — greit nok
  // på webben (siden bak `notFound()`-er en ikke-deltaker), men på en offentlig
  // rute ville en fremmed fått 200 «alt levert».
  if (!meRow) return { ok: false, reason: 'not_player' };

  if (meRow.withdrawn_at) return { ok: false, reason: 'withdrawn' };

  const mode = game.game_mode as GameMode;

  // #2200: the flightmates' cards to deliver too — `alsoFor ∩ candidates`.
  const mates = await flightMatesToDeliver(gameId, userId, opts.alsoFor, {
    game_mode: mode,
    hole_segment: game.hole_segment,
    source_game_id: game.source_game_id,
  });
  if (mates === null) return { ok: false, reason: 'db' };

  // #1453: har innsenderen alt levert er hele kallet idempotent — hopp over
  // oppdatering og side-effekter (samme UX som 0-rads-grenen under). Uten
  // denne kunne et re-klikk i lag-modusene re-fyre varsler for en lagkamerat
  // som ennå ikke sto som levert. #2200: med makkerkort igjen leveres bare de.
  if (meRow.submitted_at && mates.length === 0) {
    expireGameCache(gameId);
    revalidatePath(`/games/${gameId}`);
    return { ok: true, alreadySubmitted: true, submitted: 0, alsoDelivered: 0 };
  }

  // #1453: én-ball-lagformat (scramble-familien + alternate-shot-matchplay) —
  // laget fører én felles ball, så én levering markerer HELE lagets aktive,
  // uleverte rader. Cascaden går via admin-client: RLS-flightmate-policyen
  // (can_score_for) dekker ikke alle flight-konfigurasjoner, og authz er alt
  // verifisert hos kalleren (innsenderen er aktiv spiller i spillet). Patsome er
  // bevisst utenfor — bytter mellom individuell og lag-føring midtveis.
  const teamSubmit =
    deliveryCoversWholeTeam(mode) &&
    meRow.team_number != null;
  const submitPatch = {
    submitted_at: new Date().toISOString(),
    // A previous rejection clears once the player re-submits.
    rejection_reason: null,
    // #2200: who delivered. The trigger in 0191 sets the same value for a
    // signed-in client; the service role (the app route, the team and sibling
    // cascades) keeps this one.
    submitted_by_user_id: userId,
    // #2200: a delivery never carries an approval forward. Every row this
    // writes is undelivered, and an undelivered card holds no approval (0191,
    // and every un-deliver here clears it with UNDELIVER_PATCH), so for a valid
    // row this changes nothing. It keeps a stale approval from surviving into
    // a delivered card on the service-role paths, which skip the guard.
    approved_at: null,
    approved_by_user_id: null,
  };
  // #2200: own card (unless already delivered) plus the flightmates', in ONE
  // update, so a card is never left half-delivered (trap 5).
  const flightIds = [
    ...(meRow.submitted_at ? [] : [userId]),
    ...mates.map((m) => m.userId),
  ];
  const { data: updated, error } = teamSubmit
    ? await getAdminClient()
        .from('game_players')
        .update(submitPatch)
        .eq('game_id', gameId)
        .eq('team_number', meRow.team_number!)
        .is('withdrawn_at', null)
        .is('submitted_at', null)
        .select('user_id')
    : mates.length > 0
      ? await supabase
          .from('game_players')
          .update(submitPatch)
          .eq('game_id', gameId)
          .in('user_id', flightIds)
          .is('submitted_at', null)
          .is('withdrawn_at', null)
          .select('user_id')
      : await supabase
          .from('game_players')
          .update(submitPatch)
          .eq('game_id', gameId)
          .eq('user_id', userId)
          .is('submitted_at', null)
          .select('user_id');

  if (error) return { ok: false, reason: 'db' };

  const writtenIds = (updated ?? []).map((r) => r.user_id);

  // #2200: fewer rows than asked for. A row that is delivered or withdrawn by
  // now lost a race, which is fine. A row still open means RLS refused it:
  // the TS rule and `can_score_for` disagree. Undo what this call set and
  // fail, rather than leave the flight half-delivered.
  if (
    !teamSubmit &&
    mates.length > 0 &&
    (await flightWriteDrifted(gameId, userId, flightIds, writtenIds))
  ) {
    return { ok: false, reason: 'db' };
  }

  // Zero rows = already submitted (re-click or race). Skip notify + mail
  // but keep the revalidate so UX matches a fresh submit.
  const submitted = writtenIds.length;
  if (submitted === 0) {
    expireGameCache(gameId);
    revalidatePath(`/games/${gameId}`);
    return { ok: true, alreadySubmitted: true, submitted: 0, alsoDelivered: 0 };
  }

  // The cards this call delivered, each notified as if its owner delivered
  // it. The team cascade stays one card: the submitter's, as before (#1453).
  const deliveredCards = teamSubmit ? [userId] : writtenIds;
  const alsoDelivered = deliveredCards.filter((id) => id !== userId).length;

  // #1466: one delivery covers the whole split cup round. A back9 host's
  // submit ALSO marks the submitter's front9 sibling delivered, so the player
  // never delivers twice. Direction is back9→front9 only (a manual front9
  // deliver via the escape hatch never cascades). Runs AFTER the primary
  // update hit >0 rows and BEFORE the side-effects, so notifications fire once
  // for the back9 host and the front9 marking stays silent (the admin sees
  // both cards in the approve queue regardless).
  if (
    game.hole_segment === 'back9' &&
    game.tournament_id != null &&
    game.source_game_id == null
  ) {
    const updatedUserIds = writtenIds;
    try {
      const sibling = await findSegmentSibling(userId, {
        gameId,
        holeSegment: 'back9',
        sourceGameId: null,
        tournamentId: game.tournament_id,
      });
      // Only cascade to an undelivered sibling. `mySubmittedAt != null` means
      // it is already delivered (a teammate's cascade won a race, or the
      // front9 was delivered manually) → nothing to do.
      if (sibling && sibling.mySubmittedAt == null) {
        // Team-wide when the front9 sibling is a one-ball team format
        // (greensome IS — #1453); own-row otherwise. Same guarded, admin-client
        // form as the primary update above.
        const siblingTeamSubmit =
          deliveryCoversWholeTeam(sibling.gameMode) && sibling.myTeamNumber != null;
        const { error: siblingError } = siblingTeamSubmit
          ? await getAdminClient()
              .from('game_players')
              .update(submitPatch)
              .eq('game_id', sibling.gameId)
              .eq('team_number', sibling.myTeamNumber!)
              .is('withdrawn_at', null)
              .is('submitted_at', null)
              .select('user_id')
          : await getAdminClient()
              .from('game_players')
              .update(submitPatch)
              .eq('game_id', sibling.gameId)
              .eq('user_id', userId)
              .is('submitted_at', null)
              .select('user_id');
        // 0 rows = the sibling was already delivered between the lookup and the
        // update (race) → tolerated no-op, continue. Any DB error is handled in
        // the catch below (compensated).
        if (siblingError) throw siblingError;

        // Both games are now delivered — revalidate the front9 host too.
        expireGameCache(sibling.gameId);
        revalidatePath(`/games/${sibling.gameId}`);
      }
    } catch (err) {
      // #1466 trap #5: a half-delivered pair (back9 marked, front9 not) hides
      // the front9 deliver-CTA in broModus — a blind gate. Revert the back9
      // rows just set and fail loudly rather than leave the pair half-done.
      // (A previously-cleared rejection_reason on the reverted rows is an
      // accepted cosmetic loss.)
      console.error(
        `[${LOG_PREFIX}] front9 sibling cascade failed — reverting back9`,
        err,
      );
      if (updatedUserIds.length > 0) {
        // #2223: the revert is the compensation, so check it. An error or 0
        // rows leaves the half-delivered pair in place; log it with the rows
        // so it can be put right by hand. The answer stays 'db'.
        const { data: reverted, error: revertError } = await getAdminClient()
          .from('game_players')
          .update(UNDELIVER_PATCH)
          .eq('game_id', gameId)
          .in('user_id', updatedUserIds)
          .select('user_id');
        if (revertError || (reverted ?? []).length === 0) {
          console.error(`[${LOG_PREFIX}] back9 revert failed`, {
            gameId,
            updatedUserIds,
            error: revertError,
          });
        }
      }
      return { ok: false, reason: 'db' };
    }
  }

  // Best-effort varsler: peer-attestantene og arrangøren. To lesinger i
  // parallell:
  //   1) innsenderens eget navn (til payloadene)
  //   2) alle aktive spillere i spillet (for peersForApproval — #543).
  // Peers-query gates på require_peer_approval — for spill uten
  // peer-godkjenning sparer vi en DB-runde per submit (klubb-skala-perf).
  // #2203: ingen lesing av arrangørens users-rad. Den trengs ikke (ingen e-post
  // per levering, og notify leser mottakerens locale selv), og på webben er
  // `supabase` spillerens RLS-klient, der en arrangør som ikke spiller og aldri
  // har delt spill med spilleren, er usynlig.
  const peersQuery = game.require_peer_approval
    ? supabase
        .from('game_players')
        .select('user_id, flight_number, withdrawn_at')
        .eq('game_id', gameId)
        .returns<
          { user_id: string; flight_number: number | null; withdrawn_at: string | null }[]
        >()
    : Promise.resolve({ data: null });

  const [playerRes, peersRes] = await Promise.all([
    supabase.from('users').select('name').eq('id', userId).maybeSingle<{
      name: string | null;
    }>(),
    peersQuery,
  ]);

  // #1364: null i stedet for norsk plassholder. Navnet går til to payloads,
  // og kortet oversetter fallbacken hos mottakeren (buildNotificationText).
  const playerName = playerRes.data?.name?.trim() || null;

  // #2200: one round of varsler per delivered card, as if its owner had
  // delivered it. The deliverer never counts as a peer on a flightmate's card
  // (owner's decision 2026-09-27: someone else approves it).
  const gameName = game.name;
  const requirePeerApproval = game.require_peer_approval;
  const notifyDeliveredCard = async (cardUserId: string, cardName: string | null) => {
    // Peer-varsler hvis peer-godkjenning er på.
    // #543: peersForApproval() håndterer én-flight-regelen: alle andre aktive
    // spillere i ≤4-spill (eller wolf) er attestanter, ellers kun samme flight.
    const peerIds = requirePeerApproval
      ? peersForApproval(peersRes.data ?? [], mode, cardUserId, userId)
      : [];
    if (peerIds.length > 0) {
      const peerResults = await Promise.allSettled(
        peerIds.map((peerId) =>
          notify({
            userId: peerId,
            kind: 'peer_approval_request',
            payload: {
              game_id: gameId,
              game_name: gameName,
              submitter_name: cardName,
              // #2263: the card owner, never the deliverer — the inbox checks
              // whether THIS card still waits for approval.
              submitter_id: cardUserId,
            },
          }),
        ),
      );
      for (const r of peerResults) {
        if (r.status === 'rejected') {
          console.error(
            `[${LOG_PREFIX}] peer_approval_request notify failed`,
            r.reason,
          );
        }
      }
    }

    // #2203: the organiser, not every admin, hears about the card — unless
    // they delivered it, are on it (a one-ball team card covers the whole
    // team), or approve it (`peer_approval_request` above already asks them).
    // In-app and push only: `shouldAlsoSendMail` is not used here, there is no
    // mail per delivery (the owner's answer 2026-10-05).
    const recipient = deliveryNoticeRecipient({
      createdBy: game.created_by,
      delivererId: userId,
      cardMemberIds: teamSubmit ? writtenIds : [cardUserId],
      peerIds,
    });
    if (recipient == null) return;
    try {
      await notify({
        userId: recipient,
        kind: 'scorecard_submitted',
        payload: {
          game_id: gameId,
          game_name: gameName,
          player_name: cardName,
          player_id: cardUserId,
        },
      });
    } catch (err) {
      console.error(`[${LOG_PREFIX}] scorecard_submitted notify failed`, err);
    }
  };

  const mateNames = new Map(mates.map((m) => [m.userId, m.name]));
  for (const cardUserId of deliveredCards) {
    await notifyDeliveredCard(
      cardUserId,
      cardUserId === userId ? playerName : (mateNames.get(cardUserId) ?? null),
    );
  }

  // #2203: did this delivery make the round ready to finish? Best-effort, never
  // throws; it claims a stamp so «Alle har levert» goes once per game.
  await notifyOrganizerIfAllDelivered(gameId, userId, LOG_PREFIX);

  expireGameCache(gameId);
  revalidatePath(`/games/${gameId}`);
  return { ok: true, alreadySubmitted: false, submitted, alsoDelivered };
}

/**
 * #2200: the flightmates whose cards this call delivers — the caller's
 * `alsoFor` narrowed to what `flightDeliveryCandidates` allows. The client can
 * only narrow the set, never widen it. Nothing is read when `alsoFor` is
 * empty, so a plain delivery costs nothing extra. `null` = the read failed.
 */
async function flightMatesToDeliver(
  gameId: string,
  userId: string,
  alsoFor: readonly string[] | undefined,
  game: DeliveryGame,
): Promise<{ userId: string; name: string | null }[] | null> {
  const asked = new Set(alsoFor ?? []);
  asked.delete(userId);
  if (asked.size === 0) return [];
  try {
    const cards = await loadFlightDeliveryCards(gameId, userId, game);
    return cards.filter((c) => asked.has(c.userId));
  } catch (err) {
    console.error(`[${LOG_PREFIX}] flight candidates read failed`, err);
    return null;
  }
}

/**
 * #2200: the one flight update wrote fewer rows than it asked for. A row that
 * is delivered or withdrawn by now lost a race, which is fine. A row still
 * open means RLS refused it — the TS rule and `can_score_for` disagree. Then
 * the rows this call set are undone, so no card is left half-delivered
 * (trap 5), and the caller answers `db`. Returns true when it reverted.
 */
async function flightWriteDrifted(
  gameId: string,
  userId: string,
  flightIds: readonly string[],
  writtenIds: readonly string[],
): Promise<boolean> {
  const missing = flightIds.filter((id) => !writtenIds.includes(id));
  if (missing.length === 0) return false;

  const { data: reread, error: rereadError } = await getAdminClient()
    .from('game_players')
    .select('user_id, submitted_at, withdrawn_at')
    .eq('game_id', gameId)
    .in('user_id', missing)
    .returns<{ user_id: string; submitted_at: string | null; withdrawn_at: string | null }[]>();
  const drifted =
    rereadError != null ||
    (reread ?? []).some((r) => r.submitted_at == null && r.withdrawn_at == null);
  if (!drifted) return false;

  console.error(`[${LOG_PREFIX}] flight rule drift — reverting`, {
    gameId,
    userId,
    missing,
    rereadError,
  });
  if (writtenIds.length > 0) {
    // A cleared rejection_reason on these rows is not restored — the same
    // accepted cosmetic loss as the back9 revert above.
    // #2223: the revert is the compensation, so check it. An error or 0 rows
    // leaves the flight half-delivered; log it with the rows so it can be put
    // right by hand, rather than let the drift line read as if it was undone.
    const { data: reverted, error: revertError } = await getAdminClient()
      .from('game_players')
      .update(UNDELIVER_PATCH)
      .eq('game_id', gameId)
      .in('user_id', [...writtenIds])
      .select('user_id');
    if (revertError || (reverted ?? []).length === 0) {
      console.error(`[${LOG_PREFIX}] flight drift revert failed`, {
        gameId,
        writtenIds: [...writtenIds],
        error: revertError,
      });
    }
  }
  return true;
}
