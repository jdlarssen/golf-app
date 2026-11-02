'use server';

import { redirect } from '@/lib/nav/redirect';
import { expireTournamentCache } from '@/lib/games/expireGameCache';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  getRoleContext,
  requireAdminOrClubAdmin,
  requireAdminOrClubAdminOfCup,
} from '@/lib/admin/auth';
import { cupBasePath } from './cupPaths';
import { finishTournamentCore } from './finishTournamentCore';
import { expireCupSwapCaches, swapCupMatchPlayerCore } from './swapCupMatchPlayerCore';
import { startTournamentCore } from './startTournamentCore';
import { deleteCupCore, revalidateCupDeleted } from './deleteCupCore';
import { parseCupDraftForm } from './parseCupDraftForm';
import { createTournamentDraftCore } from './setupCore';

// Form-felt-keyene matcher hidden inputs i cup-create-formet + admin-detalj-
// formene. Holdt eksplisitt for å gjøre call-sites lesbare.

// Cup-formens feltvalidering (navn/lag/allowances/vektpoeng) bor i
// ./parseCupDraftForm.ts (#1778) — den eier også allowance-parserne fra
// ./allowance.ts (#809), så denne fila kaller dem ikke lenger selv.

// Weighted-points parsers (win_points > 0, tie_points >= 0) er konsolidert i
// ./pointsToWin.ts (#1441, D8) — samme mønster som allowance.ts over.

/**
 * Felles redirect/revalidate-mål for cup-styringshandlinger (#524). Klubb-cup
 * (group_id satt) holder seg i klubb-chrome; frittstående går til admin-cup.
 *
 * `groupId` kommer fra gatens admin-klient-lesing (#1749, tidligere en egen
 * duplikat-lesing her, #1718): den er ikke bare et redirect-mål — den mates
 * inn som klubb-medlemskaps-guarden i `planCupMatchSwap`, og en klubb-cup
 * som request-klienten ikke ser ville lest som `null` og skrudd guarden AV
 * (feiler ÅPENT). Send derfor ALLTID verdien fra
 * `requireAdminOrClubAdminOfCup`, aldri en RLS-lesing.
 */
function cupRedirectBase(
  id: string,
  groupId: string | null,
): { path: string; groupId: string | null; revalidate: () => void } {
  const path = cupBasePath(id, groupId);
  return {
    path,
    groupId,
    revalidate: () => {
      revalidatePath(`/admin/cup/${id}`);
      // Spillere-rommet er en egen rute og arver ikke revalideringen over
      // (#1735). Deltakerlista endrer seg av flere cup-handlinger enn de
      // rommet selv eier (et bytte melder på reserven), så den bustes her.
      revalidatePath(`/admin/cup/${id}/spillere`);
      if (groupId) {
        revalidatePath(`/klubber/${groupId}/cup/${id}`);
        revalidatePath(`/klubber/${groupId}/cup/${id}/spillere`);
      }
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
  const field = (key: string) => String(formData.get(key) ?? '');
  // #524: group_id binder cupen til en klubb. Tom = frittstående (uendret
  // admin-flyt).
  const groupId = field('group_id').trim() || null;

  // #1778: feltvalideringen bor i `parseCupDraftForm` — en ren funksjon som
  // kjører FØR DB-en røres (samme mønster som `saveCupPlan`/`parseCupPlanForm`).
  // #1397: feil returneres som action-resultat (`{ error: kode }`) i stedet for
  // en redirect til opprett-siden — redirecten unmonterte det utfylte
  // `CupSetup`-skjemaet og slettet det arrangøren hadde tastet. Kun suksess-
  // redirecten under (og auth-gatene) kaster fortsatt NEXT_REDIRECT. Kodene er
  // uendret; `CupSetup` slår dem opp i `cup.create.errors.*`.
  const parsed = parseCupDraftForm({
    name: field('name'),
    team1: field('team_1_name'),
    team2: field('team_2_name'),
    fourballAllowanceRaw: field('fourball_allowance_pct'),
    foursomesAllowanceRaw: field('foursomes_allowance_pct'),
    greensomeAllowanceRaw: field('greensome_allowance_pct'),
    chapmanAllowanceRaw: field('chapman_allowance_pct'),
    gruesomeAllowanceRaw: field('gruesome_allowance_pct'),
    // #1441 (D8): valgfrie vektede cup-poeng. Tomt felt (dagens skjema,
    // ordinære cuper) → utelates fra inserten, DB-default 1/0,5 gjelder.
    winPointsRaw: field('win_points'),
    tiePointsRaw: field('tie_points'),
  });
  if (!parsed.ok) return { error: parsed.error };
  const values = parsed.values;

  const supabase = await getServerClient();
  // Klubb-cup: klubb-eier/-admin (eller global admin) oppretter. Personlig
  // (frittstående) cup: enhver innlogget bruker oppretter sin egen (#526);
  // created_by settes til brukeren og caps håndheves når matcher genereres.
  // RLS er backstop på begge (0089 admin/klubb-admin, 0090 skaper).
  const { userId } = groupId
    ? await requireAdminOrClubAdmin(supabase, groupId)
    : await getRoleContext(supabase);

  const created = await createTournamentDraftCore(supabase, { userId, groupId, values });
  if (!created.ok) return { error: created.error };

  // Klubb-sti: fortsett i klubb-chrome (generer kamper der). Frittstående:
  // admin-cup-detalj som før.
  redirect(
    groupId
      ? `/klubber/${groupId}/cup/${created.id}`
      : `/admin/cup/${created.id}?status=created`,
  );
}

export async function startTournament(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/cup?error=not_found');

  const supabase = await getServerClient();
  const { groupId } = await requireAdminOrClubAdminOfCup(supabase, id);
  const base = cupRedirectBase(id, groupId);

  const started = await startTournamentCore(supabase, id);
  if (!started.ok) {
    if (started.error === 'not_found') redirect(`/admin/cup?error=not_found`);
    redirect(`${base.path}?error=${started.error}`);
  }

  expireTournamentCache(id);
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
  const base = cupRedirectBase(id, actor.groupId);

  // Navne-fallbacken snapshot-en bygger (#1527) følger arrangørens locale.
  const tCup = await getTranslations('cup');
  const unknownLabel = tCup('manage.unknownPlayer');

  const result = await finishTournamentCore(getAdminClient(), supabase, {
    tournamentId: id,
    actor: { id: actor.userId, name: actor.name?.trim() || 'Arrangør' },
    allowMissing,
    unknownLabel,
  });
  if (!result.ok) {
    if (result.error === 'not_found') redirect('/admin/cup?error=not_found');
    redirect(`${base.path}?error=${result.error}`);
  }
  if (result.alreadyFinished) redirect(`${base.path}?error=already_finished`);

  expireTournamentCache(id);
  base.revalidate();
  revalidatePath(`/cup/${id}`);
  redirect(`${base.path}?status=finished`);
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
  const base = cupRedirectBase(tournamentId, actor.groupId);

  const admin = getAdminClient();

  const result = await swapCupMatchPlayerCore(admin, supabase, {
    tournamentId,
    gameId,
    groupId: base.groupId,
    actorUserId: actor.userId,
    actorIsAdmin: actor.isAdmin,
    outUserId,
    inUserId,
  });
  if ('error' in result) return result;

  expireCupSwapCaches(tournamentId, result.gameIds);
  base.revalidate();
  revalidatePath(`/cup/${tournamentId}`);
  redirect(`${base.path}?status=player_swapped`);
}

export async function deleteTournament(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/cup?error=not_found');

  const supabase = await getServerClient();
  // Gaten har allerede slått opp cupens `group_id` med admin-klienten (#1749) —
  // gjenbruk den i stedet for å lese kolonnen om igjen her. Lesingen under blir
  // dermed kun `name` (redirect-QS) + eksistenssjekken.
  const { groupId } = await requireAdminOrClubAdminOfCup(supabase, id);

  const deleteErrorPath = groupId
    ? `/klubber/${groupId}/cup/${id}/slett?error=delete_failed`
    : `/admin/cup/${id}/slett?error=delete_failed`;

  const deleted = await deleteCupCore(supabase, id);
  if (!deleted.ok) {
    redirect(deleted.error === 'not_found' ? '/admin/cup?error=not_found' : deleteErrorPath);
  }

  revalidateCupDeleted(id, groupId);
  // Klubb-cup: tilbake til klubb-siden (Klubbens cuper). Frittstående: admin-lista.
  if (groupId) {
    redirect(`/klubber/${groupId}?status=cup_deleted&name=${encodeURIComponent(deleted.name)}`);
  }
  const qs = new URLSearchParams({ status: 'deleted', name: deleted.name });
  redirect(`/admin/cup?${qs.toString()}`);
}
