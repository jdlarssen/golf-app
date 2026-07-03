import { first } from '@/lib/url/searchParams';
import { Suspense } from 'react';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Skeleton } from '@/components/ui/Skeleton';
import { GameWizard } from '@/app/[locale]/admin/games/new/GameWizard';
import type { InitialValues } from '@/app/[locale]/admin/games/new/GameForm';
import {
  createGameDraft,
  createAndPublishGame,
} from '@/app/[locale]/admin/games/new/actions';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getRoleContext } from '@/lib/admin/auth';
import { parseIntent, type Intent } from '@/lib/wizard/intent';
import {
  getFormatsForIntent,
  getCupEligibleFormats,
} from '@/lib/formats/getFormatsForIntent';
import { getFormatGuideEntries } from '@/lib/formats/buildFormatGuide';
import { getFriendPlayerOptions } from '@/lib/friends/getFriendPlayerOptions';
import { getClubMemberPlayerOptions } from '@/lib/clubs/getClubMemberPlayerOptions';
import { isClubAdminAnywhere } from '@/lib/clubs/isClubAdminAnywhere';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import {
  buildRevansjeInitialValues,
  type RevansjeGameRow,
  type RevansjePlayerRow,
} from '@/lib/games/buildRevansjeInitialValues';

// Opprett-spill-ruten for ALLE innloggede brukere (#427 — tidligere bare
// admin/trusted per #198). Gjenbruker GameWizard fra admin-flyten, men kjører
// i AppShell (ikke AdminShell/Sekretariatet) så vanlige brukere aldri ser
// admin-shellen. createGameInternal bouncer nå validerings-/publiseringsfeil
// tilbake hit (ikke til /admin/games/new) for ikke-admins.

type SearchParams = Promise<{
  error?: string | string[];
  emails?: string | string[];
  // #442: klubb-side kan dyplenke med forhåndsvalgt klubb.
  klubb?: string | string[];
  // #892: Klubbhuset kan dyplenke «… eller en cup» med ?intent=cup.
  intent?: string | string[];
  // #1007: «Revansje?»-knappen på et avsluttet spill dyplenker hit med
  // kilde-spillets id. Serverside-validert i loadRevansjeContext — en
  // param som peker på en ugyldig kilde (ikke deltaker, ikke finished,
  // cup/liga) ignoreres stille og gir en helt vanlig tom veiviser.
  fra?: string | string[];
  // #1023: «Arranger runde her» på de offentlige banesidene dyplenker hit
  // med banens id. Serverside-validert i loadBaneCourseId; ugyldig/ukjent id
  // ignoreres stille. `?fra=` vinner når begge er satt (revansje er rikere).
  bane?: string | string[];
}>;

type RevansjeContext = {
  initialValues: InitialValues;
  initialIntent: Intent;
  sourceName: string;
};

/**
 * #1007 — laster prefill-context for «Revansje?»-knappen. Returnerer `null`
 * (stille ignorert, vanlig tom veiviser) med mindre ALLE gates passerer:
 * spillet finnes, brukeren er en av deltakerne, status er 'finished', og
 * spillet er hverken en cup-match (`tournament_id`) eller en liga-runde
 * (`league_round_id`). Ingenting bygges før authz-sjekken (ingen data-lekkasje
 * for en gjettet id).
 */
async function loadRevansjeContext(
  fraId: string,
  currentUserId: string,
): Promise<RevansjeContext | null> {
  const gwp = await getGameWithPlayers(fraId);
  if (!gwp) return null;

  const isParticipant = gwp.players.some((p) => p.user_id === currentUserId);
  if (!isParticipant) return null;

  const { game } = gwp;
  if (game.status !== 'finished') return null;
  if (game.tournament_id !== null || game.league_round_id !== null) return null;

  // Slim direct-fetch (à la loadCupContext/admin/games/new/page.tsx) for the
  // few EditGameRow fields NOT carried by the game-${id} cache (hcp_allowance_pct,
  // registration_*, let_friends_skip_gate). Admin client: authz is already
  // settled above (participant + finished + standalone), same doctrine as the
  // cached read.
  const { data: extra, error } = await getAdminClient()
    .from('games')
    .select(
      'hcp_allowance_pct, registration_mode, registration_type, let_friends_skip_gate',
    )
    .eq('id', fraId)
    .single<{
      hcp_allowance_pct: number;
      registration_mode: 'invite_only' | 'manual_approval' | 'open';
      registration_type: 'solo' | 'team' | 'both';
      let_friends_skip_gate: boolean;
    }>();
  if (error || !extra) return null;

  const gameRow: RevansjeGameRow = {
    id: game.id,
    name: game.name,
    courses: null,
    status: game.status,
    course_id: game.course_id,
    tee_box_id: game.tee_box_id,
    scheduled_tee_off_at: game.scheduled_tee_off_at,
    hcp_allowance_pct: extra.hcp_allowance_pct,
    require_peer_approval: game.require_peer_approval,
    score_visibility: game.score_visibility,
    side_tournament_enabled: game.side_tournament_enabled,
    side_ld_count: game.side_ld_count,
    side_ctp_count: game.side_ctp_count,
    side_disabled_categories: game.side_disabled_categories ?? [],
    game_mode: game.game_mode,
    mode_config: game.mode_config,
    registration_mode: extra.registration_mode,
    registration_type: extra.registration_type,
    let_friends_skip_gate: extra.let_friends_skip_gate,
  };
  const playerRows: RevansjePlayerRow[] = gwp.players.map((p) => ({
    user_id: p.user_id,
    team_number: p.team_number,
    flight_number: p.flight_number,
    tee_gender: p.tee_gender,
    withdrawn_at: p.withdrawn_at,
  }));

  const initialValues = buildRevansjeInitialValues(gameRow, playerRows);

  // group_id → klubb-arrangement; ellers derivér fra hvilken intent-katalog
  // formatet er synlig i (kompis foretrekkes — matcher #892-presedensen der
  // en eksplisitt signal vinner over gjetting). Cup er aldri et resultat her
  // siden game.tournament_id === null er allerede verifisert over.
  let initialIntent: Intent;
  if (game.group_id !== null) {
    initialIntent = 'klubb';
    initialValues.group_id = game.group_id;
  } else {
    // getFormatsForIntent er unstable_cache-wrappet (24t revalidate) —
    // begge kallene er cache-hits i praksis, samme katalog GameFormBody
    // uansett henter for wizard-en selv.
    const [kompisFormats, klubbFormats] = await Promise.all([
      getFormatsForIntent('kompis'),
      getFormatsForIntent('klubb'),
    ]);
    if (kompisFormats.some((f) => f.slug === game.game_mode)) {
      initialIntent = 'kompis';
    } else if (klubbFormats.some((f) => f.slug === game.game_mode)) {
      initialIntent = 'klubb';
    } else {
      initialIntent = 'solo';
    }
  }

  return { initialValues, initialIntent, sourceName: game.name };
}

/**
 * #1023 — validates the `?bane=` deep-link from the public course pages.
 * Returns the course id when the course exists (RLS: courses are
 * world-readable, so any authed user resolves it), otherwise `null` and the
 * wizard opens empty. A malformed value (not a UUID) makes PostgREST error;
 * that is swallowed into the same silent-ignore path.
 */
async function loadBaneCourseId(
  baneId: string,
  supabase: Awaited<ReturnType<typeof getServerClient>>,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('courses')
    .select('id')
    .eq('id', baneId)
    .maybeSingle<{ id: string }>();
  if (error || !data) return null;
  return data.id;
}

export default async function OpprettSpillPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Gate FØR vi rendrer noe — enhver innlogget bruker slipper inn (#427).
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });
  const currentUserId = (user as NonNullable<typeof user>).id;
  // #477: «Solo / Test»-arrangementet vises kun for admin i veiviseren.
  const { isAdmin } = await getRoleContext(supabase);

  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: 'wizard' });

  function buildErrorMessage(
    errorCode: string | undefined,
    emails: string | undefined,
  ): string | undefined {
    if (!errorCode) return undefined;
    const key = `errors.${errorCode}` as Parameters<typeof t>[0];
    // Unknown codes render no banner (mirrors the legacy map-lookup miss).
    if (!t.has(key)) return undefined;
    // Only pending_players uses {list}; extra values are ignored elsewhere.
    return t(key, { list: emails ? `: ${emails}` : '' });
  }

  const errorMessage = buildErrorMessage(first(sp.error), first(sp.emails));

  // #1007: «Revansje?» — kilde-spillets id fra game-home. Ugyldig/uautorisert
  // param (ikke deltaker, ikke finished, cup/liga) gir `null` og faller
  // stille tilbake til en helt vanlig tom veiviser (ingen feilmelding — det
  // ville lekket informasjon om spillets eksistens til en ikke-deltaker).
  const fraId = first(sp.fra);
  const revansje = fraId
    ? await loadRevansjeContext(fraId, currentUserId)
    : null;
  if (revansje) {
    console.log('[opprett-spill] revansje-prefill', fraId);
  }

  // #1023: `?bane=` fra de offentlige banesidene — kun course_id prefilles
  // (tee/spillere tar wizardens egne defaults). Revansje vinner når begge
  // paramene gir treff; en ugyldig bane-id faller stille til tom veiviser.
  const baneParam = first(sp.bane);
  const baneCourseId =
    !revansje && baneParam
      ? await loadBaneCourseId(baneParam, supabase)
      : null;

  // #892: en eksplisitt ?intent= (f.eks. cup fra Klubbhusets «… eller en cup»)
  // vinner; ellers en ?klubb=-dyplenke gir klubb-intent; revansje-derivert
  // intent er svakest presedens (den er et forslag, ikke et eksplisitt valg)
  // men vinner over "ingen signal i det hele tatt".
  const initialIntent: Intent | undefined =
    parseIntent(first(sp.intent)) ??
    (first(sp.klubb) ? 'klubb' : undefined) ??
    revansje?.initialIntent;

  return (
    <AppShell>
      <TopBar backHref="/" kicker={t('createDoor.kicker')} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('createDoor.heading')}
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          {t('createDoor.subtitle')}
        </p>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      {revansje && (
        <div className="mt-4">
          <Banner tone="info" testId="revansje-banner">
            {t('createDoor.revansjeBanner', { name: revansje.sourceName })}
          </Banner>
        </div>
      )}

      <Suspense fallback={null}>
        <PlayerShortageBanner />
      </Suspense>

      <div className="mt-5">
        <Card>
          <Suspense fallback={<GameFormSkeleton />}>
            <GameFormBody
              defaultGroupId={first(sp.klubb)}
              initialIntent={initialIntent}
              initialValues={
                revansje?.initialValues ??
                (baneCourseId ? { course_id: baneCourseId } : undefined)
              }
              // #1007/#1023: remount når prefill-kilden endres (useGameFormState
              // leser initialValues kun ved mount — key-remount-fella).
              wizardKey={fraId ?? baneCourseId ?? 'blank'}
              userId={currentUserId}
              isAdmin={isAdmin}
            />
          </Suspense>
        </Card>
      </div>
    </AppShell>
  );
}

async function PlayerShortageBanner() {
  // includeEmail=false (#435): non-admin create must not leak co-players'
  // e-postadresser into the page payload. Same `(false)` arg here and in
  // GameFormBody so React `cache` dedupes the two Suspense reads.
  const { players } = await getNewGameFormData(false);
  if (players.length >= 8) return null;
  const t = await getTranslations('wizard');
  const isSingular = players.length === 1;
  const bannerText =
    players.length === 0
      ? t('createDoor.shortageBannerZero')
      : t('createDoor.shortageBannerSome', {
          count: players.length,
          suffix: isSingular ? '' : 'e',
          plural: isSingular ? '' : 'e',
        });
  return (
    <div className="mt-4">
      <Banner tone="info">
        {bannerText}{' '}
        {t('createDoor.shortageBannerNote')}{' '}
        <SmartLink href="/" className="underline hover:no-underline">
          {t('createDoor.shortageBannerLink')}
        </SmartLink>
        {t('createDoor.shortageBannerSuffix')}
      </Banner>
    </div>
  );
}

async function GameFormBody({
  defaultGroupId,
  initialIntent,
  initialValues,
  wizardKey,
  userId,
  isAdmin,
}: {
  defaultGroupId: string | undefined;
  initialIntent: Intent | undefined;
  // #1007: prefill fra «Revansje?». Undefined for the ordinary empty-wizard path.
  initialValues: InitialValues | undefined;
  // #1007: remounts GameWizard when the `?fra=` source changes — useGameFormState
  // only reads initialValues once at mount (key-remount-fella, kjent memory-trap).
  wizardKey: string;
  userId: string;
  isAdmin: boolean;
}) {
  // F2 (#272): pre-fetch format-katalog parallelt med courses/players.
  const [
    kompisFormats,
    klubbFormats,
    soloFormats,
    cupEligibleFormats,
    formatGuide,
  ] = await Promise.all([
    getFormatsForIntent('kompis'),
    getFormatsForIntent('klubb'),
    getFormatsForIntent('solo'),
    getCupEligibleFormats(),
    getFormatGuideEntries(),
  ]);
  const [{ courses, players, clubs }, friendPlayers, clubMembers, isClubAdmin] =
    await Promise.all([
      getNewGameFormData(false),
      // #464: vennene til brukeren — picker-kilde for kompis/cup. Hentes som hele
      // PlayerOption-rader fordi users-RLS skjuler venner du aldri har spilt med.
      getFriendPlayerOptions(userId).catch(() => []),
      // #464: klubbmedlemmer — picker-kilde for klubb-intent. Må merges inn (under)
      // fordi medlemmer som ikke er co-players ellers ville forsvinne fra rosteren.
      getClubMemberPlayerOptions(userId).catch(() => ({
        memberIdsByClub: {},
        options: [],
      })),
      // #525: er brukeren klubb-admin? Styrer om «Klubb-turnering»-flisen vises.
      isClubAdminAnywhere(userId),
    ]);
  // Union venner + klubbmedlemmer inn i spiller-lista (dedup på id) så picker-
  // kilden har rad-data for alle, uansett om du har delt et spill med dem (#464).
  // Co-players ligger allerede i `players`.
  const seen = new Set(players.map((p) => p.id));
  const mergedPlayers = [...players];
  for (const extra of [...friendPlayers, ...clubMembers.options]) {
    if (!seen.has(extra.id)) {
      seen.add(extra.id);
      mergedPlayers.push(extra);
    }
  }
  const friendPlayerIds = friendPlayers.map((f) => f.id);
  return (
    <GameWizard
      key={wizardKey}
      courses={courses}
      players={mergedPlayers}
      mode={{
        kind: 'create',
        createDraftAction: createGameDraft,
        createAndPublishAction: createAndPublishGame,
      }}
      initialValues={initialValues}
      formatsByIntent={{
        kompis: kompisFormats,
        klubb: klubbFormats,
        solo: soloFormats,
      }}
      cupEligibleFormats={cupEligibleFormats}
      clubs={clubs}
      defaultGroupId={defaultGroupId}
      // #892/#1007: eksplisitt intent (cup) vinner; en ?klubb=-dyplenke eller
      // revansje-derivert klubb-tilknytning gir klubb-intent så ClubPicker
      // (kun for klubb-intent) viser den forhåndsvalgte klubben (#50-fix).
      initialIntent={initialIntent}
      friendPlayerIds={friendPlayerIds}
      clubMemberIdsByClub={clubMembers.memberIdsByClub}
      currentUserId={userId}
      isAdmin={isAdmin}
      isClubAdmin={isClubAdmin}
      formatGuide={formatGuide}
    />
  );
}

function GameFormSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full rounded-lg" />
      <Skeleton className="h-10 w-full rounded-lg" delay={60} />
      <Skeleton className="h-32 w-full rounded-lg" delay={120} />
      <Skeleton className="h-32 w-full rounded-lg" delay={180} />
      <Skeleton className="h-12 w-full rounded-full" delay={240} />
    </div>
  );
}
