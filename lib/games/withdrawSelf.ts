import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';
import { supportsWithdrawal } from '@/lib/scoring';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { expireGameCache } from '@/lib/games/expireGameCache';
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
};

type PlayerSnapshot = {
  user_id: string;
  team_number: number | null;
};

/**
 * Trekk spilleren selv fra runden.
 *
 * Aktiv runde i et format som kjenner frafall → mykt trekk (`withdrawn_at`
 * settes, raden blir stående, slagene blir liggende). Før start → raden
 * SLETTES. Alt annet (ferdig runde, aktiv runde i et format uten frafall,
 * cup-kamp før start) → `game_locked`.
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
      .select('id, name, short_id, status, game_mode, tournament_id')
      .eq('id', gameId)
      .maybeSingle<GameSnapshot>(),
    admin
      .from('game_players')
      .select('user_id, team_number')
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .maybeSingle<PlayerSnapshot>(),
  ]);

  if (!gameRes.data) {
    return { ok: false, error: 'game_not_found' };
  }
  const game = gameRes.data;

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
    // UPDATE game_players SET withdrawn_at, withdrawn_by_user_id.
    // #712: expectAffected catches 0-row no-op (row vanished between the
    // pre-flight read above and this write — e.g. concurrent admin removal).
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

    // Finn brukerens egen registration-request-rad for å hente team_name.
    // Vi bruker den til å slå opp kapteinen.
    const { data: myReq } = await admin
      .from('game_registration_requests')
      .select('team_name, team_request_id, is_team_captain')
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .maybeSingle<{
        team_name: string | null;
        team_request_id: string | null;
        is_team_captain: boolean;
      }>();

    if (myReq && !myReq.is_team_captain && myReq.team_request_id) {
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

  // Slett også eventuelle registration-request-rader (cleanup). Best-effort.
  await admin
    .from('game_registration_requests')
    .delete()
    .eq('game_id', gameId)
    .eq('user_id', userId);

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
    // null when the user row is missing — NotificationCard fills the locale
    // fallback at render time so the payload stays locale-agnostic (#583).
    const base = userRow?.name?.trim() || userRow?.email || null;
    const withdrawnName =
      base && userRow?.nickname ? `${base} «${userRow.nickname}»` : base;

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
 * Angre eget frafall i en aktiv runde (#386 chunk 3).
 *
 * Nullstiller `withdrawn_at` + `withdrawn_by_user_id` hvis runden er `active`
 * og spilleren faktisk er trukket. Samme gate som {@link withdrawSelf} sin
 * aktiv-gren. Arrangørens angre-på-andres bor i admin-server-action-en.
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
      .select('user_id, withdrawn_at')
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .maybeSingle<{ user_id: string; withdrawn_at: string | null }>(),
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

  // #712: expectAffected catches 0-row no-op (row vanished or withdrawn_at
  // already null — e.g. concurrent undo by admin).
  try {
    expectAffected(
      await admin
        .from('game_players')
        .update({ withdrawn_at: null, withdrawn_by_user_id: null })
        .eq('game_id', gameId)
        .eq('user_id', userId)
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
