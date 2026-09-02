'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import {
  exceedsPersonalMatchCap,
  exceedsPersonalPlayerCap,
} from '@/lib/cup/limits';
import { ALLOWANCE_DEFAULTS } from '@/lib/cup/allowance';
import {
  cupMatchAllowance,
  type CupAllowancePcts,
} from '@/lib/cup/cupMatchAllowance';
import { isTeeOffInPast } from '@/lib/games/gamePayload';
import {
  hasValidSourceMatches,
  insertCupMatches,
  teeRatingsFrom,
  type CupBatchError,
  type CupBatchMatch,
} from '@/lib/cup/insertCupMatches';

/**
 * Batch-opprettelse av cup-matcher fra en generert plan (#219, fase 4; #1441
 * F3b: splittet-cup-dag-bunten).
 *
 * Denne fila eier veiviserens REGLER: gaten, tak-vaktene, lesingen av den
 * lagrede planen (bane/tee/tee-off/best-ball) og redirecten. Selve skrivingen —
 * profil-oppslag, mode_config, to-pass-inserten og rollbacken — bor i
 * `lib/cup/insertCupMatches` fra #1884, fordi kaptein-uttakets avdekking setter
 * inn nøyaktig samme slags matcher og skal dele kjernen framfor å kopiere den.
 *
 * `'use server'`-moduler kan ikke eksportere rene helpere, så det delte hjemmet
 * måtte uansett ligge utenfor denne fila — samme grunn som `cupMatchAllowance`
 * (#1539/#1551) og `ALLOWANCE_DEFAULTS` (#809) allerede bor i lib/cup.
 */

/**
 * #1472: input-typen bærer KUN det klienten faktisk eier — cupens id og den
 * fordelte match-planen (side1/side2/segment/sourceId + greensomens
 * `teamStrokesOverride`). Bane/tee/tee-off/best-ball leses server-side fra den
 * lagrede planen (`tournament_plans`, Oppsett-rommet) i stedet for å komme som
 * klient-payload — mindre manipulasjonsflate, og serveren er fasit ved submit.
 */
export type CupBatchInput = {
  tournamentId: string;
  matches: CupBatchMatch[];
};

function isNonNegativeInteger(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0;
}

/**
 * Returnerer `{ error }` ved validerings-/DB-feil. Ved suksess redirecter den
 * til cup-detalj-siden (kaster NEXT_REDIRECT — kall-siden navigerer videre).
 */
export async function createCupMatchesFromPlan(
  input: CupBatchInput,
): Promise<CupBatchError> {
  const { tournamentId, matches } = input;

  const supabase = await getServerClient();
  // #524/#526: klubb-cup styres av klubb-admin (eller global admin); personlig
  // cup av skaperen (eller global admin). Gaten slår opp cupens group_id; RLS
  // (0089 + 0090) er backstop. isAdmin styrer cap-bypass under.
  const { userId, isAdmin } = await requireAdminOrClubAdminOfCup(
    supabase,
    tournamentId,
  );

  if (!matches || matches.length === 0) return { error: 'no_matches' };

  // #1441 (D10): valider manuelle lag-slag FØR noe skrives — malformed input
  // skal aldri kunne stå igjen halvveis i en batch. «Begge felt satt eller
  // ingen» håndheves implisitt: mangler ett, feiler tallsjekken på det.
  for (const m of matches) {
    if (m.teamStrokesOverride === undefined) continue;
    const { team1, team2 } = m.teamStrokesOverride;
    if (!isNonNegativeInteger(team1) || !isNonNegativeInteger(team2)) {
      return { error: 'invalid_team_strokes_override' };
    }
  }

  // #1441 (D3): en `sourceId` som ikke peker på en host-match i DENNE planen er
  // en manipulert payload. Avvises her, FØR cupen, planen og teen leses — en
  // tuklet payload skal ikke komme forbi det første steget. `insertCupMatches`
  // gjentar sjekken for egen del.
  if (!hasValidSourceMatches(matches)) {
    return { error: 'invalid_source_match' };
  }

  const { data: cup, error: cupErr } = await supabase
    .from('tournaments')
    .select('name, status, group_id, fourball_allowance_pct, foursomes_allowance_pct, greensome_allowance_pct, chapman_allowance_pct, gruesome_allowance_pct')
    .eq('id', tournamentId)
    .maybeSingle();
  if (cupErr || !cup) return { error: 'not_found' };
  if (cup.status !== 'draft') return { error: 'not_draft' };

  // #1472: bane/tee/tee-off/best-ball leses fra den LAGREDE planen (Oppsett-
  // rommet), ikke lenger fra klient-payloaden. Fasit ved submit — planen kan
  // ha blitt endret siden veiviseren ble lastet (annen fane/enhet). SELECT-
  // policyen (0155) dekker authenticated, så request-klienten holder.
  const { data: plan } = await supabase
    .from('tournament_plans')
    .select('course_id, tee_box_id, scheduled_tee_off_at, best_ball_allowance_pct')
    .eq('tournament_id', tournamentId)
    .maybeSingle();
  if (!plan || !plan.course_id || !plan.tee_box_id) {
    return { error: 'missing_plan' };
  }
  const courseId = plan.course_id as string;
  const teeBoxId = plan.tee_box_id as string;

  // Re-valider teen server-side: den kan ha blitt arkivert eller flyttet til en
  // annen bane etter at planen ble lagret (planen ble ikke oppdatert). En
  // utdatert plan sender arrangøren tilbake til Oppsett, ikke inn i genereringen.
  // Rating-settene (#1628) hentes i samme runde-tur: greensomens auto-forslag
  // regnes ut server-side fra spillehandicapet på nettopp denne teen.
  const { data: teeRow } = await supabase
    .from('tee_boxes')
    .select(
      'course_id, archived_at, slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors',
    )
    .eq('id', teeBoxId)
    .maybeSingle();
  if (!teeRow || teeRow.course_id !== courseId || teeRow.archived_at !== null) {
    return { error: 'plan_tee' };
  }
  const teeRatings = teeRatingsFrom(teeRow);

  // #1441 (owner-QA, F3d) → #1472: cup-start-tee-off leses nå fra planen. En
  // stale tee-off i fortiden skal sende arrangøren tilbake til Oppsett for å
  // sette et nytt tidspunkt, ikke stille generere med et forbigått start-tid.
  const scheduledTeeOffAt =
    (plan.scheduled_tee_off_at as string | null) ?? undefined;
  if (scheduledTeeOffAt !== undefined && isTeeOffInPast(scheduledTeeOffAt)) {
    return { error: 'tee_off_in_past' };
  }

  // Klubb-cup: matchene skal binde cupen til klubben (group_id på games) og kun
  // inneholde klubbmedlemmer. Pickeren tilbyr bare medlemmer, så en ikke-medlem
  // her betyr manipulert payload → avvis (guardrail, RLS på games er creator-
  // basert og fanger ikke dette).
  const groupId = (cup.group_id as string | null) ?? null;
  if (groupId) {
    const { data: memberRows } = await getAdminClient()
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId);
    const memberIds = new Set((memberRows ?? []).map((m) => m.user_id as string));
    const allInClub = matches.every((m) =>
      [...m.side1, ...m.side2].every((uid) => memberIds.has(uid)),
    );
    if (!allInClub) return { error: 'not_members' };
  } else if (!isAdmin) {
    // Personlig cup, ikke-admin: håndhev taket (#526, hevet til Ryder
    // Cup-skala i #1883 — se lib/cup/limits.ts for verdiene og historikken).
    // Teller eksisterende + nye (`matches.length` inkluderer BÅDE host- og
    // avledede matcher — en splittet-cup-dag-bunt på 4 matcher per flight
    // teller alle 4, ikke bare host-ene), så semantikken «≤ match-taket /
    // ≤ deltaker-taket i cupen» holder selv ved re-generering. Hvilket av de
    // to som binder først avhenger av formatet: 2v2-bunter bruker fire
    // distinkte spillere per flight og treffer deltaker-taket først, mens
    // singel-tunge oppsett treffer match-taket. Admin hopper over (uncapped)
    // — derfor `!isAdmin`-grenen.
    // Tellingene bruker admin-client: game_players-SELECT-RLS krever at man er
    // spiller i kampen (is_in_game), så en skaper som ikke selv spiller ville
    // lest 0 eksisterende deltakere og undertelt taket. Skaperen er allerede
    // gatet (requireAdminOrTournamentCreator), så admin-client er trygt her.
    // #1810: begge tellingene ignorerte error-kanalen og falt tilbake til `[]`
    // — en feilet `games`-lesing undertelte match-taket OG hoppet over
    // deltaker-lesingen helt (betingelsen under), så begge takene slapp
    // batchen gjennom. Vakta feiler nå LUKKET: kan vi ikke telle, generer vi
    // ikke. Ingenting er skrevet på dette punktet, så `insert_failed` er
    // riktig svar til veiviseren (0 matcher opprettet). En vellykket lesing
    // med 0 rader er derimot en gyldig, tom cup — den passerer som før.
    const admin = getAdminClient();
    const { data: existingGames, error: existingGamesError } = await admin
      .from('games')
      .select('id')
      .eq('tournament_id', tournamentId);
    if (existingGamesError) {
      console.error('[cup] generateMatches cap read failed (games)', {
        tournamentId,
        error: existingGamesError,
      });
      return { error: 'insert_failed' };
    }
    const existingGameIds = (existingGames ?? []).map((g) => g.id as string);

    let existingPlayerIds: string[] = [];
    if (existingGameIds.length > 0) {
      const { data: existingPlayers, error: existingPlayersError } = await admin
        .from('game_players')
        .select('user_id')
        .in('game_id', existingGameIds);
      if (existingPlayersError) {
        console.error('[cup] generateMatches cap read failed (game_players)', {
          tournamentId,
          error: existingPlayersError,
        });
        return { error: 'insert_failed' };
      }
      existingPlayerIds = (existingPlayers ?? []).map(
        (p) => p.user_id as string,
      );
    }

    const totalMatches = existingGameIds.length + matches.length;
    if (exceedsPersonalMatchCap(totalMatches, isAdmin)) {
      return { error: 'too_many_matches' };
    }

    const newPlayerIds = matches.flatMap((m) => [...m.side1, ...m.side2]);
    const distinctPlayers = new Set([...existingPlayerIds, ...newPlayerIds])
      .size;
    if (exceedsPersonalPlayerCap(distinctPlayers, isAdmin)) {
      return { error: 'too_many_players' };
    }
  }

  const fourballPct =
    (cup.fourball_allowance_pct as number | null) ?? ALLOWANCE_DEFAULTS.fourball;
  const foursomesPct =
    (cup.foursomes_allowance_pct as number | null) ?? ALLOWANCE_DEFAULTS.foursomes;
  const greensomePct =
    (cup.greensome_allowance_pct as number | null) ?? ALLOWANCE_DEFAULTS.greensome;
  const chapmanPct =
    (cup.chapman_allowance_pct as number | null) ?? ALLOWANCE_DEFAULTS.chapman;
  const gruesomePct =
    (cup.gruesome_allowance_pct as number | null) ?? ALLOWANCE_DEFAULTS.gruesome;
  const allowances: CupAllowancePcts = {
    fourball: fourballPct,
    foursomes: foursomesPct,
    greensome: greensomePct,
    chapman: chapmanPct,
    gruesome: gruesomePct,
    // #1441 (D4/D11, F3c) → #1472: planens lagrede «Handicap best ball (%)»
    // vinner når satt; ellers gjenbrukes cupens fourball-override (se
    // `CupAllowancePcts.bestBall`s JSDoc — bunten bruker aldri
    // `fourball_matchplay` som eget sesjonsformat, så ingen kollisjon).
    bestBall: (plan.best_ball_allowance_pct as number | null) ?? fourballPct,
  };

  // #1884: selve skrivingen (profil-oppslag, to-pass, rollback) bor nå i
  // `lib/cup/insertCupMatches` — kaptein-uttakets avdekking setter inn
  // nøyaktig samme slags matcher og deler kjernen. Gating, tak-vakter,
  // plan-lesing og redirect blir værende her, hos veiviserens egne regler.
  const outcome = await insertCupMatches(
    {
      client: supabase,
      tournamentId,
      cupName: cup.name as string,
      groupId,
      courseId,
      teeBoxId,
      teeRatings,
      allowances,
      scheduledTeeOffAt,
      createdBy: userId,
    },
    matches,
  );
  if ('error' in outcome) return outcome;

  revalidateTag(`tournament-${tournamentId}`, 'max');
  revalidatePath(`/admin/cup/${tournamentId}`);
  if (groupId) revalidatePath(`/klubber/${groupId}/cup/${tournamentId}`);
  revalidatePath(`/cup/${tournamentId}`);
  const locale = await getLocale();
  redirect({
    href: groupId
      ? `/klubber/${groupId}/cup/${tournamentId}?status=matches_generated`
      : `/admin/cup/${tournamentId}?status=matches_generated`,
    locale,
  });
  // redirect() throws NEXT_REDIRECT — unreachable, satisfies return type
  return { error: '' } as CupBatchError;
}
