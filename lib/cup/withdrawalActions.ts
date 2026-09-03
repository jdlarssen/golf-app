'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';
import { cupBasePath } from './cupPaths';

/**
 * Trekk underveis i en cup (#1814) — arrangørens og spillerens vei ut.
 *
 * Ryder Cup-modellen (eierbeslutning E1): et trekk er et trekk, ikke et bytte.
 * Ingen erstatter settes inn; spillerens IKKE-STARTEDE kamper flagges med
 * `withdrawn_at`, og konvoluttregelen (`cupWithdrawalOutcome.ts`) utleder
 * poengene derfra. Startede og ferdige kamper røres aldri (E3).
 *
 * Ingen skjemaendring: `game_players.withdrawn_at`/`withdrawn_by_user_id` er
 * #386-mekanikken, og fourball-valget bor i `games.mode_config`
 * (`withdrawal_play_on`) etter samme presedens som `team_strokes_override`
 * (#1441 D10). `supportsWithdrawal` — som holder matchplay utenfor med vilje —
 * røres IKKE: cup-trekket er en egen inngang med egen semantikk.
 *
 * Alle skriv går via admin-klienten med authz på call-site (samme mønster som
 * `finishTournament`/`swapCupMatchPlayer`): en klubb-styrer er ikke
 * games-creator, og 0108-triggeren nekter dessuten en spiller å PATCHe sin egen
 * rad. Gaten her ER håndhevelsen (AGENTS.md-felle #3).
 */

export type CupWithdrawalError = { error: string };

/**
 * Feilkoder, alle oversatt under `cup.withdraw.errors.*`:
 *   wrong_status        cupen er ikke aktiv (utkast/avsluttet)
 *   not_participant     spilleren står ikke i noen av cupens kamper
 *   no_pending_matches  ingen ikke-startede kamper igjen å trekke seg fra
 *   not_withdrawn       angre-forsøk på en spiller som ikke er trukket
 *   match_not_eligible  fourball-valget peker på feil kamp
 *   withdraw_failed     lese-/skrivefeil (fail-closed, ingenting delvis)
 */

type GameRow = {
  id: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  game_mode: string;
  mode_config: unknown;
};

const PENDING_STATUSES = new Set(['draft', 'scheduled']);

/** Cupens spill + spillerens rader i dem. Delt av alle fire handlingene. */
async function readCupTarget(
  admin: SupabaseClient<Database>,
  tournamentId: string,
  userId: string,
): Promise<
  | { error: string }
  | {
      groupId: string | null;
      games: GameRow[];
      /** Spill-ID-ene spilleren står i, i kamp-rekkefølge. */
      myGameIds: string[];
      /** Spill-ID-ene der spilleren alt er trukket. */
      withdrawnGameIds: string[];
    }
> {
  const { data: tournament, error: tErr } = await admin
    .from('tournaments')
    .select('id, status, group_id')
    .eq('id', tournamentId)
    .maybeSingle();
  if (tErr) {
    console.error('[cup] withdrawal tournament read failed', { tournamentId, tErr });
    return { error: 'withdraw_failed' };
  }
  if (!tournament) return { error: 'not_found' };
  // E7/edge: cupen må være i gang. Utkast har ingen kamper å trekke seg fra,
  // og en avsluttet cup har et signert resultat som ikke skal endres.
  if (tournament.status !== 'active') return { error: 'wrong_status' };

  const { data: gameRows, error: gErr } = await admin
    .from('games')
    .select('id, status, game_mode, mode_config, created_at')
    .eq('tournament_id', tournamentId)
    .order('created_at', { ascending: true });
  if (gErr) {
    console.error('[cup] withdrawal games read failed', { tournamentId, gErr });
    return { error: 'withdraw_failed' };
  }
  const games = (gameRows ?? []) as unknown as GameRow[];
  if (games.length === 0) return { error: 'not_participant' };

  const { data: playerRows, error: pErr } = await admin
    .from('game_players')
    .select('game_id, withdrawn_at')
    .eq('user_id', userId)
    .in(
      'game_id',
      games.map((g) => g.id),
    );
  if (pErr) {
    console.error('[cup] withdrawal roster read failed', { tournamentId, pErr });
    return { error: 'withdraw_failed' };
  }
  const rows = (playerRows ?? []) as { game_id: string; withdrawn_at: string | null }[];
  if (rows.length === 0) return { error: 'not_participant' };

  const order = new Map(games.map((g, i) => [g.id, i]));
  const sorted = [...rows].sort(
    (a, b) => (order.get(a.game_id) ?? 0) - (order.get(b.game_id) ?? 0),
  );

  return {
    groupId: (tournament.group_id as string | null) ?? null,
    games,
    myGameIds: sorted.map((r) => r.game_id),
    withdrawnGameIds: sorted.filter((r) => r.withdrawn_at != null).map((r) => r.game_id),
  };
}

/** Buster hver cache-flate et trekk kan ha endret. */
function revalidateCup(tournamentId: string, groupId: string | null, gameIds: string[]) {
  revalidateTag(`tournament-${tournamentId}`, 'max');
  // Hver skrevet kamp har sin egen tag (`getGameWithPlayers`) — uten dette
  // viser venterommet og hull-siden den gamle troppen i opptil 15 minutter.
  for (const gameId of gameIds) revalidateTag(`game-${gameId}`, 'max');
  const base = cupBasePath(tournamentId, groupId);
  revalidatePath(base);
  revalidatePath(`${base}/spillere`);
  revalidatePath(`/admin/cup/${tournamentId}`);
  revalidatePath(`/cup/${tournamentId}`);
  revalidatePath(`/cup/${tournamentId}/resultater`);
}

/** Slår `withdrawal_play_on` av eller på i et spills `mode_config`. */
function withPlayOn(modeConfig: unknown, on: boolean): Json {
  const base =
    modeConfig && typeof modeConfig === 'object'
      ? { ...(modeConfig as Record<string, Json>) }
      : {};
  if (on) base.withdrawal_play_on = true;
  else delete base.withdrawal_play_on;
  return base as Json;
}

/**
 * Selve skrivingen, delt av arrangør-trekket og selv-trekket.
 *
 * Rekkefølgen er bevisst: flagg radene først, re-les statusene etterpå.
 * Cron-sveipet fyrer hvert minutt når tee-off har passert, så en kamp kan bli
 * `active` mellom lesingen og skrivingen. Den ene kampen kompenseres da (raden
 * nulles igjen) og rapporteres som hoppet over — resten står. Å rulle tilbake
 * hele trekket fordi ÉN kamp rakk å starte ville vært verre: spilleren er syk,
 * de øvrige kampene skal fortsatt flagges.
 */
async function writeWithdrawal(
  admin: SupabaseClient<Database>,
  args: {
    tournamentId: string;
    userId: string;
    byUserId: string;
    games: GameRow[];
    playOnGameIds: Set<string>;
  },
): Promise<{ error: string } | { writtenGameIds: string[]; skippedGameIds: string[] }> {
  const { tournamentId, userId, byUserId, games, playOnGameIds } = args;
  const withdrawnAt = new Date().toISOString();
  const written: string[] = [];

  try {
    for (const game of games) {
      // 0 rader er en ekte feil (felle #2): lesingen fant nettopp raden, og
      // `.is('withdrawn_at', null)` er ikke et filter som kan bomme her —
      // planfasen plukket bare ut ikke-trukne rader.
      expectAffected(
        await admin
          .from('game_players')
          .update({ withdrawn_at: withdrawnAt, withdrawn_by_user_id: byUserId })
          .eq('game_id', game.id)
          .eq('user_id', userId)
          .is('withdrawn_at', null)
          .select('user_id'),
        'withdrawCupPlayer/flagRow',
      );
      written.push(game.id);

      if (playOnGameIds.has(game.id)) {
        expectAffected(
          await admin
            .from('games')
            .update({ mode_config: withPlayOn(game.mode_config, true) })
            .eq('id', game.id)
            .select('id'),
          'withdrawCupPlayer/playOn',
        );
      }
    }
  } catch (err) {
    console.error('[cup] withdrawCupPlayer write failed', { tournamentId, userId, err });
    await undoRows(admin, userId, written);
    return { error: 'withdraw_failed' };
  }

  // TOCTOU mot cron-sveipet: en kamp som rakk å bli `active` mellom lesing og
  // skriving skal IKKE stå flagget — den spilles, og trekket gjelder bare de
  // ikke-startede (E3).
  const { data: after, error: afterError } = await admin
    .from('games')
    .select('id, status')
    .in('id', written);
  if (afterError) {
    console.error('[cup] withdrawCupPlayer recheck failed', { tournamentId, afterError });
    await undoRows(admin, userId, written);
    return { error: 'withdraw_failed' };
  }
  const started = (after ?? [])
    .filter((g) => !PENDING_STATUSES.has(g.status as string))
    .map((g) => g.id as string);
  if (started.length > 0) await undoRows(admin, userId, started);

  return {
    writtenGameIds: written.filter((id) => !started.includes(id)),
    skippedGameIds: started,
  };
}

/**
 * Nuller `withdrawn_at`/`withdrawn_by_user_id` for spilleren i de oppgitte
 * kampene. Brukes både av «angre trekk» og som kompensering. Best-effort ved
 * kompensering — kalleren får uansett en ærlig feilkode.
 */
async function undoRows(
  admin: SupabaseClient<Database>,
  userId: string,
  gameIds: string[],
): Promise<void> {
  if (gameIds.length === 0) return;
  const { error } = await admin
    .from('game_players')
    .update({ withdrawn_at: null, withdrawn_by_user_id: null })
    .in('game_id', gameIds)
    .eq('user_id', userId);
  if (error) console.error('[cup] withdrawal undo failed', { userId, gameIds, error });
}

/**
 * Arrangøren registrerer et trekk (E7). Skriver `withdrawn_at` på ALLE
 * spillerens ikke-startede kamper i cupen — host og avledede sammen (#1441 D3:
 * alt som rører spillerrader gjøres på hele bunten).
 *
 * `play_on_game_ids` er en kommaliste med de fourball-kampene arrangøren valgte
 * «makkeren spiller alene» for.
 */
export async function withdrawCupPlayer(formData: FormData): Promise<CupWithdrawalError> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const userId = String(formData.get('user_id') ?? '').trim();
  if (!tournamentId || !userId) return { error: 'not_found' };
  const playOnGameIds = new Set(
    String(formData.get('play_on_game_ids') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const supabase = await getServerClient();
  const actor = await requireAdminOrClubAdminOfCup(supabase, tournamentId);
  const admin = getAdminClient();

  const target = await readCupTarget(admin, tournamentId, userId);
  if ('error' in target) return { error: target.error };

  const pending = target.games.filter(
    (g) =>
      PENDING_STATUSES.has(g.status) &&
      target.myGameIds.includes(g.id) &&
      !target.withdrawnGameIds.includes(g.id),
  );
  if (pending.length === 0) return { error: 'no_pending_matches' };

  const result = await writeWithdrawal(admin, {
    tournamentId,
    userId,
    byUserId: actor.userId,
    games: pending,
    // Kun fourball-kamper kan bære flagget — en klient som sender andre
    // ID-er skal ikke kunne skrive `withdrawal_play_on` på en foursomes.
    playOnGameIds: new Set(
      pending
        .filter((g) => g.game_mode === 'fourball_matchplay' && playOnGameIds.has(g.id))
        .map((g) => g.id),
    ),
  });
  if ('error' in result) return { error: result.error };

  revalidateCup(tournamentId, actor.groupId, [...result.writtenGameIds, ...result.skippedGameIds]);
  const status =
    result.skippedGameIds.length > 0 ? 'player_withdrawn_partial' : 'player_withdrawn';
  redirect(`${cupBasePath(tournamentId, actor.groupId)}?status=${status}`);
  return { error: '' }; // unreachable — redirect() kaster NEXT_REDIRECT
}

/**
 * Spilleren melder seg selv ut (E7). Samme skriving, men `withdrawn_by_user_id`
 * peker på hen selv, og fourball-valget settes ikke — det er arrangørens (E4).
 * Ingen selv-angre: kun arrangøren kan angre.
 */
export async function withdrawSelfFromCup(formData: FormData): Promise<CupWithdrawalError> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  if (!tournamentId) return { error: 'not_found' };

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'not_authed' };

  const admin = getAdminClient();
  const target = await readCupTarget(admin, tournamentId, user.id);
  if ('error' in target) return { error: target.error };

  const pending = target.games.filter(
    (g) =>
      PENDING_STATUSES.has(g.status) &&
      target.myGameIds.includes(g.id) &&
      !target.withdrawnGameIds.includes(g.id),
  );
  if (pending.length === 0) return { error: 'no_pending_matches' };

  const result = await writeWithdrawal(admin, {
    tournamentId,
    userId: user.id,
    byUserId: user.id,
    games: pending,
    playOnGameIds: new Set<string>(),
  });
  if ('error' in result) return { error: result.error };

  revalidateCup(tournamentId, target.groupId, [
    ...result.writtenGameIds,
    ...result.skippedGameIds,
  ]);
  redirect(`/cup/${tournamentId}?status=withdrawn`);
  return { error: '' }; // unreachable
}

/**
 * Angrer et trekk (E7 — kun arrangøren, og kun for kamper som ennå ikke har
 * startet). Nuller radene og fjerner `withdrawal_play_on` fra de samme kampene:
 * står ingen trukket igjen, betyr flagget ingenting og skal ikke ligge og
 * skjule seg i `mode_config`.
 *
 * Har tee-off passert, starter cron-sveipet kampen neste minutt hvis siden er
 * komplett. Det er ønsket — arrangøren angret nettopp fordi folk er der.
 */
export async function undoCupWithdrawal(formData: FormData): Promise<CupWithdrawalError> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const userId = String(formData.get('user_id') ?? '').trim();
  if (!tournamentId || !userId) return { error: 'not_found' };

  const supabase = await getServerClient();
  const actor = await requireAdminOrClubAdminOfCup(supabase, tournamentId);
  const admin = getAdminClient();

  const target = await readCupTarget(admin, tournamentId, userId);
  if ('error' in target) return { error: target.error };

  const toUndo = target.games.filter(
    (g) => PENDING_STATUSES.has(g.status) && target.withdrawnGameIds.includes(g.id),
  );
  if (toUndo.length === 0) return { error: 'not_withdrawn' };

  try {
    for (const game of toUndo) {
      expectAffected(
        await admin
          .from('game_players')
          .update({ withdrawn_at: null, withdrawn_by_user_id: null })
          .eq('game_id', game.id)
          .eq('user_id', userId)
          .not('withdrawn_at', 'is', null)
          .select('user_id'),
        'undoCupWithdrawal/clearRow',
      );
      if (readPlayOn(game.mode_config)) {
        expectAffected(
          await admin
            .from('games')
            .update({ mode_config: withPlayOn(game.mode_config, false) })
            .eq('id', game.id)
            .select('id'),
          'undoCupWithdrawal/clearPlayOn',
        );
      }
    }
  } catch (err) {
    console.error('[cup] undoCupWithdrawal failed', { tournamentId, userId, err });
    return { error: 'withdraw_failed' };
  }

  revalidateCup(
    tournamentId,
    actor.groupId,
    toUndo.map((g) => g.id),
  );
  redirect(`${cupBasePath(tournamentId, actor.groupId)}?status=withdrawal_undone`);
  return { error: '' }; // unreachable
}

/**
 * Arrangøren velger (eller ombestemmer seg om) at makkeren spiller alene i én
 * fourball-kamp (E4). Kun mens kampen er `scheduled`, og kun når noen faktisk
 * har trukket seg fra den — ellers betyr flagget ingenting.
 */
export async function setFourballWithdrawalChoice(
  formData: FormData,
): Promise<CupWithdrawalError> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const gameId = String(formData.get('game_id') ?? '').trim();
  const playOn = String(formData.get('play_on') ?? '') === '1';
  if (!tournamentId || !gameId) return { error: 'not_found' };

  const supabase = await getServerClient();
  const actor = await requireAdminOrClubAdminOfCup(supabase, tournamentId);
  const admin = getAdminClient();

  // `game_id` kommer fra klienten — kampen MÅ høre til denne cupen, ellers
  // ville en fremmed kamp vært skrivbar med en cup kalleren tilfeldigvis styrer.
  const { data: game, error: gErr } = await admin
    .from('games')
    .select('id, tournament_id, status, game_mode, mode_config')
    .eq('id', gameId)
    .maybeSingle();
  if (gErr) {
    console.error('[cup] setFourballWithdrawalChoice read failed', { gameId, gErr });
    return { error: 'withdraw_failed' };
  }
  if (!game || game.tournament_id !== tournamentId) return { error: 'not_found' };
  if (game.status !== 'scheduled' || game.game_mode !== 'fourball_matchplay') {
    return { error: 'match_not_eligible' };
  }

  const { data: rows, error: pErr } = await admin
    .from('game_players')
    .select('user_id, team_number, withdrawn_at')
    .eq('game_id', gameId);
  if (pErr) {
    console.error('[cup] setFourballWithdrawalChoice roster read failed', { gameId, pErr });
    return { error: 'withdraw_failed' };
  }
  const players = (rows ?? []) as {
    user_id: string;
    team_number: number | null;
    withdrawn_at: string | null;
  }[];
  const withdrawnSides = new Set(
    players.filter((p) => p.withdrawn_at != null).map((p) => p.team_number),
  );
  if (withdrawnSides.size === 0) return { error: 'match_not_eligible' };
  // Uten en aktiv makker igjen på hver trukket side er valget uten mening —
  // kampen er avgjort uansett flagg.
  const everySideHasSomeoneLeft = [...withdrawnSides].every((side) =>
    players.some((p) => p.team_number === side && p.withdrawn_at == null),
  );
  if (!everySideHasSomeoneLeft) return { error: 'match_not_eligible' };

  try {
    expectAffected(
      await admin
        .from('games')
        .update({ mode_config: withPlayOn(game.mode_config, playOn) })
        .eq('id', gameId)
        .eq('status', 'scheduled')
        .select('id'),
      'setFourballWithdrawalChoice',
    );
  } catch (err) {
    console.error('[cup] setFourballWithdrawalChoice write failed', { gameId, err });
    return { error: 'withdraw_failed' };
  }

  revalidateCup(tournamentId, actor.groupId, [gameId]);
  redirect(`${cupBasePath(tournamentId, actor.groupId)}?status=play_on_saved`);
  return { error: '' }; // unreachable
}

/** Lokal, synkron lesing av flagget (modulen er `'use server'`, så ingen eksport). */
function readPlayOn(modeConfig: unknown): boolean {
  if (!modeConfig || typeof modeConfig !== 'object') return false;
  return (modeConfig as { withdrawal_play_on?: unknown }).withdrawal_play_on === true;
}
