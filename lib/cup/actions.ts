'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';
import {
  getRoleContext,
  requireAdminOrClubAdmin,
  requireAdminOrClubAdminOfCup,
} from '@/lib/admin/auth';
import { teeGenderOf } from '@/lib/games/teeGender';
import { notifyInvitedToGame } from '@/lib/notifications/notifyInvitedToGame';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/lib/database.types';
import { getCupSnapshot } from './getCupSnapshot';
import { getCupCandidatePlayers } from './getCupCandidatePlayers';
import { validateMatchSwap } from './matchSwapValidation';
import { loadTournamentParticipantEmails } from './tournamentParticipants';
import { allSideAwardsRegistered } from './sideAwardsRegistered';
import { matchBlocksOneTapFinish } from './matchSubmissionStatus';
import { endGameCore } from '@/lib/games/endGameCore';
import { planTournamentGameDeletion } from './tournamentGameDeletion';
import { ALLOWANCE_DEFAULTS, parseAllowancePct } from './allowance';
import {
  derivePointsToWinWeighted,
  parseTiePoints,
  parseWinPoints,
} from './pointsToWin';
import { sendCupStartedNotification } from '@/lib/mail/cupStartedNotification';
import { sendCupFinishedNotification } from '@/lib/mail/cupFinishedNotification';
import {
  notifyParticipantsCupFinished,
  notifyParticipantsCupStarted,
} from '@/lib/notifications/events';

// Form-felt-keyene matcher hidden inputs i cup-create-formet + admin-detalj-
// formene. Holdt eksplisitt for å gjøre call-sites lesbare.

const NAME_RE = /^.{1,80}$/;
const TEAM_NAME_RE = /^.{1,40}$/;

// Allowance parsers er konsolidert i ./allowance.ts (#809).
// Use parseAllowancePct(raw, ALLOWANCE_DEFAULTS.<format>) at call-sites.

// #1441 (D8) — samme 1/0,5-default som computeCupLeaderboard/pointsToWin.ts
// faller tilbake til. Egen konstant her av samme grunn de filene er
// uavhengige: ingen av dem importerer fra hverandre.
const DEFAULT_WIN_POINTS = 1;
const DEFAULT_TIE_POINTS = 0.5;

// Weighted-points parsers (win_points > 0, tie_points >= 0) er konsolidert i
// ./pointsToWin.ts (#1441, D8) — samme mønster som allowance.ts over.

/**
 * Felles redirect/revalidate-mål for cup-styringshandlinger (#524). Klubb-cup
 * (group_id satt) holder seg i klubb-chrome; frittstående går til admin-cup.
 * Leses via request-scoped klient — kalleren er allerede gatet, så en klubb-cup
 * er synlig (medlem/admin via scoped-select RLS 0089).
 */
async function cupRedirectBase(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  id: string,
): Promise<{ path: string; groupId: string | null; revalidate: () => void }> {
  const { data } = await supabase
    .from('tournaments')
    .select('group_id')
    .eq('id', id)
    .maybeSingle();
  const groupId = (data?.group_id as string | null | undefined) ?? null;
  const path = groupId ? `/klubber/${groupId}/cup/${id}` : `/admin/cup/${id}`;
  return {
    path,
    groupId,
    revalidate: () => {
      revalidatePath(`/admin/cup/${id}`);
      if (groupId) revalidatePath(`/klubber/${groupId}/cup/${id}`);
    },
  };
}

/**
 * Feilresultat fra `createTournamentDraft` (#1397). Egen type — bevisst ikke
 * importert fra league — så cup- og liga-domenene forblir uavhengige (samme
 * `{ error }`-form, ingen kryss-import). `CupSetup` mapper koden til norsk via
 * `cup.create.errors.*` med `unexpected`-fallback.
 */
export type CupActionError = { error: string };

export async function createTournamentDraft(
  formData: FormData,
): Promise<CupActionError> {
  // #524: group_id binder cupen til en klubb. Tom = frittstående (uendret
  // admin-flyt).
  const rawGroupId = String(formData.get('group_id') ?? '').trim();
  const groupId = rawGroupId || null;
  // #1397: feil returneres som action-resultat (`{ error: kode }`) i stedet for
  // en redirect til opprett-siden — redirecten unmonterte det utfylte
  // `CupSetup`-skjemaet og slettet det arrangøren hadde tastet. Kun suksess-
  // redirecten under (og auth-gatene) kaster fortsatt NEXT_REDIRECT. Kodene er
  // uendret; `CupSetup` slår dem opp i `cup.create.errors.*`.

  const name = String(formData.get('name') ?? '').trim();
  const team1 = String(formData.get('team_1_name') ?? '').trim();
  const team2 = String(formData.get('team_2_name') ?? '').trim();
  const allowanceRaw = String(formData.get('fourball_allowance_pct') ?? '');
  const foursomesAllowanceRaw = String(
    formData.get('foursomes_allowance_pct') ?? '',
  );
  const greensomeAllowanceRaw = String(formData.get('greensome_allowance_pct') ?? '');
  const chapmanAllowanceRaw = String(formData.get('chapman_allowance_pct') ?? '');
  const gruesomeAllowanceRaw = String(formData.get('gruesome_allowance_pct') ?? '');
  // #1441 (D8): valgfrie vektede cup-poeng. Tomt felt (dagens skjema,
  // ordinære cuper) → utelates fra inserten, DB-default 1/0,5 gjelder.
  const winPointsRaw = String(formData.get('win_points') ?? '');
  const tiePointsRaw = String(formData.get('tie_points') ?? '');

  if (!NAME_RE.test(name)) return { error: 'cup_name' };
  if (!TEAM_NAME_RE.test(team1)) return { error: 'cup_team_1' };
  if (!TEAM_NAME_RE.test(team2)) return { error: 'cup_team_2' };
  if (team1.toLowerCase() === team2.toLowerCase())
    return { error: 'cup_team_dup' };
  const fourballAllowance = parseAllowancePct(allowanceRaw, ALLOWANCE_DEFAULTS.fourball);
  if (fourballAllowance === null) return { error: 'cup_allowance' };
  const foursomesAllowance = parseAllowancePct(foursomesAllowanceRaw, ALLOWANCE_DEFAULTS.foursomes);
  if (foursomesAllowance === null) return { error: 'cup_foursomes_allowance' };
  const greensomeAllowance = parseAllowancePct(greensomeAllowanceRaw, ALLOWANCE_DEFAULTS.greensome);
  if (greensomeAllowance === null) return { error: 'cup_greensome_allowance' };
  const chapmanAllowance = parseAllowancePct(chapmanAllowanceRaw, ALLOWANCE_DEFAULTS.chapman);
  if (chapmanAllowance === null) return { error: 'cup_chapman_allowance' };
  const gruesomeAllowance = parseAllowancePct(gruesomeAllowanceRaw, ALLOWANCE_DEFAULTS.gruesome);
  if (gruesomeAllowance === null) return { error: 'cup_gruesome_allowance' };
  // #1441 (D8): win_points > 0, tie_points >= 0 (migrasjon 0153 CHECK-ene).
  const winPoints = parseWinPoints(winPointsRaw);
  if (winPoints === null) return { error: 'cup_win_points' };
  const tiePoints = parseTiePoints(tiePointsRaw);
  if (tiePoints === null) return { error: 'cup_tie_points' };

  const supabase = await getServerClient();
  // Klubb-cup: klubb-eier/-admin (eller global admin) oppretter. Personlig
  // (frittstående) cup: enhver innlogget bruker oppretter sin egen (#526);
  // created_by settes til brukeren og caps håndheves når matcher genereres.
  // RLS er backstop på begge (0089 admin/klubb-admin, 0090 skaper).
  const { userId } = groupId
    ? await requireAdminOrClubAdmin(supabase, groupId)
    : await getRoleContext(supabase);

  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      name,
      team_1_name: team1,
      team_2_name: team2,
      // points_to_win utelates med vilje: en draft vet ikke hvor mange matcher
      // den får ennå. startTournament utleder målet fra det reelle antallet.
      fourball_allowance_pct: fourballAllowance as number,
      foursomes_allowance_pct: foursomesAllowance as number,
      greensome_allowance_pct: greensomeAllowance as number,
      chapman_allowance_pct: chapmanAllowance as number,
      gruesome_allowance_pct: gruesomeAllowance as number,
      created_by: userId,
      group_id: groupId,
      // #1441 (D8): utelates når feltet var tomt — DB-default 1/0,5 (migrasjon
      // 0153) gjelder da, bit for bit dagens oppførsel for ordinære cuper.
      ...(winPoints !== undefined ? { win_points: winPoints } : {}),
      ...(tiePoints !== undefined ? { tie_points: tiePoints } : {}),
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[cup] createTournamentDraft failed', { error });
    return { error: 'cup_insert_failed' };
  }

  // Klubb-sti: fortsett i klubb-chrome (generer kamper der). Frittstående:
  // admin-cup-detalj som før.
  redirect(
    groupId
      ? `/klubber/${groupId}/cup/${data.id}`
      : `/admin/cup/${data.id}?status=created`,
  );
}

export async function startTournament(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/cup?error=not_found');

  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, id);
  const base = await cupRedirectBase(supabase, id);

  // Krev minst 2 matches før start (per kontrakt-success-kriterium).
  const { count } = await supabase
    .from('games')
    .select('id', { head: true, count: 'exact' })
    .eq('tournament_id', id);
  if ((count ?? 0) < 2) {
    redirect(`${base.path}?error=too_few_matches`);
  }

  const { data: current } = await supabase
    .from('tournaments')
    .select('id, name, status, team_1_name, team_2_name, win_points, tie_points')
    .eq('id', id)
    .maybeSingle();
  if (!current) redirect(`/admin/cup?error=not_found`);
  if (current.status !== 'draft') {
    redirect(`${base.path}?error=wrong_status`);
  }

  // #1142: dette er første punktet der det ekte match-antallet finnes — matcher
  // genereres i /generer mens status='draft', og start er siste gate før cupen
  // blir aktiv. Draft-raden bar NULL fram til nå.
  //
  // #1441 (D8): vektbar variant — når cupens win_points/tie_points avviker
  // fra default 1/0,5, settes points_to_win til NULL i stedet («først til
  // X»-UI-en skjules; vinneren avgjøres ved finishTournament, som allerede
  // takler NULL, #1142). Med default-vektene er dette bit for bit
  // `derivePointsToWin(count)` som før.
  const pointsToWin = derivePointsToWinWeighted(
    count ?? 0,
    (current.win_points as number | null) ?? DEFAULT_WIN_POINTS,
    (current.tie_points as number | null) ?? DEFAULT_TIE_POINTS,
  );

  // #727: assert the status flip touched a row (bug-prevention #2).
  try {
    expectAffected(
      await supabase
        .from('tournaments')
        .update({
          status: 'active',
          started_at: new Date().toISOString(),
          points_to_win: pointsToWin,
        })
        .eq('id', id)
        .select('id'),
      'startTournament',
    );
  } catch (err) {
    console.error('[cup] startTournament failed', { id, err });
    redirect(`${base.path}?error=start_failed`);
  }

  // Best-effort start-varsel: in-app til ALLE deltakere først, mail kun til
  // off-app-deltakere (#417). Symmetrisk søster av cup-avslutningen (#377) —
  // samme in-app-først-prinsipp som enkeltspill, ingen blanket-mail til alle.
  //
  // Mottakerlista slås opp med admin-klienten inne i helperen (#1540) — med den
  // request-scopede klienten kollapset den til arrangørens egen flight når
  // arrangøren ikke var global admin. Deltakere uten e-post droppes, men
  // Tørny-auth er e-post-OTP, så alle brukere HAR e-post — lista er dermed hele
  // deltaker-settet, og in-app fyrer for alle reelle deltakere.
  const recipients = await loadTournamentParticipantEmails(id);
  const sendMailByUserId = await notifyParticipantsCupStarted(
    recipients,
    { id, name: current.name },
    'startTournament',
  );

  // Mail går KUN til off-app-deltakere (shouldAlsoSendMail === true). Aktive
  // deltakere ble nettopp varslet in-app og trenger ingen mail.
  try {
    const mailRecipients = recipients.filter(
      (r) => sendMailByUserId.get(r.user_id) === true,
    );
    const results = await Promise.allSettled(
      mailRecipients.map((r) =>
        sendCupStartedNotification({
          to: r.email,
          playerFirstName: r.name?.split(' ')[0] ?? null,
          tournamentName: current.name,
          tournamentId: id,
          team1Name: current.team_1_name,
          team2Name: current.team_2_name,
          // Den nettopp utledede verdien — `current` ble lest før update-en
          // og bærer fortsatt NULL. NULL = vektet cup (#1441 D8); malen
          // brancher selv til weighted-copyen (#1444).
          pointsToWin,
          locale: r.locale,
        }),
      ),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[cup] cupStartedNotification failed', r.reason);
      }
    }
  } catch (e) {
    console.error('[cup] startTournament mail-fan-out failed', e);
  }

  revalidateTag(`tournament-${id}`, 'max');
  base.revalidate();
  revalidatePath(`/cup/${id}`);
  redirect(`${base.path}?status=started`);
}

export async function finishTournament(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/cup?error=not_found');
  // «Avslutt likevel» (#1501/#375): sekundær-formen setter allow_missing=true
  // for å ende cupen selv om noen spillere ikke har levert (per-kamp
  // allowMissing). Peer-approval-gaten relaxes ALDRI (#360) — den består i
  // pipelinen uansett.
  const allowMissing = String(formData.get('allow_missing') ?? '') === 'true';

  const supabase = await getServerClient();
  const actor = await requireAdminOrClubAdminOfCup(supabase, id);
  const base = await cupRedirectBase(supabase, id);

  // Navne-fallbacken snapshot-en bygger (#1527) følger arrangørens locale.
  const tCup = await getTranslations('cup');
  const unknownLabel = tCup('manage.unknownPlayer');

  const snapshot = await getCupSnapshot(id, unknownLabel);
  if (!snapshot) redirect('/admin/cup?error=not_found');
  if (snapshot.tournament.status === 'finished') {
    redirect(`${base.path}?error=already_finished`);
  }

  // 1. Sidepoeng-gate (#1501): cupen kan ikke avsluttes før alle konfigurerte
  // sidepoeng har en registrering (ctp/ld → vinner; gir → begge tellere, 0
  // gyldig). Server-side re-validering av det CupManagement allerede disabler.
  if (!allSideAwardsRegistered(snapshot.sideAwards)) {
    redirect(`${base.path}?error=side_awards_missing`);
  }

  // 2. Host-kamper endes eksplisitt (source_game_id IS NULL); avledede følger
  // via `finishDerivedGames` i pipelinen. Vi arbeider på ACTIVE host-kamper —
  // allerede finished hopper over (idempotent re-trykk), og scheduled/draft
  // ble aldri spilt (dagens flip rørte uansett aldri kampene).
  const activeHostMatches = snapshot.leaderboard.matches.filter(
    (m) => (m.sourceGameId ?? null) === null && m.status === 'active',
  );

  // 3. Leverings-gate (#1501/#375/#1488 K5): med mindre «Avslutt likevel», må
  // hver active host-kamp enten ha alle ikke-trukne kort levert ELLER være helt
  // trukket (den avsluttes da via WD-skip). Delt predikat med CupManagement-
  // banneret. Mangler noen → stopp med kampliste + «Avslutt likevel»-valg.
  if (!allowMissing) {
    const blocking = activeHostMatches.filter(matchBlocksOneTapFinish);
    if (blocking.length > 0) {
      redirect(`${base.path}?error=matches_not_submitted`);
    }
  }

  // 4. Løpet: end hver active host-kamp via den EKTE endGame-pipelinen
  // (resultatsammendrag, differensialer, bragder, rundereferat; avledede følger
  // via finishDerivedGames). Skriver via admin-client — en klubb-styrer er ikke
  // games-creator, så creator-RLS-en (0071) dekker ikke stien; authz er alt
  // gjort av `requireAdminOrClubAdminOfCup` over (AGENTS.md trap #3). Per-kamp-
  // varsler undertrykkes — cup-mailen under er reveal-signalet. Feil samles;
  // feiler NOEN kamp → cupen avsluttes IKKE (ingen stille halvferdig tilstand;
  // allerede-avsluttede kamper står, re-trykk er trygt/idempotent).
  const adminClient = getAdminClient();
  const finishActor = { id: actor.userId, name: actor.name?.trim() || 'Arrangør' };
  const finishFailures: string[] = [];
  for (const m of activeHostMatches) {
    const result = await endGameCore(adminClient, m.gameId, finishActor, {
      allowMissing,
      suppressPerGameNotifications: true,
    });
    if (!result.ok) {
      finishFailures.push(m.gameId);
      console.error('[cup] finishTournament match finish failed', {
        id,
        gameId: m.gameId,
        reason: result.reason,
      });
    }
  }
  if (finishFailures.length > 0) {
    redirect(`${base.path}?error=match_finish_failed`);
  }

  // 5. Re-les snapshotet etter at kampene er avsluttet — vinneren regnes på den
  // ferske stillingen (match-poeng teller kun for `finished` kamper).
  const finalSnapshot = await getCupSnapshot(id, unknownLabel);
  if (!finalSnapshot) redirect('/admin/cup?error=not_found');
  const finalLeaderboard = finalSnapshot!.leaderboard;
  const finalTournament = finalSnapshot!.tournament;

  // Vinner bestemmes av point-status ved avslutning. Hvis ingen lag leder →
  // vinner-team forblir NULL (uavgjort cup avsluttes uten vinner-deklarering).
  let winnerTeam: 1 | 2 | null = null;
  if (finalLeaderboard.team1Points > finalLeaderboard.team2Points) {
    winnerTeam = 1;
  } else if (finalLeaderboard.team2Points > finalLeaderboard.team1Points) {
    winnerTeam = 2;
  }

  // #727: assert the finish update touched a row (bug-prevention #2).
  try {
    expectAffected(
      await supabase
        .from('tournaments')
        .update({
          status: 'finished',
          finished_at: new Date().toISOString(),
          winner_team: winnerTeam,
        })
        .eq('id', id)
        .select('id'),
      'finishTournament',
    );
  } catch (err) {
    console.error('[cup] finishTournament failed', { id, err });
    redirect(`${base.path}?error=finish_failed`);
  }

  // Best-effort avslutnings-varsel: in-app til ALLE deltakere først, mail kun
  // til off-app-deltakere (#377). Samme in-app-først-prinsipp som enkeltspill-
  // avslutningen — ingen egen blanket-mail til alle. Dette er cupens ENESTE
  // reveal-signal (#1501): per-kamp-mailene ble undertrykt i løpet over.
  //
  // Mottakerlista slås opp med admin-klienten inne i helperen (#1540) — med den
  // request-scopede klienten kollapset den til arrangørens egen flight når
  // arrangøren ikke var global admin, og de øvrige deltakerne mistet cupens
  // eneste reveal-signal. Deltakere uten e-post droppes, men Tørny-auth er
  // e-post-OTP, så alle brukere HAR e-post — lista er dermed hele
  // deltaker-settet, og in-app fyrer for alle reelle deltakere.
  const recipients = await loadTournamentParticipantEmails(id);
  const sendMailByUserId = await notifyParticipantsCupFinished(
    recipients,
    { id, name: finalTournament.name },
    'finishTournament',
  );

  // Mail går KUN til off-app-deltakere (shouldAlsoSendMail === true). Aktive
  // deltakere ble nettopp varslet in-app og trenger ingen mail.
  try {
    const mailRecipients = recipients.filter(
      (r) => sendMailByUserId.get(r.user_id) === true,
    );
    const results = await Promise.allSettled(
      mailRecipients.map((r) =>
        // #1499: mailen teaser bare — vinner/stilling sendes ikke med;
        // fasiten avsløres først på resultatsiden.
        sendCupFinishedNotification({
          to: r.email,
          playerFirstName: r.name?.split(' ')[0] ?? null,
          tournamentName: finalTournament.name,
          tournamentId: id,
          locale: r.locale,
        }),
      ),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[cup] cupFinishedNotification failed', r.reason);
      }
    }
  } catch (e) {
    console.error('[cup] finishTournament mail-fan-out failed', e);
  }

  revalidateTag(`tournament-${id}`, 'max');
  base.revalidate();
  revalidatePath(`/cup/${id}`);
  redirect(`${base.path}?status=finished`);
}

/** Alt `swapCupMatchPlayer` trenger å vite før den begynner å skrive. */
type SwapPlan = {
  /** Hele bunten (host + avledede) — brukes til TOCTOU-re-lesingen. */
  bundleIds: string[];
  /** Matchene der ut-spilleren faktisk står — de eneste som skrives. */
  gameIds: string[];
  teeGender: 'mens' | 'ladies';
};

/**
 * Lese- og valideringsfasen for et spillerbytte (#1473). Skiller seg fra
 * skrivefasen med vilje: her kan alt avbrytes gratis, etterpå må hver feil
 * kompenseres. Returnerer feilkoden direkte, klar til `{ error }`.
 */
async function planCupMatchSwap(
  admin: SupabaseClient<Database>,
  supabase: Awaited<ReturnType<typeof getServerClient>>,
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
    const candidates = await getCupCandidatePlayers(supabase, {
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
    .select('game_id, user_id')
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

  return {
    bundleIds,
    gameIds: validation.gameIds,
    teeGender: teeGenderOf((inProfile?.gender as string | null) ?? null),
  };
}

/**
 * Bytt én spiller i en generert, ikke-startet cup-match (#1473) — frafall inn,
 * reserve ut. Arrangøren slipper å slette og re-generere hele cupen fordi én
 * kompis meldte forfall kvelden før.
 *
 * Reserven hentes fra cupens kandidatliste (venner / klubbmedlemmer / alle for
 * global admin), ikke fra deltakerlista: den som stiller opp på kort varsel
 * rakk sjelden å melde seg på. Prisen er at «deltaker = profil fullført»-
 * invarianten ikke holder her, så profil- og medlemskaps-vaktene bor i
 * guard-tabellen (`matchSwapValidation.ts`) og mates fra reads under.
 *
 * Bunt, ikke enkelt-match: en splittet cup-dag (#1441 D3) lager én host-match
 * pluss avledede matcher (`source_game_id`). Arrangøren trykker på ETT kort,
 * men spilleren byttes overalt i bunten der hun står — ellers ville frafallet
 * fortsatt stått i back-nine-singelen. Guard-tabellen (hvilke matcher som
 * skrives, og om byttet er lov i det hele tatt) bor i `matchSwapValidation.ts`.
 *
 * Skriver via admin-client med authz på call-site (samme mønster som
 * `finishTournament`): en klubb-styrer er ikke games-creator, så creator-RLS-en
 * (0071) dekker ikke stien. Gaten over ER håndhevelsen (AGENTS.md trap #3).
 *
 * Delete + insert er trygt her fordi bunten er `scheduled`: ingen scores
 * finnes, og spillehandicap fryses først ved start. `game_players` har
 * komposit-PK (game_id, user_id) og ingen auto-generert nøkkel, så radene
 * kan re-inserters ordrett om noe feiler underveis (#907, felle #5).
 *
 * Feil returneres som `{ error: kode }` (#1397) — kun suksess redirecter.
 */
export async function swapCupMatchPlayer(
  formData: FormData,
): Promise<CupActionError> {
  const tournamentId = String(formData.get('tournament_id') ?? '').trim();
  const gameId = String(formData.get('game_id') ?? '').trim();
  const outUserId = String(formData.get('out_user_id') ?? '').trim();
  const inUserId = String(formData.get('in_user_id') ?? '').trim();
  if (!tournamentId || !gameId) return { error: 'not_found' };
  if (!outUserId) return { error: 'player_not_in_match' };
  if (!inUserId) return { error: 'not_candidate' };

  const supabase = await getServerClient();
  const actor = await requireAdminOrClubAdminOfCup(supabase, tournamentId);
  const base = await cupRedirectBase(supabase, tournamentId);

  const admin = getAdminClient();

  const plan = await planCupMatchSwap(admin, supabase, {
    tournamentId,
    gameId,
    groupId: base.groupId,
    actorUserId: actor.userId,
    actorIsAdmin: actor.isAdmin,
    outUserId,
    inUserId,
  });
  if ('error' in plan) return { error: plan.error };
  const { bundleIds, gameIds, teeGender } = plan;

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

  // Best-effort invite-varsel til den som kom inn (samme kind og samme
  // presedens som roster-swappen). Feiler det, står byttet uansett.
  await Promise.allSettled([
    notifyInvitedToGame({
      recipientUserId: inUserId,
      gameId: gameIds[0],
      inviterUserId: actor.userId,
    }),
  ]);

  revalidateTag(`tournament-${tournamentId}`, 'max');
  // Hver skrevet match har sin egen cache-tag (`getGameWithPlayers`) — uten
  // dette viser hull-siden og kamp-hjemmet den gamle spilleren i opptil 15 min.
  for (const writtenGameId of gameIds) {
    revalidateTag(`game-${writtenGameId}`, 'max');
  }
  base.revalidate();
  revalidatePath(`/cup/${tournamentId}`);
  redirect(`${base.path}?status=player_swapped`);
  return { error: '' }; // unreachable — redirect() kaster NEXT_REDIRECT
}

export async function deleteTournament(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/cup?error=not_found');

  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, id);

  const { data: cup } = await supabase
    .from('tournaments')
    .select('id, name, group_id')
    .eq('id', id)
    .maybeSingle();
  if (!cup) redirect('/admin/cup?error=not_found');
  const groupId = (cup.group_id as string | null | undefined) ?? null;
  const deleteErrorPath = groupId
    ? `/klubber/${groupId}/cup/${id}/slett?error=delete_failed`
    : `/admin/cup/${id}/slett?error=delete_failed`;

  // #1441 (owner-QA finding A): matcher som aldri egentlig ble spilt (draft/
  // scheduled, eller active uten en eneste score-rad) er cup-genererings-støy
  // — sletter man cupen skal de bli med i stedet for å strande på spillernes
  // hjemmeskjerm. Avledede matcher trenger ingen egen sletting her: FK-en
  // `source_game_id … on delete cascade` (migrasjon 0151) tar dem automatisk
  // når verten deres slettes under.
  const plan = await planTournamentGameDeletion(id);
  if (plan.hostIdsToDelete.length > 0) {
    try {
      expectAffected(
        await supabase
          .from('games')
          .delete()
          .in('id', plan.hostIdsToDelete)
          .select('id'),
        'deleteTournament neverPlayedGames',
      );
    } catch (err) {
      console.error('[cup] deleteTournament neverPlayedGames failed', { id, err });
      redirect(deleteErrorPath);
    }
  }

  // FK på games.tournament_id er ON DELETE SET NULL — de GJENVÆRENDE matchene
  // (reell spilling, eller status='finished') blir frittstående spill, ikke
  // slettet. Aldri-spilte matcher er allerede fjernet av batchen over.
  const { error } = await supabase.from('tournaments').delete().eq('id', id);
  if (error) {
    console.error('[cup] deleteTournament failed', { id, error });
    redirect(deleteErrorPath);
  }

  revalidateTag(`tournament-${id}`, 'max');
  // Klubb-cup: tilbake til klubb-siden (Klubbens cuper). Frittstående: admin-lista.
  if (groupId) {
    revalidatePath(`/klubber/${groupId}`);
    redirect(`/klubber/${groupId}?status=cup_deleted&name=${encodeURIComponent(cup.name)}`);
  }
  const qs = new URLSearchParams({ status: 'deleted', name: cup.name });
  redirect(`/admin/cup?${qs.toString()}`);
}
