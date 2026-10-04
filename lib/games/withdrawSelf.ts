import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';
import { displayNameForOthers } from '@/lib/users/displayName';
import { supportsWithdrawal } from '@/lib/scoring';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { readCaptainTeam, type TeamChild } from '@/lib/games/teamCaptaincy';
import type { GameMode } from '@/lib/scoring/modes/types';

// Selv-frafalls-kjernen (#199 chunk 11, #386 chunk 3 → #1917): ett hjem for
// «spilleren trekker seg selv fra en runde, og angrer det igjen».
//
// Regelen bodde inni server-action-en `withdrawFromGame`
// (`app/[locale]/games/[id]/withdrawActions.ts`). Da appen skulle få samme
// handling via `app/api/games/[id]/withdraw-self`, ville en kopi gitt regelen to
// hjem (AGENTS trap 4) — så den flyttet hit, og action-en ble en tynn wrapper.
// Presedensen er `lib/games/remindUnsubmitted.ts`, som gjorde reisen for
// purringen i #1891.
//
// **Authz ligger hos kalleren.** Modulen leser og skriver med service-role-
// klienten og spør ALDRI hvem som ringer: den har ingen sesjon å spørre om.
// Hver kaller må ha gatet FØR den kaller hit —
//   - server-action: `auth.getUser()` + redirect til /login uten sesjon
//   - HTTP-rute: `authenticatedUserId` (lib/api/appAuth)
// Ny kaller uten en slik port = et endepunkt der hvem som helst kan trekke en
// annen fra en runde. Det er den ene feilen denne fila kan gjøre mulig.
//
// **Hvorfor service-role i det hele tatt.** `guard_game_players_self_update`
// vakt (c) (`supabase/migrations/0147_restore_self_update_guards.sql:65-73`,
// uendret i `0168:105-113`) kaster 42501 når en ikke-admin rører `withdrawn_at`
// på sin EGEN rad. Det er med vilje: den vakta er grunnen til at appen ikke får
// skrive frafallet selv, og til at denne ruta finnes. Vakta skal stå.
//
// **Service-role betyr at databasens egne regler ikke slår inn** (#2358). Denne
// fila speiler dem derfor for de samme radene, og hver skriving filtrerer på
// regelen i tillegg, så et kappløp mellom lesing og skriving ikke slipper forbi:
//   - vakt (c) stopper en spiller fra å angre et trekk arrangøren satte, og fra
//     å skrive over hvem som trakk dem. Her: bare eget trekk angres, og et
//     trekk som finnes, skrives ikke over.
//   - `game_registration_requests` har ingen DELETE-policy (0042/0092). En
//     kapteinsrad slettes aldri herfra: `team_request_id … on delete cascade`
//     ville tatt hele laget med seg.
//
// **Cup-kamper før start avvises** (#1814/#1937). Gaten står HER og ikke i
// wrapperen: sto den der, ville ruta gått utenom den, og appen kunne slettet en
// cup-rad før start.
//
// **`revalidateTag` hører til her** (via `expireGameCache`), ikke hos kallerne:
// en revalidering ÉN av to kallere glemmer er en stille feil. Samme presedens
// som `lib/games/endGameCore.ts`. Begge kallstedene kjører i Next-runtime; en
// test som kaller hit må `vi.mock('next/cache')`.

/**
 * Hvorfor frafallet ikke gikk gjennom.
 *
 * `not_authed` finnes IKKE her: kjernen har ingen sesjon å mangle. Den koden
 * bor hos wrapperen, som er den som kan mangle en.
 */
export type SelfWithdrawError =
  | 'not_registered'
  | 'game_not_found'
  | 'game_locked'
  /** #2358: angre et trekk arrangøren eller en admin satte. Vakt (c) i 0108. */
  | 'withdrawn_by_other'
  /**
   * #2358: kapteinen har lagkamerater som har takket ja. Kapteinsbindet må
   * gis videre før kapteinen kan trekke seg (eierens valg).
   */
  | 'captain_has_team'
  | 'db_error';

/**
 * `kept` = `game_players`-raden finnes fortsatt etter kallet (mykt frafall i en
 * aktiv runde). `false` = raden ble slettet (frafall før start).
 *
 * Påkrevd, ikke valgfritt: webbens form-wrapper bruker den til å avgjøre hvor
 * brukeren lander (spill-hjem vs. app-hjem), og et valgfritt felt som styrer
 * navigasjon er en felle — `undefined` ville lest som «raden er borte».
 */
export type SelfWithdrawResult =
  | { ok: true; kept: boolean }
  | { ok: false; error: SelfWithdrawError };

type GameSnapshot = {
  id: string;
  name: string;
  short_id: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  game_mode: GameMode;
  /**
   * #1814: en cup-kamp har en helt annen trekk-semantikk (Ryder Cup-modellen —
   * kampen halveres eller går som walkover). Sletting av raden her ville knekt
   * kampen stille: siden blir ufullstendig og auto-start blokkerer for alltid.
   */
  tournament_id: string | null;
  /** #2445: a draft is the organiser's; nobody else can withdraw from it. */
  created_by: string | null;
};

type PlayerSnapshot = {
  user_id: string;
  team_number: number | null;
  withdrawn_at: string | null;
};

type OwnRequest = {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  team_name: string | null;
  team_request_id: string | null;
  is_team_captain: boolean;
};

/**
 * Trekk spilleren selv fra runden.
 *
 * Aktiv runde i et format som kjenner frafall → mykt trekk (`withdrawn_at`
 * settes, raden blir stående, slagene blir liggende). Er spilleren alt trukket
 * (av seg selv eller arrangøren), skrives ingenting (#2358). Før start → raden
 * SLETTES, med kapteinen som unntak (under). Alt annet (ferdig runde, aktiv
 * runde i et format uten frafall, cup-kamp før start) → `game_locked`.
 *
 * Kaptein før start (#2358, eierens valg): har noen på laget takket ja, nekter
 * kjernen med `captain_has_team`. Ellers merkes kapteinens påmelding som
 * trukket (ikke slettet), ubesvarte laginvitasjoner trekkes med, og plassene
 * lagkameratene ikke har bekreftet fjernes — de får beskjed.
 *
 * Team-deteksjon: var spilleren lagmedlem (har `team_number` OG det finnes
 * andre på samme `team_number` i samme spill), finner vi kapteinen via
 * `game_registration_requests` og varsler hen med `team_member_withdrew`.
 * Best-effort — en feilet varsling ruller ikke tilbake selve frafallet.
 *
 * For solo-spillere (`team_number` null) hoppes kaptein-varselet. Vi vurderte å
 * varsle arrangøren (`games.created_by`) ved solo-frafall, men det blir for
 * støyete på klubb-skala — arrangøren ser påmeldings-listen i Sekretariatet.
 */
export async function withdrawSelf(
  gameId: string,
  userId: string,
): Promise<SelfWithdrawResult> {
  // UUID-sanity før DB-call. Trenger ikke å være strikt — Postgres avviser
  // ugyldig UUID — men vi gir tidlig feil for å unngå unødvendig round-trip.
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) {
    return { ok: false, error: 'game_not_found' };
  }

  const admin = getAdminClient();

  // Hent game + brukerens game_players-rad i parallell.
  const [gameRes, playerRes] = await Promise.all([
    admin
      .from('games')
      .select('id, name, short_id, status, game_mode, tournament_id, created_by')
      .eq('id', gameId)
      .maybeSingle<GameSnapshot>(),
    admin
      .from('game_players')
      .select('user_id, team_number, withdrawn_at')
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .maybeSingle<PlayerSnapshot>(),
  ]);

  if (!gameRes.data) {
    return { ok: false, error: 'game_not_found' };
  }
  const game = gameRes.data;

  // #2445: someone else's draft answers like a game that does not exist, with
  // no write and no notification (the RLS rule: a draft is its organiser's).
  // The organiser keeps the flow below on their own draft.
  if (game.status === 'draft' && game.created_by !== userId) {
    return { ok: false, error: 'game_not_found' };
  }

  // #1814: en cup-kamp som ennå ikke har startet trekker man seg fra via
  // `/cup/[id]/trekk`, aldri her. Pre-start-grenen under SLETTER
  // `game_players`-raden — på en cup-kamp etterlot det en ufullstendig side som
  // auto-start aldri kunne starte, uten at noen fikk beskjed. Venterommets
  // «Trekk deg»-lenke ruter dit; dette er vakta bak den, så raden ikke kan
  // slettes via en direkte POST heller.
  //
  // Gaten er bevisst SMAL: den beskytter DELETE-grenen, ikke det myke trekket
  // (#386) i en cup-kamp som alt er i gang. Der finnes ingen rad å slette, og
  // cup-siden har ingenting å tilby — den lister bare ikke-startede kamper.
  // Liga-runder (`tournament_id` null) er uberørt.
  const isPreStart = game.status === 'draft' || game.status === 'scheduled';
  if (game.tournament_id && isPreStart) {
    return { ok: false, error: 'game_locked' };
  }

  // Active + in-scope mode → soft WD (set withdrawn_at). Pre-start → DELETE.
  // Any other combination (finished, active+unsupported) → locked.
  if (game.status === 'active' && supportsWithdrawal(game.game_mode)) {
    if (!playerRes.data) {
      return { ok: false, error: 'not_registered' };
    }
    // #2358: alt trukket — av spilleren selv eller av arrangøren. Et nytt
    // trekk ville skrevet over hvem som trakk dem, og det er nettopp det vakt
    // (c) nekter en spiller. Intensjonen er oppfylt, så svaret er ok.
    if (playerRes.data.withdrawn_at != null) {
      return { ok: true, kept: true };
    }
    // UPDATE game_players SET withdrawn_at, withdrawn_by_user_id.
    // #712: expectAffected catches 0-row no-op (row vanished between the
    // pre-flight read above and this write — e.g. concurrent admin removal).
    // #2358: `.is('withdrawn_at', null)` so an organiser's withdrawal that
    // lands between the read and this write is never overwritten.
    try {
      expectAffected(
        await admin
          .from('game_players')
          .update({
            withdrawn_at: new Date().toISOString(),
            withdrawn_by_user_id: userId,
          })
          .eq('game_id', gameId)
          .eq('user_id', userId)
          .is('withdrawn_at', null)
          .select('user_id'),
        'withdrawSelf/active',
      );
    } catch (updateErr) {
      console.error('[withdrawSelf] active update failed', updateErr);
      return { ok: false, error: 'db_error' };
    }

    expireGameCache(game.id);
    return { ok: true, kept: true };
  }

  if (game.status !== 'draft' && game.status !== 'scheduled') {
    return { ok: false, error: 'game_locked' };
  }

  if (!playerRes.data) {
    return { ok: false, error: 'not_registered' };
  }
  const me = playerRes.data;

  // Egen påmelding FØR noe skrives: den avgjør om kalleren er kaptein.
  // Error ≠ absence (#1445): en feilet lesing skal ikke leses som «ingen
  // påmelding» — da ville en kaptein falt ned i slette-grenen under.
  const { data: myReq, error: myReqError } = await admin
    .from('game_registration_requests')
    .select('id, status, team_name, team_request_id, is_team_captain')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle<OwnRequest>();
  if (myReqError) {
    console.error('[withdrawSelf] own request lookup failed', {
      gameId,
      userId,
      error: myReqError,
    });
    return { ok: false, error: 'db_error' };
  }

  if (myReq?.is_team_captain) {
    return withdrawCaptainPreStart(admin, game, userId, myReq);
  }

  // Sjekk om brukeren var en team-medlem (ikke kaptein selv) — vi vil ha
  // team-info FØR DELETE slik at vi kan varsle kapteinen etter sletting.
  const teamNumber = me.team_number;
  let teamMatesUserId: string | null = null;
  let teamName: string | null = null;
  let captainUserId: string | null = null;
  if (teamNumber !== null) {
    // Hent andre spillere på samme team — bekrefter at det er et faktisk lag
    // (ikke bare en team_number-tildeling for en solo-spiller).
    const { data: mates } = await admin
      .from('game_players')
      .select('user_id')
      .eq('game_id', gameId)
      .eq('team_number', teamNumber)
      .neq('user_id', userId)
      .returns<{ user_id: string }[]>();
    if (mates && mates.length > 0) {
      teamMatesUserId = mates[0]!.user_id; // bare for å bekrefte at det er flere
    }

    // Kapteinen slås opp via egen påmeldings `team_request_id`. Etter en
    // overføring av kapteinsbindet peker den på den nye kapteinen.
    if (myReq && myReq.team_request_id) {
      teamName = myReq.team_name;
      const { data: captainReq } = await admin
        .from('game_registration_requests')
        .select('user_id')
        .eq('id', myReq.team_request_id)
        .maybeSingle<{ user_id: string }>();
      captainUserId = captainReq?.user_id ?? null;
    }
  }

  // DELETE game_players-rad. Setter user_id-filter for defense-in-depth.
  const { error: deleteError } = await admin
    .from('game_players')
    .delete()
    .eq('game_id', gameId)
    .eq('user_id', userId);

  if (deleteError) {
    console.error('[withdrawSelf] delete failed', deleteError);
    return { ok: false, error: 'db_error' };
  }

  // Slett også egen påmelding (cleanup), så gjenpåmelding er åpen. Best-effort:
  // 0 rows is normal, an error is logged. #2358: `is_team_captain = false` i
  // filteret — en kapteinsrad slettes aldri her. Den har barn, og kaskaden i
  // 0042 ville tatt lagkameratenes påmeldinger med seg.
  const { error: requestDeleteError } = await admin
    .from('game_registration_requests')
    .delete()
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .eq('is_team_captain', false);
  if (requestDeleteError) {
    console.error('[withdrawSelf] request cleanup failed', {
      gameId,
      userId,
      error: requestDeleteError,
    });
  }

  expireGameCache(game.id);

  // Varsle kapteinen hvis bruker var team-medlem.
  if (captainUserId && teamMatesUserId && teamName) {
    // Hent bruker-navnet for payload.
    const { data: userRow } = await admin
      .from('users')
      .select('name, nickname, email')
      .eq('id', userId)
      .maybeSingle<{
        name: string | null;
        nickname: string | null;
        email: string;
      }>();
    // null when the user row is missing — buildNotificationText fills the locale
    // fallback at render time so the payload stays locale-agnostic (#583).
    const withdrawnName = userRow ? displayNameForOthers(userRow) : null;

    await notify({
      userId: captainUserId,
      kind: 'team_member_withdrew',
      payload: {
        game_id: game.id,
        game_short_id: game.short_id,
        game_name: game.name,
        withdrawn_player_name: withdrawnName,
        team_name: teamName,
      },
    }).catch((err) => console.error('[withdrawSelf] notify failed', err));
  }

  // Pre-start path deleted the row.
  return { ok: true, kept: false };
}

/**
 * Kapteinen trekker seg før start (#2358, eierens valg).
 *
 *   - Noen på laget har takket ja → `captain_has_team`, ingenting skrives.
 *     Kapteinsbindet gis videre på lagsida først (`transfer_team_captaincy`).
 *   - Ellers, i denne rekkefølgen:
 *       1. kapteinens påmelding merkes `withdrawn` (ikke slettet);
 *       2. ubesvarte laginvitasjoner merkes `withdrawn`, og plassene
 *          lagkameratene ikke har bekreftet fjernes fra spillerlista, så ingen
 *          blir stående på et lag uten kaptein;
 *       3. kapteinens egen plass slettes.
 *     Feiler steg 1, er ingenting skrevet. Et nytt forsøk etter en feil i steg
 *     2 eller 3 hopper over steg 1 (raden er alt trukket) og fullfører resten,
 *     og cachen tømmes ved feilen, så spillerlista ikke viser en gammel tilstand.
 *   - De som mistet invitasjonen får det eksisterende `team_removed`-varselet.
 *
 * Kappløpet der en lagkamerat takker ja i samme øyeblikk er kjent og sjeldent:
 * plass-slettingen filtrerer på `accepted_at is null`, så en bekreftet plass
 * står uansett.
 */
async function withdrawCaptainPreStart(
  admin: ReturnType<typeof getAdminClient>,
  game: GameSnapshot,
  userId: string,
  myReq: OwnRequest,
): Promise<SelfWithdrawResult> {
  const team = await readCaptainTeam(admin, game.id, myReq.id);
  if (!team.ok) return { ok: false, error: 'db_error' };
  if (team.accepted.length > 0) {
    return { ok: false, error: 'captain_has_team' };
  }

  const decidedAt = new Date().toISOString();

  // Etter første skriving tømmes cachen også når et senere steg feiler: en
  // halvveis utført trekking skal ikke stå skjult bak en gammel spillerliste.
  const failAfterWrites = (): SelfWithdrawResult => {
    expireGameCache(game.id);
    return { ok: false, error: 'db_error' };
  };

  // 1. Kapteinens påmelding, når den er ventende eller godkjent. En avvist
  // eller alt trukket påmelding står som den er: arrangøren kan ha avvist
  // laget og lagt kapteinen til for hånd, og da er det bare plassen som skal
  // bort. 0 rader = noe endret raden mellom lesing og skriving (felle 2): svar
  // db_error før noe annet er rørt.
  if (myReq.status === 'pending' || myReq.status === 'approved') {
    try {
      expectAffected(
        await admin
          .from('game_registration_requests')
          .update({
            status: 'withdrawn',
            decided_at: decidedAt,
            decided_by_user_id: userId,
          })
          .eq('id', myReq.id)
          .in('status', ['pending', 'approved'])
          .select('id'),
        'withdrawSelf/captain',
      );
    } catch (markErr) {
      console.error('[withdrawSelf] captain request mark failed', markErr);
      return { ok: false, error: 'db_error' };
    }
  }

  // 2. Ubesvarte invitasjoner går med kapteinen.
  const unanswered: TeamChild[] = team.unanswered;
  if (unanswered.length > 0) {
    const { error: rosterError } = await admin
      .from('game_players')
      .delete()
      .eq('game_id', game.id)
      .in(
        'user_id',
        unanswered.map((c) => c.user_id),
      )
      .is('accepted_at', null);
    if (rosterError) {
      console.error('[withdrawSelf] unconfirmed teammates delete failed', {
        gameId: game.id,
        error: rosterError,
      });
      return failAfterWrites();
    }
    const { error: invitesError } = await admin
      .from('game_registration_requests')
      .update({
        status: 'withdrawn',
        decided_at: decidedAt,
        decided_by_user_id: userId,
      })
      .in(
        'id',
        unanswered.map((c) => c.id),
      )
      .in('status', ['pending', 'approved'])
      .select('id');
    if (invitesError) {
      console.error('[withdrawSelf] team invitations mark failed', {
        gameId: game.id,
        error: invitesError,
      });
      return failAfterWrites();
    }
  }

  // 3. Kapteinens egen plass.
  const { error: deleteError } = await admin
    .from('game_players')
    .delete()
    .eq('game_id', game.id)
    .eq('user_id', userId);
  if (deleteError) {
    console.error('[withdrawSelf] captain delete failed', deleteError);
    return failAfterWrites();
  }

  expireGameCache(game.id);

  // Best-effort: de som mistet invitasjonen får vite det. Samme varsel som når
  // kapteinen fjerner noen fra laget; ingen ny varseltype (eierens valg A).
  const notified = await Promise.allSettled(
    unanswered.map((c) =>
      notify({
        userId: c.user_id,
        kind: 'registration_rejected',
        payload: {
          game_id: game.id,
          game_name: game.name,
          reason_code: 'team_removed',
        },
      }),
    ),
  );
  for (const r of notified) {
    if (r.status === 'rejected') {
      console.error('[withdrawSelf] team_removed notify failed', r.reason);
    }
  }

  return { ok: true, kept: false };
}

/**
 * Angre eget frafall i en aktiv runde (#386 chunk 3).
 *
 * Nullstiller `withdrawn_at` + `withdrawn_by_user_id` hvis runden er `active`
 * og spilleren trakk seg selv. Samme gate som {@link withdrawSelf} sin
 * aktiv-gren. Arrangørens angre-på-andres bor i admin-server-action-en; et
 * trekk arrangøren satte gir `withdrawn_by_other` her (#2358).
 *
 * `kept: true` alltid ved suksess: det finnes ingen gren her som sletter en rad.
 */
export async function undoSelfWithdraw(
  gameId: string,
  userId: string,
): Promise<SelfWithdrawResult> {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) {
    return { ok: false, error: 'game_not_found' };
  }

  const admin = getAdminClient();

  const [gameRes, playerRes] = await Promise.all([
    admin
      .from('games')
      .select('id, status, game_mode')
      .eq('id', gameId)
      .maybeSingle<Pick<GameSnapshot, 'id' | 'status' | 'game_mode'>>(),
    admin
      .from('game_players')
      .select('user_id, withdrawn_at, withdrawn_by_user_id')
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .maybeSingle<{
        user_id: string;
        withdrawn_at: string | null;
        withdrawn_by_user_id: string | null;
      }>(),
  ]);

  if (!gameRes.data) {
    return { ok: false, error: 'game_not_found' };
  }
  const game = gameRes.data;

  if (game.status !== 'active' || !supportsWithdrawal(game.game_mode)) {
    return { ok: false, error: 'game_locked' };
  }

  if (!playerRes.data || playerRes.data.withdrawn_at == null) {
    return { ok: false, error: 'not_registered' };
  }

  // #2358: bare den som trakk seg selv kan angre. Satte arrangøren eller en
  // admin trekket (eller er det ukjent hvem), er det deres å angre — vakt (c)
  // i `guard_game_players_self_update` (0108 → 0191) nekter spilleren det
  // samme ved en direkte skriving.
  if (playerRes.data.withdrawn_by_user_id !== userId) {
    return { ok: false, error: 'withdrawn_by_other' };
  }

  // #712: expectAffected catches 0-row no-op (row vanished or withdrawn_at
  // already null — e.g. concurrent undo by admin). #2358: the write is also
  // filtered on the caller as the one who withdrew, so an organiser's
  // withdrawal landing between the read and this write is never cleared.
  try {
    expectAffected(
      await admin
        .from('game_players')
        .update({ withdrawn_at: null, withdrawn_by_user_id: null })
        .eq('game_id', gameId)
        .eq('user_id', userId)
        .eq('withdrawn_by_user_id', userId)
        .select('user_id'),
      'undoSelfWithdraw',
    );
  } catch (updateErr) {
    console.error('[undoSelfWithdraw] update failed', updateErr);
    return { ok: false, error: 'db_error' };
  }

  expireGameCache(game.id);
  return { ok: true, kept: true };
}
