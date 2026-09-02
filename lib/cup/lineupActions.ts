'use server';

import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getAdminClient } from '@/lib/supabase/admin';
import { expectAffected } from '@/lib/supabase/affectedRows';
import { notifyParticipantsCupLineupRevealed } from '@/lib/notifications/events';
import { ALLOWANCE_DEFAULTS } from './allowance';
import type { CupAllowancePcts } from './cupMatchAllowance';
import { planCupRoleChange, type CupTeamNumber } from './captainRoles';
import { exceedsPersonalMatchCap } from './limits';
import { hasDefaultCupWeights, parsePlannedMatchCount } from './pointsToWin';
import { syncCupPointsToWin } from './pointsToWinSync';
import { insertCupMatches, teeRatingsFrom } from './insertCupMatches';
import { loadCupLineupAccess, canWriteTeamLineup } from './lineupAccess';
import { squadUserIds } from './lineupData';
import { buildRevealMatches, nextLabelNumber } from './lineupReveal';
import {
  planLineupPairs,
  validateLineupSubmission,
  validateStoredLineups,
  type LineupSlotInput,
  type LineupSlotRow,
} from './lineupValidation';
import { sessionMatchCount, type CupSessionFormat } from './cupTemplates';

/**
 * Server-actions for kaptein-uttaket (#1884).
 *
 * Egen fil av samme grunn som `planActions.ts`: de nye tabellene har INGEN
 * RLS-policyer (0172, deny-by-default), så all skriving går via service-role og
 * er gatet KUN av `loadCupLineupAccess` her. Det er et distinkt
 * sikkerhetsmønster (#1542) og hører hjemme samlet, ikke spredt utover.
 *
 * ⚠️ Hver eneste action under MÅ starte med `loadCupLineupAccess` og — for alt
 * som rører ett lags uttak — `canWriteTeamLineup`. Det finnes ingen policy bak
 * som fanger en action som glemmer det.
 *
 * Feil returneres som `{ error: kode }` (#1397-mønsteret), aldri som redirect:
 * uttaks-skjemaet er fullt av kapteinens valg, og en redirect ville tømt det.
 */

export type CupLineupActionError = { error: string };

const OK: CupLineupActionError = { error: '' };

const SESSION_FORMATS: readonly CupSessionFormat[] = [
  'foursomes_matchplay',
  'fourball_matchplay',
  'singles_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
];

function revalidateCup(id: string, groupId: string | null): void {
  revalidateTag(`tournament-${id}`, 'max');
  revalidatePath(`/admin/cup/${id}`);
  revalidatePath(`/admin/cup/${id}/uttak`);
  revalidatePath(`/admin/cup/${id}/spillere`);
  if (groupId) {
    revalidatePath(`/klubber/${groupId}/cup/${id}`);
    revalidatePath(`/klubber/${groupId}/cup/${id}/spillere`);
  }
  revalidatePath(`/cup/${id}`);
}

function readTeam(formData: FormData): CupTeamNumber | null {
  const raw = formData.get('team');
  if (raw === '1') return 1;
  if (raw === '2') return 2;
  return null;
}

/**
 * SK1 — arrangøren setter lag og kaptein på deltakerlista.
 *
 * `team` tom streng = utildelt. Kapteinsflagget følger med i samme skriving,
 * så «flytt kapteinen til det andre laget» er én operasjon og ikke en
 * mellomtilstand der hun er kaptein for et lag hun ikke står på.
 */
export async function setCupParticipantRole(
  formData: FormData,
): Promise<CupLineupActionError> {
  const tournamentId = String(formData.get('id') ?? '');
  const userId = String(formData.get('user_id') ?? '');
  if (!tournamentId || !userId) return { error: 'not_found' };

  const access = await loadCupLineupAccess(tournamentId);
  // Rollen er arrangørens å dele ut. En kaptein kan ikke utnevne seg selv, og
  // slett ikke røre motstanderlaget.
  if (access.role.kind !== 'organizer') return { error: 'not_allowed' };

  const plan = planCupRoleChange({
    participants: access.participants,
    userId,
    teamNumber: readTeam(formData),
    isCaptain: formData.get('is_captain') === 'on',
  });
  if (!plan.ok) return { error: plan.error };

  const admin = getAdminClient();

  // Kapteinsflagget er unikt per lag (partiell indeks i 0172). Å frata den
  // sittende kapteinen flagget FØR vi setter det nye er derfor ikke en
  // bekvemmelighet, men det som gjør skiftet mulig i det hele tatt — uten det
  // kolliderer inserten med indeksen.
  if (plan.row.isCaptain && plan.row.teamNumber !== null) {
    const { error } = await admin
      .from('tournament_participants')
      .update({ is_captain: false })
      .eq('tournament_id', tournamentId)
      .eq('team_number', plan.row.teamNumber)
      .eq('is_captain', true)
      .neq('user_id', userId);
    if (error) {
      console.error('[cup] setCupParticipantRole clear captain failed', {
        tournamentId,
        error,
      });
      return { error: 'save_failed' };
    }
  }

  try {
    expectAffected(
      await admin
        .from('tournament_participants')
        .update({
          team_number: plan.row.teamNumber,
          is_captain: plan.row.isCaptain,
        })
        .eq('tournament_id', tournamentId)
        .eq('user_id', userId)
        .select('user_id'),
      'setCupParticipantRole',
    );
  } catch (err) {
    // 0 rader = deltakeren forsvant fra lista mellom lesingen og skrivingen.
    // «Ingen feil» er ikke det samme som «rad oppdatert» (AGENTS.md-felle 2).
    console.error('[cup] setCupParticipantRole update failed', {
      tournamentId,
      userId,
      error: err,
    });
    return { error: 'save_failed' };
  }

  revalidateCup(tournamentId, access.groupId);
  return OK;
}

/**
 * #1902 — arrangøren oppgir hvor mange kamper cupen skal ha TOTALT.
 *
 * Poengmålet ble utledet av de kampene som fantes ved start, og uttaks-øktene
 * legger til kamper etterpå — en Ryder Cup som startet med 8 av 28 fikk målet
 * 4,5, og et lag kunne krones etter dag 1. Tallet her er arrangørens utsagn om
 * hele cupen, og målet regnes av `max(faktisk, planlagt)`.
 *
 * Kan rettes når som helst før avslutning: en skrivefeil eller et for høyt tall
 * skal ikke kreve at noen åpner en økt for å bli kvitt. Er cupen alt aktiv,
 * flytter målet seg med én gang — det ER fiksen for cupen som er grunnen til
 * issuet.
 *
 * Eget kort og egen action framfor et felt inne i «Åpne en økt»: den ville
 * trengt en to-skrivs kompensasjon hvis økta feilet etter at tallet var lagret.
 */
export async function setCupPlannedMatchCount(
  formData: FormData,
): Promise<CupLineupActionError> {
  const tournamentId = String(formData.get('id') ?? '');
  if (!tournamentId) return { error: 'not_found' };

  const access = await loadCupLineupAccess(tournamentId);
  // Antall kamper er arrangørens beslutning. En kaptein som kunne satt det,
  // kunne flyttet poengmålet midt i cupen.
  if (access.role.kind !== 'organizer') return { error: 'not_allowed' };

  const admin = getAdminClient();
  const { data: cup, error: cupError } = await admin
    .from('tournaments')
    .select('status')
    .eq('id', tournamentId)
    .maybeSingle();
  if (cupError) {
    console.error('[cup] setCupPlannedMatchCount cup read failed', {
      tournamentId,
      error: cupError,
    });
    return { error: 'save_failed' };
  }
  if (!cup) return { error: 'not_found' };
  // Ferdig cup: vinneren er kåret, målet er historie.
  if (cup.status === 'finished') return { error: 'cup_finished' };

  const [{ data: sessionRows, error: sessionsErr }, { data: gameRows, error: gamesErr }] =
    await Promise.all([
      admin
        .from('cup_lineup_sessions')
        .select('slot_count, revealed_at')
        .eq('tournament_id', tournamentId),
      admin.from('games').select('id').eq('tournament_id', tournamentId),
    ]);
  // Et gulv vi ikke kan regne ut er et gulv vi ikke håndhever (I3) — samme
  // fail-lukket-regel som tak-tellingen i openCupLineupSession.
  if (sessionsErr || gamesErr) {
    console.error('[cup] setCupPlannedMatchCount count read failed', {
      tournamentId,
      sessionsErr,
      gamesErr,
    });
    return { error: 'save_failed' };
  }

  // Gulvet: kampene som alt finnes + plassene i åpnede, ikke-avdekkede økter.
  // Et lavere tall er en skrivefeil — kampene er alt satt opp og forsvinner
  // ikke av at noen skriver et mindre tall i et felt.
  const pendingSlots = (sessionRows ?? [])
    .filter((row) => row.revealed_at === null)
    .reduce((sum, row) => sum + (row.slot_count as number), 0);
  const floor = Math.max(2, (gameRows ?? []).length + pendingSlots);

  const planned = parsePlannedMatchCount(
    String(formData.get('planned_match_count') ?? ''),
    floor,
  );
  if (planned === null) return { error: 'lineup_planned_total' };

  // Klubb-cuper og global admin er uncapped (#526) — samme regel, samme hjem
  // som åpningen av en økt bruker.
  const uncapped = access.isAdmin || access.groupId !== null;
  if (exceedsPersonalMatchCap(planned, uncapped)) {
    return { error: 'too_many_matches' };
  }

  try {
    expectAffected(
      await admin
        .from('tournaments')
        .update({ planned_match_count: planned })
        .eq('id', tournamentId)
        .select('id'),
      'setCupPlannedMatchCount',
    );
  } catch (err) {
    console.error('[cup] setCupPlannedMatchCount update failed', {
      tournamentId,
      error: err,
    });
    return { error: 'save_failed' };
  }

  // Aktiv cup får det nye målet nå. Feiler synken, er tallet likevel lagret og
  // en ny lagring synker på nytt (helperen er idempotent) — derfor `save_failed`
  // framfor en kompensasjon: «prøv igjen» ER reparasjonen, og en tilbakerulling
  // ville kastet et tall arrangøren mente.
  try {
    await syncCupPointsToWin(admin, tournamentId);
  } catch (err) {
    console.error('[cup] setCupPlannedMatchCount points sync failed', {
      tournamentId,
      error: err,
    });
    return { error: 'save_failed' };
  }

  revalidateCup(tournamentId, access.groupId);
  return OK;
}

/**
 * SK2 — arrangøren åpner en økt for uttak.
 *
 * Antall plasser default-es fra de varige lagstørrelsene (samme regel som
 * veiviserens steppere, #1883) og kan justeres NED, aldri opp forbi det lagene
 * kan stille med.
 *
 * Taket håndheves HER, ikke ved avdekking: har begge kapteiner levert, skal
 * matchene bli til. En feilet avdekking ville etterlatt to leverte uttak og
 * ingen kamper, uten noe arrangøren kunne gjøre med det. Regnestykket teller
 * derfor både cupens eksisterende matcher OG plassene i allerede åpnede,
 * ikke-avdekkede økter — ellers kunne tre økter åpnes én og én under taket og
 * til sammen sprenge det.
 */
export async function openCupLineupSession(
  formData: FormData,
): Promise<CupLineupActionError> {
  const tournamentId = String(formData.get('id') ?? '');
  const format = String(formData.get('format') ?? '') as CupSessionFormat;
  const slotCount = Number(formData.get('slot_count'));
  if (!tournamentId) return { error: 'not_found' };
  if (!SESSION_FORMATS.includes(format)) return { error: 'lineup_format' };
  if (!Number.isInteger(slotCount) || slotCount < 1) {
    return { error: 'lineup_slot_count' };
  }

  const access = await loadCupLineupAccess(tournamentId);
  if (access.role.kind !== 'organizer') return { error: 'not_allowed' };

  const admin = getAdminClient();
  const { data: cup } = await admin
    .from('tournaments')
    .select('status, planned_match_count, win_points, tie_points')
    .eq('id', tournamentId)
    .maybeSingle();
  if (!cup) return { error: 'not_found' };
  if (cup.status === 'finished') return { error: 'cup_finished' };

  // #1902: poengmålet skal være kjent FØR den første økta avdekker kamper.
  // Gaten er her, server-side, ikke bare som en disabled knapp — UI-et speiler
  // den, men en POST utenom skjemaet skal treffe den samme veggen.
  //
  // Vektede cuper (#1441 D8) slipper spørsmålet: de har ikke noe «først til X»
  // i det hele tatt, så et planlagt antall ville ikke endret noe.
  const weightsAreDefault = hasDefaultCupWeights(
    (cup.win_points as number | null) ?? 1,
    (cup.tie_points as number | null) ?? 0.5,
  );
  if (weightsAreDefault && cup.planned_match_count === null) {
    return { error: 'lineup_planned_total_missing' };
  }

  // Taket for økta: den minste stallen bestemmer, som i veiviseren.
  const teamSize = Math.min(
    squadUserIds(access, 1).length,
    squadUserIds(access, 2).length,
  );
  const derived = sessionMatchCount(format, teamSize);
  if (derived < 1) return { error: 'lineup_squad_too_small' };
  if (slotCount > derived) return { error: 'lineup_slot_count' };

  const [{ data: sessionRows, error: sessionsErr }, { data: gameRows, error: gamesErr }] =
    await Promise.all([
      admin
        .from('cup_lineup_sessions')
        .select('session_index, slot_count, revealed_at')
        .eq('tournament_id', tournamentId),
      admin.from('games').select('id').eq('tournament_id', tournamentId),
    ]);
  // Feiler tellingen, åpner vi ikke — «ingen feil» er ikke det samme som
  // «0 rader» (I3), og et tak vi ikke kan regne ut er et tak vi ikke håndhever.
  if (sessionsErr || gamesErr) {
    console.error('[cup] openCupLineupSession count read failed', {
      tournamentId,
      sessionsErr,
      gamesErr,
    });
    return { error: 'save_failed' };
  }

  const existingSessions = sessionRows ?? [];
  // Samme regel som veiviseren bruker (lib/cup/lineupData:countPendingLineupSlots)
  // — regnet lokalt her fordi radene alt er lest.
  const pendingSlots = existingSessions
    .filter((s) => s.revealed_at === null)
    .reduce((sum, s) => sum + (s.slot_count as number), 0);
  const existingMatches = (gameRows ?? []).length;

  // Klubb-cuper og global admin er uncapped (#526) — samme regel som
  // veiviserens tak-vakt bruker.
  const uncapped = access.isAdmin || access.groupId !== null;
  if (
    exceedsPersonalMatchCap(existingMatches + pendingSlots + slotCount, uncapped)
  ) {
    return { error: 'too_many_matches' };
  }

  // Neste ledige posisjon — ikke `length`: en slettet økt ville ellers gitt en
  // kollisjon med unique(tournament_id, session_index).
  const nextIndex = existingSessions.reduce(
    (max, s) => Math.max(max, (s.session_index as number) + 1),
    0,
  );

  const { error } = await admin.from('cup_lineup_sessions').insert({
    tournament_id: tournamentId,
    session_index: nextIndex,
    format,
    slot_count: slotCount,
    created_by: access.userId,
  });
  if (error) {
    console.error('[cup] openCupLineupSession insert failed', {
      tournamentId,
      error,
    });
    return { error: 'save_failed' };
  }

  revalidateCup(tournamentId, access.groupId);
  return OK;
}

/**
 * Arrangøren angrer en økt hun åpnet med feil format eller antall.
 *
 * Kun før avdekking: etter at matchene er opprettet er økta historie, og
 * kampene fjernes med de vanlige slett-flatene i stedet. Kapteinenes kladd
 * forsvinner med økta (FK cascade i 0172) — det er meningen, økta finnes ikke
 * lenger.
 */
export async function deleteCupLineupSession(
  formData: FormData,
): Promise<CupLineupActionError> {
  const tournamentId = String(formData.get('id') ?? '');
  const sessionId = String(formData.get('session_id') ?? '');
  if (!tournamentId || !sessionId) return { error: 'not_found' };

  const access = await loadCupLineupAccess(tournamentId);
  if (access.role.kind !== 'organizer') return { error: 'not_allowed' };

  const admin = getAdminClient();
  const { error } = await admin
    .from('cup_lineup_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('tournament_id', tournamentId)
    .is('revealed_at', null);
  if (error) {
    console.error('[cup] deleteCupLineupSession failed', {
      tournamentId,
      sessionId,
      error,
    });
    return { error: 'save_failed' };
  }

  revalidateCup(tournamentId, access.groupId);
  return OK;
}

/** Leser `slots`-feltet: JSON på formen `[{slotIndex, userIds}]`. */
function parseSlots(raw: FormDataEntryValue | null): LineupSlotInput[] | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((entry) => ({
      slotIndex: Number((entry as { slotIndex?: unknown }).slotIndex),
      userIds: Array.isArray((entry as { userIds?: unknown }).userIds)
        ? ((entry as { userIds: unknown[] }).userIds).map((u) => String(u ?? ''))
        : [],
    }));
  } catch {
    return null;
  }
}

/**
 * SK3 — kapteinen leverer uttaket for eget lag (SK6: arrangøren kan levere på
 * vegne av begge).
 *
 * Levert = låst for kapteinen. Er BEGGE lag inne etterpå, avdekkes økta i
 * samme kall: matchene opprettes og alle varsles.
 */
export async function submitCupLineup(
  formData: FormData,
): Promise<CupLineupActionError> {
  const tournamentId = String(formData.get('id') ?? '');
  const sessionId = String(formData.get('session_id') ?? '');
  const team = readTeam(formData);
  if (!tournamentId || !sessionId) return { error: 'not_found' };
  if (team === null) return { error: 'not_allowed' };

  const access = await loadCupLineupAccess(tournamentId);
  // ⚠️ Hele hemmeligholdet på skrivesiden: en kaptein kommer ALDRI forbi denne
  // med motstanderlagets nummer, uansett hvordan payloaden ser ut.
  if (!canWriteTeamLineup(access, team)) return { error: 'not_allowed' };

  const admin = getAdminClient();
  const { data: session } = await admin
    .from('cup_lineup_sessions')
    .select(
      'id, format, slot_count, revealed_at, team_1_submitted_at, team_2_submitted_at',
    )
    .eq('id', sessionId)
    .eq('tournament_id', tournamentId)
    .maybeSingle();
  if (!session) return { error: 'not_found' };
  if (session.revealed_at !== null) return { error: 'lineup_revealed' };

  const alreadySubmitted =
    team === 1
      ? session.team_1_submitted_at !== null
      : session.team_2_submitted_at !== null;
  if (alreadySubmitted) return { error: 'lineup_already_submitted' };

  const slots = parseSlots(formData.get('slots'));
  if (!slots) return { error: 'lineup_slot_shape' };

  const validated = validateLineupSubmission({
    format: session.format as CupSessionFormat,
    slotCount: session.slot_count as number,
    squadUserIds: squadUserIds(access, team),
    slots,
  });
  if (!validated.ok) return { error: validated.error };

  // Erstatt kladden i sin helhet: kapteinen kan ha flyttet folk mellom plasser,
  // og en delvis oppdatering ville etterlatt spøkelser fra forrige lagring.
  const { error: deleteError } = await admin
    .from('cup_lineup_slots')
    .delete()
    .eq('session_id', sessionId)
    .eq('team_number', team);
  if (deleteError) {
    console.error('[cup] submitCupLineup clear failed', {
      tournamentId,
      sessionId,
      team,
      error: deleteError,
    });
    return { error: 'save_failed' };
  }

  const { error: insertError } = await admin.from('cup_lineup_slots').insert(
    validated.slots.map((s) => ({
      session_id: sessionId,
      team_number: team,
      slot_index: s.slotIndex,
      seat: s.seat,
      user_id: s.userId,
    })),
  );
  if (insertError) {
    console.error('[cup] submitCupLineup insert failed', {
      tournamentId,
      sessionId,
      team,
      error: insertError,
    });
    return { error: 'save_failed' };
  }

  // Leveringsstempelet settes KUN når det ikke alt står et der: to samtidige
  // kall for samme lag skal ikke kunne skrive over hverandre, og `.is(null)`
  // gjør det til DB-ens avgjørelse framfor vår.
  // Eksplisitte kolonnenavn framfor computed keys: Supabase-typene avviser et
  // objekt med index-signatur, og en feilstavet kolonne ville blitt en stille
  // no-op i stedet for en type-feil.
  const stampedAt = new Date().toISOString();
  const stampPatch =
    team === 1
      ? { team_1_submitted_at: stampedAt, team_1_submitted_by: access.userId }
      : { team_2_submitted_at: stampedAt, team_2_submitted_by: access.userId };
  const stampColumn =
    team === 1 ? ('team_1_submitted_at' as const) : ('team_2_submitted_at' as const);
  const { data: stamped, error: stampError } = await admin
    .from('cup_lineup_sessions')
    .update(stampPatch)
    .eq('id', sessionId)
    .is(stampColumn, null)
    .select('team_1_submitted_at, team_2_submitted_at');
  if (stampError) {
    console.error('[cup] submitCupLineup stamp failed', {
      tournamentId,
      sessionId,
      team,
      error: stampError,
    });
    return { error: 'save_failed' };
  }
  if (!stamped || stamped.length === 0) {
    // Noen andre rakk å levere for dette laget mellom lesingen og skrivingen.
    return { error: 'lineup_already_submitted' };
  }

  const bothIn =
    stamped[0].team_1_submitted_at !== null &&
    stamped[0].team_2_submitted_at !== null;

  revalidateCup(tournamentId, access.groupId);

  if (bothIn) {
    const revealError = await revealCupLineupSession(tournamentId, sessionId);
    if (revealError) return revealError;
    revalidateCup(tournamentId, access.groupId);
  }

  return OK;
}

/**
 * SK6 — arrangørens nødluke: låser opp et levert uttak før avdekking.
 *
 * Kladden blir stående, så kapteinen retter og leverer på nytt i stedet for å
 * bygge oppstillingen fra bunnen igjen.
 */
export async function unlockCupLineup(
  formData: FormData,
): Promise<CupLineupActionError> {
  const tournamentId = String(formData.get('id') ?? '');
  const sessionId = String(formData.get('session_id') ?? '');
  const team = readTeam(formData);
  if (!tournamentId || !sessionId) return { error: 'not_found' };
  if (team === null) return { error: 'not_allowed' };

  const access = await loadCupLineupAccess(tournamentId);
  // Bevisst arrangør-only: en kaptein som kunne låst opp seg selv etter at
  // motstanderen leverte, ville kunnet svare på et uttak hun ikke fikk se.
  if (access.role.kind !== 'organizer') return { error: 'not_allowed' };

  const admin = getAdminClient();
  const clearPatch =
    team === 1
      ? { team_1_submitted_at: null, team_1_submitted_by: null }
      : { team_2_submitted_at: null, team_2_submitted_by: null };
  const { data, error } = await admin
    .from('cup_lineup_sessions')
    .update(clearPatch)
    .eq('id', sessionId)
    .eq('tournament_id', tournamentId)
    // Etter avdekking finnes matchene; da er `SwapMatchPlayer` veien, ikke
    // denne. `.is(null)` gjør det til en betingelse på selve skrivingen.
    .is('revealed_at', null)
    .select('id');
  if (error) {
    console.error('[cup] unlockCupLineup failed', {
      tournamentId,
      sessionId,
      team,
      error,
    });
    return { error: 'save_failed' };
  }
  if (!data || data.length === 0) return { error: 'lineup_revealed' };

  revalidateCup(tournamentId, access.groupId);
  return OK;
}

/**
 * SK5 — avdekkingen. Kalles fra `submitCupLineup` når det andre uttaket lander.
 *
 * Rekkefølgen er valgt så en halv avdekking ikke kan bli stående (AGENTS.md-
 * felle 5):
 *
 *  1. `revealed_at` KLEMMES først, betinget på at den var null. Vinner to
 *     samtidige kall kappløpet, taper den ene her og gjør ingenting — uten
 *     dette ville begge bygget matchene og cupen fått dem to ganger.
 *  2. Matchene settes inn.
 *  3. Feiler inserten, nullstilles `revealed_at` igjen (kompensasjon), slik at
 *     arrangøren kan prøve på nytt i stedet for å sitte med en økt merket
 *     avdekket og null kamper.
 *
 * Returnerer `null` ved suksess, ellers feilkoden.
 */
type RevealContext = {
  cup: {
    name: string;
    groupId: string | null;
    createdBy: string;
    allowances: CupAllowancePcts;
  };
  courseId: string;
  teeBoxId: string;
  teeRow: Record<string, unknown>;
  scheduledTeeOffAt: string | undefined;
  format: CupSessionFormat;
  slotCount: number;
};

/**
 * Alt avdekkingen trenger å vite før den kan skrive: cupen, den lagrede planen,
 * teen og økta selv.
 *
 * Egen funksjon fordi den er ren opplasting med sine egne fem avvisninger —
 * samlet med klem-, insert- og kompensasjons-stegene ble `reveal` en funksjon
 * ingen kunne lese i ett jafs (eslint-complexity slo også ut).
 */
async function loadRevealContext(
  tournamentId: string,
  sessionId: string,
): Promise<RevealContext | CupLineupActionError> {
  const admin = getAdminClient();

  const [{ data: cup }, { data: plan }] = await Promise.all([
    admin
      .from('tournaments')
      .select(
        'name, status, group_id, created_by, fourball_allowance_pct, foursomes_allowance_pct, greensome_allowance_pct, chapman_allowance_pct, gruesome_allowance_pct',
      )
      .eq('id', tournamentId)
      .maybeSingle(),
    admin
      .from('tournament_plans')
      .select('course_id, tee_box_id, scheduled_tee_off_at, best_ball_allowance_pct')
      .eq('tournament_id', tournamentId)
      .maybeSingle(),
  ]);
  if (!cup) return { error: 'not_found' };
  if (cup.status === 'finished') return { error: 'cup_finished' };
  if (!plan?.course_id || !plan?.tee_box_id) return { error: 'missing_plan' };

  const courseId = plan.course_id as string;
  const teeBoxId = plan.tee_box_id as string;

  const { data: teeRow } = await admin
    .from('tee_boxes')
    .select(
      'course_id, archived_at, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors',
    )
    .eq('id', teeBoxId)
    .maybeSingle();
  if (!teeRow || teeRow.course_id !== courseId || teeRow.archived_at !== null) {
    return { error: 'plan_tee' };
  }

  const { data: session } = await admin
    .from('cup_lineup_sessions')
    .select('format, slot_count')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return { error: 'not_found' };

  const fourball =
    (cup.fourball_allowance_pct as number | null) ?? ALLOWANCE_DEFAULTS.fourball;
  return {
    cup: {
      name: cup.name as string,
      groupId: (cup.group_id as string | null) ?? null,
      createdBy: cup.created_by as string,
      allowances: {
        fourball,
        foursomes:
          (cup.foursomes_allowance_pct as number | null) ??
          ALLOWANCE_DEFAULTS.foursomes,
        greensome:
          (cup.greensome_allowance_pct as number | null) ??
          ALLOWANCE_DEFAULTS.greensome,
        chapman:
          (cup.chapman_allowance_pct as number | null) ??
          ALLOWANCE_DEFAULTS.chapman,
        gruesome:
          (cup.gruesome_allowance_pct as number | null) ??
          ALLOWANCE_DEFAULTS.gruesome,
        bestBall: (plan.best_ball_allowance_pct as number | null) ?? fourball,
      },
    },
    courseId,
    teeBoxId,
    teeRow: teeRow as Record<string, unknown>,
    scheduledTeeOffAt:
      (plan.scheduled_tee_off_at as string | null) ?? undefined,
    format: session.format as CupSessionFormat,
    slotCount: session.slot_count as number,
  };
}

async function revealCupLineupSession(
  tournamentId: string,
  sessionId: string,
): Promise<CupLineupActionError | null> {
  const admin = getAdminClient();

  const ctx = await loadRevealContext(tournamentId, sessionId);
  if ('error' in ctx) return ctx;
  const { cup, courseId, teeBoxId, teeRow, scheduledTeeOffAt, format, slotCount } =
    ctx;

  const { data: slotRows, error: slotsError } = await admin
    .from('cup_lineup_slots')
    .select('team_number, slot_index, seat, user_id')
    .eq('session_id', sessionId);
  if (slotsError) return { error: 'save_failed' };

  const bySide = (team: CupTeamNumber): LineupSlotRow[] =>
    (slotRows ?? [])
      .filter((r) => r.team_number === team)
      .map((r) => ({
        slotIndex: r.slot_index as number,
        seat: r.seat as 1 | 2,
        userId: r.user_id as string,
      }));

  const team1 = bySide(1);
  const team2 = bySide(2);

  // Begge uttak ble validert da de ble levert — men mot stallene slik de så ut
  // DA. Arrangøren kan lovlig ha flyttet en spiller til det andre laget eller
  // tatt hen av lista i mellomtiden, og ingen av delene rører de lagrede
  // plassene. Uten denne sjekken ville avdekkingen bygget kamper med samme
  // spiller på begge sider, eller med en som ikke er med i cupen lenger.
  const { data: currentParticipants } = await admin
    .from('tournament_participants')
    .select('user_id, team_number')
    .eq('tournament_id', tournamentId);
  const squadOf = (team: CupTeamNumber): string[] =>
    (currentParticipants ?? [])
      .filter((p) => p.team_number === team)
      .map((p) => p.user_id as string);

  const stored = validateStoredLineups({
    slotCount,
    format,
    team1,
    team2,
    squad1: squadOf(1),
    squad2: squadOf(2),
  });
  if (!stored.ok) {
    console.error('[cup] revealCupLineupSession stored lineup rejected', {
      tournamentId,
      sessionId,
      error: stored.error,
      team1: team1.length,
      team2: team2.length,
    });
    return { error: stored.error };
  }

  // 1. Klem avdekkingen. `.is('revealed_at', null)` gjør det til DB-ens
  //    avgjørelse hvem som vant, ikke vår.
  const revealedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from('cup_lineup_sessions')
    .update({ revealed_at: revealedAt })
    .eq('id', sessionId)
    .is('revealed_at', null)
    .select('id');
  if (claimError) {
    console.error('[cup] revealCupLineupSession claim failed', {
      tournamentId,
      sessionId,
      error: claimError,
    });
    return { error: 'save_failed' };
  }
  // 0 rader = en annen forespørsel avdekket akkurat nå. Ferdig, ikke en feil.
  if (!claimed || claimed.length === 0) return null;

  const { data: existingGames } = await admin
    .from('games')
    .select('game_mode')
    .eq('tournament_id', tournamentId);

  const matches = buildRevealMatches({
    sessionId,
    format,
    startNumber: nextLabelNumber(
      (existingGames ?? []).map((g) => g.game_mode as string),
      format,
    ),
    pairs: planLineupPairs({ slotCount, team1, team2 }),
  });

  // 2. Sett inn matchene. Admin-klient: kapteinen som utløste avdekkingen er
  //    ikke cupens skaper, og games-INSERT-policyen er creator-basert.
  //    `createdBy` er cupens arrangør, så eierskapet til kampene er som om hun
  //    hadde generert dem selv.
  const outcome = await insertCupMatches(
    {
      client: admin,
      tournamentId,
      cupName: cup.name,
      groupId: cup.groupId,
      courseId,
      teeBoxId,
      teeRatings: teeRatingsFrom(teeRow),
      allowances: cup.allowances,
      scheduledTeeOffAt,
      createdBy: cup.createdBy,
    },
    matches,
  );

  // 3. Kompenser: uten dette står økta merket avdekket uten en eneste kamp, og
  //    arrangøren har ingen vei videre.
  if ('error' in outcome) {
    const { error: undoError } = await admin
      .from('cup_lineup_sessions')
      .update({ revealed_at: null })
      .eq('id', sessionId);
    if (undoError) {
      console.error('[cup] revealCupLineupSession undo failed', {
        tournamentId,
        sessionId,
        error: undoError,
      });
    }
    return outcome;
  }

  // #1902 sikkerhetsnettet: kampene som nettopp ble til kan ha passert det
  // arrangøren planla — da flytter målet seg opp. Planlagt er et gulv, ikke et
  // tak. Er faktisk antall fortsatt under planlagt, er skrivet en no-op i verdi.
  //
  // Bevisst best-effort, den ene lomma i denne fila: kampene ER opprettet, og
  // en feilet omregning skal ikke rulle dem tilbake eller gi kapteinen en
  // feilmelding om et uttak som faktisk gikk gjennom. Synken er idempotent, så
  // neste avdekking retter tallet (det gjør en ny lagring av planlagt antall
  // også).
  try {
    await syncCupPointsToWin(admin, tournamentId);
  } catch (err) {
    console.error('[cup] revealCupLineupSession points sync failed', {
      tournamentId,
      sessionId,
      error: err,
    });
  }

  // Varselet er best-effort og bevisst sist: kampene står, og et varsel som
  // feiler skal ikke rulle dem tilbake.
  const { data: participantRows } = await admin
    .from('tournament_participants')
    .select('user_id')
    .eq('tournament_id', tournamentId);
  await notifyParticipantsCupLineupRevealed(
    (participantRows ?? []).map((r) => ({ user_id: r.user_id as string })),
    { id: tournamentId, name: cup.name },
    { format, matchCount: matches.length },
    'revealCupLineupSession',
  );

  return null;
}
