import { Suspense } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GameWizard } from './GameWizard';
import { createGameDraft, createAndPublishGame } from './actions';
import { getNewGameFormData } from '@/lib/games/newGameFormData';
import { getServerClient } from '@/lib/supabase/server';
import { getRoleContext } from '@/lib/admin/auth';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { parseIntent, type Intent } from '@/lib/wizard/intent';
import {
  getFormatsForIntent,
  getCupEligibleFormats,
} from '@/lib/formats/getFormatsForIntent';
import { getFormatGuideEntries } from '@/lib/formats/buildFormatGuide';
import { getFriendIds } from '@/lib/friends/getFriendIds';
import { getClubMemberPlayerOptions } from '@/lib/clubs/getClubMemberPlayerOptions';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';

type SearchParams = Promise<{
  error?: string | string[];
  emails?: string | string[];
  tournament_id?: string | string[];
  game_mode?: string | string[];
  // F2 foundation (#272): wizard step 1 leser dette og pre-velger intent.
  // Cup-link fra /admin/cup/[id] vil sette intent=cup. Direkte URL kan også.
  intent?: string | string[];
  // #442: klubb-side kan dyplenke med forhåndsvalgt klubb.
  klubb?: string | string[];
}>;

/**
 * Modi som er gyldige for cup-link-pre-fyll. Cup-detalj-siden har én knapp
 * per støttet modus — andre verdier (best-ball, stableford, …) hopper over
 * pre-fyllen og lar admin starte fra default i wizarden.
 */
type CupGameMode =
  | 'singles_matchplay'
  | 'fourball_matchplay'
  | 'foursomes_matchplay'
  | 'greensome_matchplay'
  | 'chapman_matchplay'
  | 'gruesome_matchplay';

function parseCupGameMode(raw: string | undefined): CupGameMode {
  if (raw === 'fourball_matchplay') return 'fourball_matchplay';
  if (raw === 'foursomes_matchplay') return 'foursomes_matchplay';
  if (raw === 'greensome_matchplay') return 'greensome_matchplay';
  if (raw === 'chapman_matchplay') return 'chapman_matchplay';
  if (raw === 'gruesome_matchplay') return 'gruesome_matchplay';
  // Default + singles_matchplay → singles. Bevarer dagens oppførsel (cup-link
  // uten game_mode-parameter trådte tidligere alltid på singles-løypa).
  return 'singles_matchplay';
}

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function NewGamePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Klubbhuset (#392): the admin layout gate is now auth-only, so this page —
  // which renders the full member roster (incl. emails) via getNewGameFormData
  // — must self-gate. Non-admins (incl. trusted creators) belong in their own
  // /opprett-spill flow, mirroring the home-page create routing.
  const supabase = await getServerClient();
  const role = await getRoleContext(supabase);
  const locale = await getLocale();
  if (!role.isAdmin) redirect({ href: '/opprett-spill', locale });

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

  // Cup-link (#47): hvis admin lander via /admin/cup/[id], pre-fyller vi
  // game_mode + match-label og låser modus-velgeren. `game_mode`-param-en
  // (singles_matchplay | fourball_matchplay) styrer hvilken modus admin lander
  // på — cup-detalj-siden har én knapp per støttet modus.
  const tournamentIdParam = first(sp.tournament_id);
  const requestedCupMode = parseCupGameMode(first(sp.game_mode));
  const cupContext = tournamentIdParam
    ? await loadCupContext(tournamentIdParam, requestedCupMode)
    : null;

  // F2 foundation (#272): URL-drevet intent for wizard step 1. Cup-link
  // overstyrer alltid til 'cup' (en cup-link er per definisjon en
  // cup-arrangement-flyt). Andre intents leses fra ?intent=.
  // En ?klubb=-dyplenke (fra «Sett opp en runde for klubben») er per definisjon
  // en klubb-arrangement-flyt → pre-velg klubb-intent når intent ikke er gitt
  // eksplisitt, så ClubPicker (kun for klubb-intent) viser den forhåndsvalgte klubben.
  const initialIntent: Intent | undefined = cupContext
    ? 'cup'
    : parseIntent(first(sp.intent)) ?? (first(sp.klubb) ? 'klubb' : undefined);

  return (
    <AdminShell>
      <TopBar
        backHref="/admin/games"
        kicker={t('page.kicker')}
      />

      <BrassRibbon kicker={t('page.brassRibbon')} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('page.heading')}
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          {t('page.subtitle')}
        </p>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      {cupContext && (
        <div className="mt-4">
          <Banner tone="info">
            {t('page.cupBanner.linked', { name: cupContext.name })}{' '}
            {cupContext.gameMode === 'fourball_matchplay'
              ? t('page.cupBanner.fourball')
              : cupContext.gameMode === 'foursomes_matchplay'
                ? t('page.cupBanner.foursomes')
                : cupContext.gameMode === 'greensome_matchplay'
                  ? t('page.cupBanner.greensome')
                  : cupContext.gameMode === 'chapman_matchplay'
                    ? t('page.cupBanner.chapman')
                    : cupContext.gameMode === 'gruesome_matchplay'
                      ? t('page.cupBanner.gruesome')
                      : t('page.cupBanner.singles')}
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
              cupContext={cupContext}
              initialIntent={initialIntent}
              defaultGroupId={first(sp.klubb)}
            />
          </Suspense>
        </Card>
      </div>
    </AdminShell>
  );
}

type CupContext = {
  id: string;
  name: string;
  nextMatchLabel: string;
  gameMode: CupGameMode;
  /**
   * Cup-radens default fourball-allowance (0 = brutto, 1..100 = netto-prosent).
   * Pre-fylles inn i wizard sin netto/brutto-toggle for fourball-matches så
   * admin starter med cup-en sin innstilling. Settes også for singles-matches
   * for å holde typen ren — wizard-en bruker bare verdien når game_mode er
   * fourball.
   */
  fourballAllowancePct: number;
  /**
   * Cup-radens default foursomes-allowance (0 = brutto, 1..100 = netto-prosent
   * av lagenes HCP-differanse). Pre-fylles inn i wizard sin netto/brutto-toggle
   * for foursomes-matches. Default 50 (WHS) ved manglende verdi.
   */
  foursomesAllowancePct: number;
  /**
   * Cup-radens default greensome-allowance (0 = brutto, 1..100 = netto-prosent
   * av lagenes 60/40-blandede HCP-differanse). Pre-fylles inn i wizard sin
   * netto/brutto-toggle for greensome-matches. Default 100 (WHS) ved manglende verdi.
   */
  greensomeAllowancePct: number;
  /**
   * Cup-radens default chapman-allowance (0 = brutto, 1..100 = netto-prosent av
   * lagenes 60/40-blandede HCP-differanse). Pre-fylles inn for chapman-matches.
   * Default 100 (WHS Chapman matchplay-standard) ved manglende verdi. #290.
   */
  chapmanAllowancePct: number;
  /**
   * Cup-radens default gruesome-allowance (0 = brutto, 1..100 = netto-prosent av
   * lagenes summerte HCP-differanse). Pre-fylles inn for gruesome-matches.
   * Default 50 (WHS foursomes-standard — identisk handicap-formel) ved manglende verdi. #291.
   */
  gruesomeAllowancePct: number;
};

async function loadCupContext(
  tournamentId: string,
  requestedMode: CupGameMode,
): Promise<CupContext | null> {
  const supabase = await getServerClient();
  const { data: cup } = await supabase
    .from('tournaments')
    .select('id, name, status, fourball_allowance_pct, foursomes_allowance_pct, greensome_allowance_pct, chapman_allowance_pct, gruesome_allowance_pct')
    .eq('id', tournamentId)
    .maybeSingle<{
      id: string;
      name: string;
      status: string;
      fourball_allowance_pct: number | null;
      foursomes_allowance_pct: number | null;
      greensome_allowance_pct: number | null;
      chapman_allowance_pct: number | null;
      gruesome_allowance_pct: number | null;
    }>();
  if (!cup) return null;
  if (cup.status === 'finished') return null;
  // Match-label-numerering teller eksisterende matches AV SAMME modus så
  // admin får «Fourball 1» / «Foursomes 1» / «Singles 1» uavhengig av
  // rekkefølge i cupen.
  const { count } = await supabase
    .from('games')
    .select('id', { head: true, count: 'exact' })
    .eq('tournament_id', cup.id)
    .eq('game_mode', requestedMode);
  const labelPrefix =
    requestedMode === 'fourball_matchplay'
      ? 'Fourball'
      : requestedMode === 'foursomes_matchplay'
        ? 'Foursomes'
        : requestedMode === 'greensome_matchplay'
          ? 'Greensome'
          : requestedMode === 'chapman_matchplay'
            ? 'Chapman'
            : requestedMode === 'gruesome_matchplay'
              ? 'Gruesome'
              : 'Singles';
  // Default 85 (WHS) hvis cup-raden ikke har verdien satt (eldre cups før
  // 0045-migrasjonen, eller cups opprettet før chunk 5 lå ute).
  const fourballAllowancePct = cup.fourball_allowance_pct ?? 85;
  const foursomesAllowancePct = cup.foursomes_allowance_pct ?? 50;
  const greensomeAllowancePct = cup.greensome_allowance_pct ?? 100;
  const chapmanAllowancePct = cup.chapman_allowance_pct ?? 100;
  const gruesomeAllowancePct = cup.gruesome_allowance_pct ?? 50;
  return {
    id: cup.id,
    name: cup.name,
    nextMatchLabel: `${labelPrefix} ${(count ?? 0) + 1}`,
    gameMode: requestedMode,
    fourballAllowancePct,
    foursomesAllowancePct,
    greensomeAllowancePct,
    chapmanAllowancePct,
    gruesomeAllowancePct,
  };
}

async function PlayerShortageBanner() {
  const { players } = await getNewGameFormData();
  if (players.length >= 8) return null;
  // /new vet ikke hvilken modus admin lander på (velges i form-en under),
  // så copy-en nevner begge moduser. /edit har eget banner som dropper
  // visning helt for stableford siden modus er låst der.
  const t = await getTranslations('wizard');
  const isSingular = players.length === 1;
  const bannerText =
    players.length === 0
      ? t('page.shortageBannerZero')
      : t('page.shortageBannerSome', {
          count: players.length,
          suffix: isSingular ? '' : 'e',
          plural: isSingular ? '' : 'e',
        });
  return (
    <div className="mt-4">
      <Banner tone="info">
        {bannerText}{' '}
        {t('page.shortageBannerNote')}{' '}
        <SmartLink
          href="/admin/spillere"
          className="underline hover:no-underline"
        >
          {t('page.shortageBannerLink')}
        </SmartLink>
        {t('page.shortageBannerSuffix')}
      </Banner>
    </div>
  );
}

async function GameFormBody({
  cupContext,
  initialIntent,
  defaultGroupId,
}: {
  cupContext: CupContext | null;
  initialIntent: Intent | undefined;
  defaultGroupId: string | undefined;
}) {
  // Forhåndshent format-katalogen for alle ikke-cup-intents + cup-eligible
  // listen så client-wizard kan switche intent uten ekstra fetch. Parallell
  // henting + unstable_cache i F1-helperen gjør dette billig (4 DB-queries
  // sum, alle tag-cachet 24h).
  const userId = await getProxyVerifiedUserId();

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

  const [{ courses, players, clubs }, friendPlayerIds, clubMembers] =
    await Promise.all([
      getNewGameFormData(),
      // #464: vennene til admin-brukeren — picker-kilde for kompis/cup.
      // Best-effort — tom liste ved feil.
      userId ? getFriendIds(userId).catch(() => []) : Promise.resolve([]),
      // #464: klubbmedlemmer — picker-kilde for klubb-intent. Admin-rosteren
      // (hele basen) inneholder allerede medlemmene, så vi trenger bare id-mappet.
      userId
        ? getClubMemberPlayerOptions(userId).catch(() => ({
            memberIdsByClub: {},
            options: [],
          }))
        : Promise.resolve({ memberIdsByClub: {}, options: [] }),
    ]);

  return (
    <GameWizard
      courses={courses}
      players={players}
      mode={{
        kind: 'create',
        createDraftAction: createGameDraft,
        createAndPublishAction: createAndPublishGame,
      }}
      initialValues={
        cupContext ? buildCupInitialValues(cupContext) : undefined
      }
      initialIntent={initialIntent}
      formatsByIntent={{
        kompis: kompisFormats,
        klubb: klubbFormats,
        solo: soloFormats,
      }}
      cupEligibleFormats={cupEligibleFormats}
      clubs={clubs}
      defaultGroupId={defaultGroupId}
      friendPlayerIds={friendPlayerIds}
      clubMemberIdsByClub={clubMembers.memberIdsByClub}
      currentUserId={userId ?? ''}
      // #477: ruten er admin-gatet (redirect over), så «Solo / Test» vises her.
      isAdmin
      formatGuide={formatGuide}
    />
  );
}

/**
 * Bygger `initialValues` per cup-game-mode. Singles og fourball deler tournament-
 * link-feltene; fourball legger til `fourball_allowance_pct` pre-fyll fra
 * cup-raden så admin starter med cup-en sin innstilling for nye fourball-
 * matches.
 */
function buildCupInitialValues(cup: CupContext) {
  const base = {
    lock_game_mode: true as const,
    tournament_id: cup.id,
    tournament_match_label: cup.nextMatchLabel,
    name: cup.nextMatchLabel,
  };
  if (cup.gameMode === 'fourball_matchplay') {
    return {
      ...base,
      game_mode: 'fourball_matchplay' as const,
      team_size: 2 as const,
      fourball_allowance_pct: cup.fourballAllowancePct,
    };
  }
  if (cup.gameMode === 'foursomes_matchplay') {
    return {
      ...base,
      game_mode: 'foursomes_matchplay' as const,
      team_size: 2 as const,
      foursomes_allowance_pct: cup.foursomesAllowancePct,
    };
  }
  if (cup.gameMode === 'greensome_matchplay') {
    return {
      ...base,
      game_mode: 'greensome_matchplay' as const,
      team_size: 2 as const,
      greensome_allowance_pct: cup.greensomeAllowancePct,
    };
  }
  if (cup.gameMode === 'chapman_matchplay') {
    return {
      ...base,
      game_mode: 'chapman_matchplay' as const,
      team_size: 2 as const,
      chapman_allowance_pct: cup.chapmanAllowancePct,
    };
  }
  if (cup.gameMode === 'gruesome_matchplay') {
    return {
      ...base,
      game_mode: 'gruesome_matchplay' as const,
      team_size: 2 as const,
      gruesome_allowance_pct: cup.gruesomeAllowancePct,
    };
  }
  return {
    ...base,
    game_mode: 'singles_matchplay' as const,
    team_size: 1 as const,
  };
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
