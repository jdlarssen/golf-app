import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/lib/database.types';
import { expireGameCache, expireTournamentCache } from '@/lib/games/expireGameCache';
import { teeGenderOf } from '@/lib/games/teeGender';
import { notifyInvitedToGame } from '@/lib/notifications/notifyInvitedToGame';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { hasPersistentCupRole } from './captainRoles';
import { getCupCandidatePlayers } from './getCupCandidatePlayers';
import { validateMatchSwap } from './matchSwapValidation';
import {
  planParticipantRosterSync,
  swapExceedsPersonalPlayerCap,
} from './participantRosterSync';

/**
 * Spillerbyttet i en cup-kamp (#1473), delt av nettets `swapCupMatchPlayer` og
 * appens rute (#2752). Kjernen leser ingen cookie og redirecter aldri: kalleren
 * har gjort gaten og sender inn hvem som bytter. Selve bytte-reglene står på
 * `swapCupMatchPlayer`.
 *
 * `caller` er klienten som leser kandidatlista under kallerens RLS, så «er hun
 * valgbar der, er hun valgbar her» gjelder begge veier.
 */

/** Alt `swapCupMatchPlayer` trenger å vite før den begynner å skrive. */
type SwapPlan = {
  /** Hele bunten (host + avledede) — brukes til TOCTOU-re-lesingen. */
  bundleIds: string[];
  /** Matchene der ut-spilleren faktisk står — de eneste som skrives. */
  gameIds: string[];
  /**
   * ALLE cupens matcher, ikke bare bunten (#1735). Deltaker-synkingen etterpå
   * må vite om ut-spilleren fortsatt står i en annen bunt. Settet leses uansett
   * i planfasen, så det bæres videre i stedet for å hentes på nytt.
   */
  allCupGameIds: string[];
  teeGender: 'mens' | 'ladies';
};

/**
 * Lese- og valideringsfasen for et spillerbytte (#1473). Skiller seg fra
 * skrivefasen med vilje: her kan alt avbrytes gratis, etterpå må hver feil
 * kompenseres. Returnerer feilkoden direkte, klar til `{ error }`.
 */
async function planCupMatchSwap(
  admin: SupabaseClient<Database>,
  caller: SupabaseClient<Database>,
  args: {
    tournamentId: string;
    gameId: string;
    groupId: string | null;
    actorUserId: string;
    actorIsAdmin: boolean;
    outUserId: string;
    inUserId: string;
  },
): Promise<SwapPlan | { error: string }> {
  const {
    tournamentId,
    gameId,
    groupId,
    actorUserId,
    actorIsAdmin,
    outUserId,
    inUserId,
  } = args;

  // Matchen arrangøren trykket på må høre til DENNE cupen — `game_id` kommer
  // fra klienten, og en fremmed match ville ellers vært skrivbar med en cup
  // kalleren tilfeldigvis styrer.
  const { data: tapped } = await admin
    .from('games')
    .select('id, tournament_id, source_game_id')
    .eq('id', gameId)
    .maybeSingle();
  if (!tapped || tapped.tournament_id !== tournamentId) {
    return { error: 'not_found' };
  }
  const root = (tapped.source_game_id as string | null) ?? tapped.id;

  // Hele cupens matcher i ett kall; bunten plukkes ut lokalt (host = den med
  // id === root, avledede peker på den). Host først, så `gameIds` under bærer
  // rekkefølgen videre til varselet.
  const { data: cupGames, error: gamesError } = await admin
    .from('games')
    .select('id, status, source_game_id')
    .eq('tournament_id', tournamentId);
  // Klubb-cup: kun klubbmedlemmer i matchene (speiler generatorens
  // `not_members`-guard). Medlemskap kan trekkes når som helst, så det leses
  // her og nå — ikke arvet fra en liste klienten hadde.
  const { data: memberRows, error: membersError } = groupId
    ? await admin.from('group_members').select('user_id').eq('group_id', groupId)
    : { data: null, error: null };
  // Bærende, ikke arvet: `startScheduledGame` velger rating-sett fra
  // `tee_gender`, så inn-spilleren skal ha SIN egen — arver vi ut-spillerens,
  // fryses feil spillehandicap ved start. Samme runde-tur henter
  // profil-statusen guarden trenger (kandidatlista er bredere enn
  // deltakerlista, så profil-fullført er ikke lenger gitt).
  const { data: inProfile, error: profileError } = await admin
    .from('users')
    .select('gender, profile_completed_at')
    .eq('id', inUserId)
    .maybeSingle();
  if (gamesError || membersError || profileError) {
    console.error('[cup] swapCupMatchPlayer context read failed', {
      tournamentId,
      gameId,
      gamesError,
      membersError,
      profileError,
    });
    return { error: 'swap_failed' };
  }

  // Reserven hentes fra cupens KANDIDATLISTE — venner / klubbmedlemmer / alle
  // profil-fullførte for global admin — via samme helper som Spillere-rommet
  // og generer-veiviseren bruker. Én kilde, samme rolle-semantikk: er en
  // spiller valgbar der, er hun valgbar her. Helperen kaster på lese-feil.
  let candidateIds: string[];
  try {
    const candidates = await getCupCandidatePlayers(caller, {
      groupId,
      userId: actorUserId,
      isAdmin: actorIsAdmin,
      // Kun `id` leses under — labelen når aldri en skjerm, så en konstant
      // sparer en getTranslations-runde (samme grep som `addCupParticipant`).
      unknownLabel: 'Ukjent spiller',
    });
    // Pending venner beholdes med vilje: profil-guarden avviser dem med en
    // presis beskjed i stedet for et generisk «ikke kandidat».
    candidateIds = candidates.map((c) => c.id);
  } catch (err) {
    console.error('[cup] swapCupMatchPlayer candidate read failed', {
      tournamentId,
      gameId,
      err,
    });
    return { error: 'swap_failed' };
  }

  const inBundle = (cupGames ?? []).filter(
    (g) => ((g.source_game_id as string | null) ?? g.id) === root,
  );
  const bundle = [
    ...inBundle.filter((g) => g.id === root),
    ...inBundle.filter((g) => g.id !== root),
  ];
  const bundleIds = bundle.map((g) => g.id);
  if (bundleIds.length === 0) return { error: 'not_found' };

  const { data: playerRows, error: playersError } = await admin
    .from('game_players')
    // #1814: `withdrawn_at` leses her for guarden under — en kamp med et
    // registrert trekk kan ikke få noen byttet inn (E6).
    .select('game_id, user_id, withdrawn_at')
    .in('game_id', bundleIds);
  if (playersError) {
    console.error('[cup] swapCupMatchPlayer roster read failed', {
      tournamentId,
      gameId,
      error: playersError,
    });
    return { error: 'swap_failed' };
  }

  const validation = validateMatchSwap({
    bundle: bundle.map((g) => ({
      gameId: g.id,
      status: g.status,
      playerIds: (playerRows ?? [])
        .filter((p) => p.game_id === g.id)
        .map((p) => p.user_id as string),
      withdrawnPlayerIds: (playerRows ?? [])
        .filter((p) => p.game_id === g.id && p.withdrawn_at != null)
        .map((p) => p.user_id as string),
    })),
    outUserId,
    inUserId,
    candidateIds,
    inProfileCompleted: Boolean(inProfile?.profile_completed_at),
    clubMemberIds: groupId
      ? (memberRows ?? []).map((m) => m.user_id as string)
      : null,
  });
  if (!validation.ok) return { error: validation.error };

  const allCupGameIds = (cupGames ?? []).map((g) => g.id);

  const capError = await checkSwapParticipantCap(admin, {
    tournamentId,
    gameId,
    groupId,
    actorIsAdmin,
    outUserId,
    inUserId,
    allCupGameIds,
    writtenGameIds: validation.gameIds,
  });
  if (capError) return capError;

  return {
    bundleIds,
    gameIds: validation.gameIds,
    allCupGameIds,
    teeGender: teeGenderOf((inProfile?.gender as string | null) ?? null),
  };
}

/**
 * Deltaker-taket (#526) håndheves i planfasen av byttet (#1804): synken etter
 * byttet er den fjerde skriveveien inn i `tournament_participants`, men den er
 * best-effort med vilje (#1735) og kan ikke avvise — da hadde matchene og
 * deltakerlista pekt hver sin vei. Gaten speiler `addCupParticipant`:
 * klubb-cuper og global admin er uncapped. Returnerer `null` når byttet holder
 * seg under taket; beslutningen selv bor i `participantRosterSync.ts`.
 */
async function checkSwapParticipantCap(
  admin: SupabaseClient<Database>,
  args: {
    tournamentId: string;
    gameId: string;
    groupId: string | null;
    actorIsAdmin: boolean;
    outUserId: string;
    inUserId: string;
    allCupGameIds: string[];
    /** Matchene byttet faktisk skriver (`validation.gameIds`). */
    writtenGameIds: string[];
  },
): Promise<{ error: string } | null> {
  const { tournamentId, gameId, groupId, actorIsAdmin, outUserId, inUserId } =
    args;
  if (groupId || actorIsAdmin) return null;

  // #1884: rolle-kolonnene leses med — en ut-spiller med varig lag eller
  // kapteinsflagg blir stående på lista, og fjerningen skal da ikke godskrives
  // i tak-regnestykket.
  const { data: participantRows, error: participantsError } = await admin
    .from('tournament_participants')
    .select('user_id, team_number, is_captain')
    .eq('tournament_id', tournamentId);
  // Ut-spillerens rader over ALLE cupens matcher: en rad utenfor matchene som
  // skrives betyr at hun blir stående i en annen bunt (splittet cup-dag,
  // #1441) og beholder deltaker-raden sin.
  const { data: outRows, error: outRowsError } = await admin
    .from('game_players')
    .select('game_id')
    .eq('user_id', outUserId)
    .in('game_id', args.allCupGameIds);
  if (participantsError || outRowsError) {
    console.error('[cup] swapCupMatchPlayer cap read failed', {
      tournamentId,
      gameId,
      participantsError,
      outRowsError,
    });
    return { error: 'swap_failed' };
  }

  const writtenIds = new Set(args.writtenGameIds);
  const outRoleRow = (participantRows ?? []).find(
    (r) => r.user_id === outUserId,
  );
  const wouldExceedCap = swapExceedsPersonalPlayerCap({
    participantIds: (participantRows ?? []).map((r) => r.user_id as string),
    outUserId,
    inUserId,
    outRemainsInCup: (outRows ?? []).some(
      (r) => !writtenIds.has(r.game_id as string),
    ),
    outHasPersistentRole: hasPersistentCupRole(
      outRoleRow
        ? {
            teamNumber: (outRoleRow.team_number as 1 | 2 | null) ?? null,
            isCaptain: outRoleRow.is_captain === true,
          }
        : null,
    ),
    actorIsAdmin,
  });
  return wouldExceedCap ? { error: 'too_many_players' } : null;
}

/**
 * Hold `tournament_participants` i takt med matchene etter et bytte (#1735).
 *
 * Deltakerlista er det Spillere-rommet viser og den ENESTE spillerkilden
 * generer-veiviseren leser. Byttet skriver kun `game_players`, så uten dette
 * blir frafallet stående på lista og reserven mangler i neste
 * genererings-runde.
 *
 * Best-effort med vilje: byttet er allerede skrevet og står uansett. En feil
 * her logges og svelges — den skal aldri velte en gjennomført endring.
 * Beslutningen (hvem meldes på, hvem fjernes) bor i `participantRosterSync.ts`.
 */
async function syncParticipantsAfterSwap(
  admin: SupabaseClient<Database>,
  args: {
    tournamentId: string;
    gameId: string;
    allCupGameIds: string[];
    outUserId: string;
    inUserId: string;
  },
): Promise<void> {
  const { tournamentId, gameId, allCupGameIds, outUserId, inUserId } = args;
  const logFailure = (error: unknown) =>
    console.error('[cup] swapCupMatchPlayer participant sync failed', {
      tournamentId,
      gameId,
      error,
    });

  try {
    // Radene til de to byttede spillerne, over ALLE cupens matcher: bredden på
    // game_id trengs fordi ut-spilleren kan stå i en annen bunt (splittet
    // cup-dag), og da beholdes deltaker-raden hennes. Smalheten på user_id
    // trengs fordi planen kun spør om disse to — å lese hele cup-rosteret var
    // O(alle deltakere) og kunne bli stille trunkert av PostgREST, slik at en
    // spiller som fortsatt står i en match feilaktig ble fjernet (#1745).
    const { data: rosterRows, error: rosterError } = await admin
      .from('game_players')
      .select('user_id')
      .in('game_id', allCupGameIds)
      .in('user_id', [outUserId, inUserId]);
    if (rosterError) logFailure(rosterError);

    // #1884: ut-spillerens varige rolle. En benket spiller eller en
    // ikke-spillende kaptein står i null matcher, men skal bli på lista.
    // Feiler lesingen, faller vi tilbake til «ingen rolle» — synken er
    // best-effort, og fjerningsregelen er da som før kapteinene fantes.
    // Bevisst sekvensiell etter roster-lesingen, ikke i en `Promise.all`:
    // synken er best-effort og ikke tidskritisk, og to samtidige lesinger mot
    // samme klient gjorde rekkefølgen — og dermed feilsøkingen — uklar.
    const { data: outRoleRow, error: outRoleError } = await admin
      .from('tournament_participants')
      .select('team_number, is_captain')
      .eq('tournament_id', tournamentId)
      .eq('user_id', outUserId)
      .maybeSingle();
    if (outRoleError) logFailure(outRoleError);

    const plan = planParticipantRosterSync({
      outUserId,
      inUserId,
      rosterUserIds: rosterError
        ? null
        : (rosterRows ?? []).map((r) => r.user_id as string),
      outHasPersistentRole: hasPersistentCupRole(
        outRoleRow
          ? {
              teamNumber: (outRoleRow.team_number as 1 | 2 | null) ?? null,
              isCaptain: outRoleRow.is_captain === true,
            }
          : null,
      ),
    });

    if (plan.addParticipantId) {
      // Samme mønster som `addCupParticipant`: ignoreDuplicates gjør en
      // allerede påmeldt reserve til en stille no-op, ikke en feil.
      const { error } = await admin
        .from('tournament_participants')
        .upsert(
          { tournament_id: tournamentId, user_id: plan.addParticipantId },
          { onConflict: 'tournament_id,user_id', ignoreDuplicates: true },
        );
      if (error) logFailure(error);
    }

    if (plan.removeParticipantId) {
      // Bevisst INGEN expectAffected (som `removeCupParticipant`): 0 rader er
      // en ærlig no-op — spilleren var aldri påmeldt, og skal uansett ikke stå
      // der nå.
      const { error } = await admin
        .from('tournament_participants')
        .delete()
        .eq('tournament_id', tournamentId)
        .eq('user_id', plan.removeParticipantId);
      if (error) logFailure(error);
    }
  } catch (err) {
    logFailure(err);
  }
}

export async function swapCupMatchPlayerCore(
  admin: SupabaseClient<Database>,
  caller: SupabaseClient<Database>,
  args: {
    tournamentId: string;
    gameId: string;
    groupId: string | null;
    actorUserId: string;
    actorIsAdmin: boolean;
    outUserId: string;
    inUserId: string;
  },
): Promise<{ error: string } | { gameIds: string[] }> {
  const { tournamentId, gameId, groupId, actorUserId, actorIsAdmin, outUserId, inUserId } = args;

  const plan = await planCupMatchSwap(admin, caller, {
    tournamentId,
    gameId,
    groupId,
    actorUserId,
    actorIsAdmin,
    outUserId,
    inUserId,
  });
  if ('error' in plan) return { error: plan.error };
  const { bundleIds, gameIds, allCupGameIds, teeGender } = plan;

  const acceptedAt = new Date().toISOString();
  const removedRows: Tables<'game_players'>[] = [];
  const insertedGameIds: string[] = [];

  /**
   * Tilbake til før-tilstanden: slett inn-radene som rakk å bli skrevet, og
   * re-insert ut-radene ordrett. Best-effort — en feilet kompensering logges,
   * men kalleren får uansett en ærlig feilkode og kan prøve på nytt.
   */
  async function compensate(): Promise<void> {
    if (insertedGameIds.length > 0) {
      const { error } = await admin
        .from('game_players')
        .delete()
        .in('game_id', insertedGameIds)
        .eq('user_id', inUserId);
      if (error) {
        console.error('[cup] swapCupMatchPlayer compensation delete failed', error);
      }
    }
    if (removedRows.length > 0) {
      const { error } = await admin.from('game_players').insert(removedRows);
      if (error) {
        console.error('[cup] swapCupMatchPlayer compensation re-insert failed', error);
      }
    }
  }

  try {
    for (const writeGameId of gameIds) {
      // 0 slettede rader er en ekte feil her (felle #2) — guarden fant nettopp
      // spilleren i denne matchen.
      const deleted = expectAffected(
        await admin
          .from('game_players')
          .delete()
          .eq('game_id', writeGameId)
          .eq('user_id', outUserId)
          .select('*')
          .returns<Tables<'game_players'>[]>(),
        'swapCupMatchPlayer.removeOutPlayer',
      );
      removedRows.push(...deleted);

      // Eksplisitt kolonneliste: KUN lag + flight arves. Alt annet
      // (paid_at/submitted_at/approved_at/withdrawn_at/result_summary/
      // score_differential/signup_source) hører til ut-spilleren og skal aldri
      // følge med (speiler roster-swappen i admin/games/[id]/edit).
      const { error: insertError } = await admin.from('game_players').insert({
        game_id: writeGameId,
        user_id: inUserId,
        team_number: deleted[0].team_number,
        flight_number: deleted[0].flight_number,
        tee_gender: teeGender,
        // Arrangøren har bevisst satt spilleren inn → ingen «Ikke bekreftet»-
        // gate (samme beslutning som cup-genereringen, #641).
        accepted_at: acceptedAt,
        // Spillehandicap fryses ved start, ikke her.
        course_handicap: null,
      });
      if (insertError) {
        throw new Error(`swapCupMatchPlayer.addInPlayer: ${insertError.message}`);
      }
      insertedGameIds.push(writeGameId);
    }

    // TOCTOU mot cron-sveipet: auto-start fyrer hvert minutt når
    // `scheduled_tee_off_at` har passert, og fryser handicap per rad. Lander
    // byttet rett etter frysingen, ville inn-spilleren stått i en aktiv match
    // med course_handicap = null. Les statusen på nytt og rull tilbake.
    const { data: afterRows, error: afterError } = await admin
      .from('games')
      .select('id, status')
      .in('id', bundleIds);
    if (afterError) {
      throw new Error(`swapCupMatchPlayer.recheckStatus: ${afterError.message}`);
    }
    if ((afterRows ?? []).some((g) => g.status !== 'scheduled')) {
      await compensate();
      return { error: 'already_started' };
    }
  } catch (err) {
    console.error('[cup] swapCupMatchPlayer write failed', {
      tournamentId,
      gameId,
      err,
    });
    await compensate();
    return { error: 'swap_failed' };
  }

  // Deltakerlista følger matchene (#1735) — best-effort, se helperen.
  await syncParticipantsAfterSwap(admin, {
    tournamentId,
    gameId,
    allCupGameIds,
    outUserId,
    inUserId,
  });

  // Best-effort invite-varsel til den som kom inn (samme kind og samme
  // presedens som roster-swappen). Feiler det, står byttet uansett.
  await Promise.allSettled([
    notifyInvitedToGame({
      recipientUserId: inUserId,
      gameId: gameIds[0],
      inviterUserId: actorUserId,
    }),
  ]);

  return { gameIds };
}

/** Buster cachene et bytte kan ha endret. Stiene bor hos kalleren. */
export function expireCupSwapCaches(tournamentId: string, gameIds: string[]): void {
  expireTournamentCache(tournamentId);
  // Hver skrevet match har sin egen cache-tag (`getGameWithPlayers`) — uten
  // dette viser hull-siden og kamp-hjemmet den gamle spilleren i opptil 15 min.
  for (const writtenGameId of gameIds) {
    expireGameCache(writtenGameId);
  }
}
