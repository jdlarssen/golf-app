import { first } from '@/lib/url/searchParams';
import { Suspense, cache } from 'react';
import { useTranslations } from 'next-intl';
import { getTranslations, getLocale } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { ChampagneMedallion } from '@/components/ui/ChampagneMedallion';
import { LedgerHeader } from '@/components/admin/LedgerHeader';
import { PinFlag, Laurel } from '@/components/icons';
import { ModeChip } from '@/components/ui/ModeChip';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusChip } from '@/components/ui/StatusChip';
import { TopBar } from '@/components/ui/TopBar';
import { ArrangedRoundsSkeleton, ArrangedRoundsView } from '@/components/games/ArrangedRoundsView';
import type { GameStatus } from '@/lib/games/status';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import { formatShortOsloDayMonthLocale } from '@/lib/i18n/format';
import { localizeGameName } from '@/lib/games/autoGameName';
import {
  adminLedgerScope,
  groupArrangedRounds,
  groupRosterByGame,
  onlyStandaloneGames,
  upcomingBlockIds,
  type ArrangedGame,
  type ArrangedRosterRow,
} from '@/lib/games/arrangedGames';
import { readCreatorStartBlock } from '@/lib/games/readCreatorStartBlock';
import type { AppLocale } from '@/i18n/routing';

// Status-kolonnen rommer StatusChip. Målt på staging, 360px (#2491): engelsk
// «IN PROGRESS» er lengst med 106,6px; «SCHEDULED» 96,8, «FINISHED» 79,
// «DRAFT» 59,7. Norsk: «AVSLUTTET» 95, «PLANLAGT» 86,7, «UTKAST» 69,9,
// «PÅGÅR» 59,7. 111px (107 + 4) gir det lengste merket plass på én linje,
// og 1fr-kolonnen har da 145px til navnet på 360px viewport (målt samme sted).
const GAMES_LEDGER_GRID = '1fr 111px 14px';

type SearchParams = Promise<{
  status?: string | string[];
  name?: string | string[];
  error?: string | string[];
}>;

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  // Epic #41 — modus per spill. Vises som chip ved siden av spillnavnet
  // slik at admin har et raskt overblikk over hvilket format hvert spill
  // kjører. Backfilled til 'best_ball' for pre-multi-mode-spill
  // (migrasjon 0030).
  game_mode: GameMode;
  // Variant-bevisst chip-navn (#282): 4BBB Stableford vises kun når team_size
  // kjennes, så mode_config må hentes med i listen.
  mode_config: GameModeConfig;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  scheduled_tee_off_at: string | null;
  courses: { name: string } | null;
};

/**
 * Which list the page shows (#2269). The default is «Rundene dine» grouped by
 * what happens next; the other three are the ledger, filtered on status alone:
 * drafts, the games in progress (where `ActionItemsStripe` sends its «n spill»
 * rows, cup matches included) and the Resultatprotokoll.
 */
type GamesView = 'default' | 'draft' | 'active' | 'finished';
type LedgerView = Exclude<GamesView, 'default'>;
const LEDGER_VIEWS: readonly string[] = ['draft', 'active', 'finished'] satisfies LedgerView[];

const LEDGER_SELECT =
  'id, name, status, game_mode, mode_config, created_at, started_at, ended_at, scheduled_tee_off_at, courses(name)';

/** The default view's rows: the grouping's columns plus the format, for `ModeChip`. */
type DefaultGameRow = ArrangedGame & { game_mode: GameMode; mode_config: GameModeConfig };

const DEFAULT_SELECT = `${LEDGER_SELECT}, require_peer_approval, registration_mode, signups_closed_at, group_id`;

const getAdminGamesContext = cache(async () => {
  const supabase = await getServerClient();
  return { supabase };
});

export default async function GamesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Self-gate for Fase 4 chunk 2 layout-loosening (#223). The Suspense
  // bodies below pull the request-scoped Supabase from `getAdminGamesContext`,
  // so we await the gate here at the page boundary.
  const { supabase } = await getAdminGamesContext();
  await requireAdmin(supabase);

  const t = await getTranslations('admin.games');
  const tNav = await getTranslations('admin.nav');
  const params = await searchParams;
  const statusFilter = first(params.status);
  const name = first(params.name) ?? '';
  const errorCode = first(params.error);
  const errorMessage = errorCode ? t(`errors.${errorCode}` as 'errors.not_found') : undefined;

  // Banner messages are keyed by the `status=` param emitted from form actions
  // (created/started). The same `status` param is also used as a filter when
  // it carries a game-status value (finished). Branch on the known message
  // keys to keep both behaviours from colliding.
  const STATUS_MESSAGE_KEYS = ['created', 'started', 'deleted'] as const;
  type StatusMessageKey = (typeof STATUS_MESSAGE_KEYS)[number];
  const isBannerStatus = statusFilter
    ? STATUS_MESSAGE_KEYS.includes(statusFilter as StatusMessageKey)
    : false;
  const statusMessage = isBannerStatus
    ? t(`statusMessages.${statusFilter as StatusMessageKey}`, { name })
    : undefined;
  // `draft` and `active` are not banner keys, so the two uses never collide.
  const view: GamesView =
    !isBannerStatus && statusFilter && LEDGER_VIEWS.includes(statusFilter)
      ? (statusFilter as LedgerView)
      : 'default';
  const heading = {
    default: t('headingOngoing'),
    draft: t('headingDrafts'),
    active: t('headingActive'),
    finished: t('headingProtocol'),
  }[view];
  // The protocol is an archive and «I gang nå» a work list from the stripe:
  // neither is a place to start a new game.
  const showCreate = view === 'default' || view === 'draft';

  return (
    <AdminShell>
      <TopBar
        backHref="/admin"
        kicker={tNav('klubbhus')}
        action={
          !showCreate ? null : (
            // Resultatprotokoll er et arkiv — å starte et nytt spill herfra
            // er en uvanlig flyt. `action={null}` rendrer en usynlig spacer
            // i TopBar, så kicker-en holder samme effektive sentrering som
            // på «Pågående og kommende»-visningen.
            <SmartLink
              href="/admin/games/new"
              className="tap-extend rounded-full border border-border bg-surface-2/50 px-2.5 py-[5px] font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-text [--tap-extend:-11px_0]"
            >
              {t('createLabel')}
            </SmartLink>
          )
        }
      />

      <BrassRibbon kicker={t('brassRibbon')} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {heading}
        </h1>
        <Suspense fallback={<SubtitleSkeleton />}>
          <Subtitle view={view} />
        </Suspense>
      </div>

      {(statusMessage || errorMessage) && (
        <div className="mt-4 space-y-2">
          {statusMessage && <Banner tone="success">{statusMessage}</Banner>}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      <Suspense fallback={view === 'default' ? <ArrangedRoundsSkeleton /> : <GamesLedgerSkeleton />}>
        {view === 'default' ? <DefaultRounds /> : <GamesLedger view={view} />}
      </Suspense>

      <p className="mt-6 text-center font-serif text-[11px] italic leading-relaxed text-muted">
        {t('tapHint')}
      </p>
    </AdminShell>
  );
}

/**
 * A ledger view: the games with that status, newest first, scoped by
 * `adminLedgerScope` (drafts and the protocol without cup matches and league
 * flights; «I gang nå» with them). Drafts and the protocol show the 40 newest.
 * «I gang nå» shows every active game: it is where `ActionItemsStripe` sends
 * its «n spill» rows, and the stripe counts every active game, so a capped
 * list could leave out the very game it counted. Cached per request, so the
 * subtitle and the list share one read.
 */
const fetchLedgerGames = cache(async (view: LedgerView) => {
  const { supabase } = await getAdminGamesContext();
  const query = adminLedgerScope(
    supabase.from('games').select(LEDGER_SELECT).eq('status', view),
    view,
  ).order('created_at', { ascending: false });
  const { data, error } = await (view === 'active' ? query : query.limit(40)).returns<GameRow[]>();
  if (error) throw error;
  return data ?? [];
});

/**
 * How many games a ledger view holds, counted rather than the 40 it lists, so
 * the subtitle says the same number as the link that opened it («Ferdige runder
 * · 89» → «89 signerte runder», #2269 O6).
 */
const countLedgerGames = cache(async (view: LedgerView) => {
  const { supabase } = await getAdminGamesContext();
  const { count, error } = await adminLedgerScope(
    supabase.from('games').select('id', { count: 'exact', head: true }).eq('status', view),
    view,
  );
  if (error) throw error;
  return count ?? 0;
});

/**
 * The default view: the 40 newest games in progress or scheduled, without cup
 * matches and league flights (#2489, they belong to the cup's and the league's
 * page). Drafts are counted on their own (`DefaultRounds`) and never listed
 * here, so they take no place among the 40. Finished runs live under
 * ?status=finished.
 */
const fetchDefaultGames = cache(async () => {
  const { supabase } = await getAdminGamesContext();
  const { data, error } = await onlyStandaloneGames(
    supabase
      .from('games')
      .select(DEFAULT_SELECT)
      .in('status', ['scheduled', 'active']),
  )
    .order('created_at', { ascending: false })
    .limit(40)
    .returns<DefaultGameRow[]>();
  if (error) throw error;
  return data ?? [];
});

async function Subtitle({ view }: { view: GamesView }) {
  const t = await getTranslations('admin.games');
  const n = view === 'default' ? (await fetchDefaultGames()).length : await countLedgerGames(view);
  const subtitle = {
    default: t('subtitleOngoing', { n }),
    draft: t('subtitleDrafts', { n }),
    active: t('subtitleActive', { n }),
    finished: t('subtitleFinished', { n }),
  }[view];
  return (
    <p className="font-sans text-[11.5px] tabular-nums text-muted">
      {subtitle}
    </p>
  );
}

function SubtitleSkeleton() {
  return <Skeleton className="h-3 w-40" />;
}

/**
 * The roster rows of the given games: the ledger counts players from them, the
 * default view counts deliveries and sign-ups (`groupArrangedRounds`). The
 * PostgREST builder has no group-by, so this reads one row per player. 40 games
 * with up to 150 players each can pass PostgREST's 1 000-row cap, so the read
 * is paged (#2227).
 */
async function readRosterRows(gameIds: string[]) {
  if (gameIds.length === 0) return { data: [] as ArrangedRosterRow[], error: null };
  const { supabase } = await getAdminGamesContext();
  return selectAllRowsResult(
    (from, to) =>
      supabase
        .from('game_players')
        .select('game_id, user_id, submitted_at, approved_at, withdrawn_at')
        .in('game_id', gameIds)
        .order('game_id')
        .order('user_id')
        .range(from, to)
        .returns<(ArrangedRosterRow & { user_id: string })[]>(),
    'admin games roster',
  );
}

/**
 * The default view (#2269): the same grouping as «Rundene dine», over every
 * organiser's standalone games. The drafts and finished counts are scoped like
 * the lists they open (`adminLedgerScope`: standalone only, owner's answer
 * 05.10), so a number and its list always agree.
 */
async function DefaultRounds() {
  const { supabase } = await getAdminGamesContext();
  const games = await fetchDefaultGames();
  const t = await getTranslations('admin.games');
  const locale = (await getLocale()) as AppLocale;
  const rosterIds = games
    .filter((g) => g.status === 'active' || g.status === 'scheduled')
    .map((g) => g.id);

  const [roster, drafts, finished, blocks] = await Promise.all([
    readRosterRows(rosterIds),
    // `count` plus up to two ids: one draft opens the wizard, more the list.
    adminLedgerScope(
      supabase.from('games').select('id', { count: 'exact' }).eq('status', 'draft'),
      'draft',
    )
      .order('created_at', { ascending: false })
      .limit(2),
    adminLedgerScope(
      supabase.from('games').select('id', { count: 'exact', head: true }).eq('status', 'finished'),
      'finished',
    ),
    // Service role (see `readCreatorStartBlock`); the page is admin-gated.
    Promise.all(
      upcomingBlockIds(games).map(async (id) => [id, await readCreatorStartBlock(id)] as const),
    ),
  ]);
  if (roster.error) throw roster.error;
  if (drafts.error) throw drafts.error;
  if (finished.error) throw finished.error;

  const draftCount = drafts.count ?? 0;
  const rounds = {
    ...groupArrangedRounds(games, groupRosterByGame(roster.data ?? []), {
      startBlocks: new Map(blocks),
    }),
    drafts: {
      count: draftCount,
      onlyId: draftCount === 1 ? (drafts.data?.[0]?.id ?? null) : null,
    },
    finished: { count: finished.count ?? 0 },
  };
  const nothingOngoing =
    rounds.live.length === 0 && rounds.upcoming.length === 0 && rounds.drafts.count === 0;

  return (
    <>
      {nothingOngoing && (
        <EmptyLedger
          heading={t('emptyOngoingHeading')}
          body={t('emptyOngoingBody', { createLabel: t('createLabel') })}
          icon="flag"
        />
      )}
      <ArrangedRoundsView rounds={rounds} isAdmin source="all" locale={locale} showMode />
    </>
  );
}

function EmptyLedger({
  heading,
  body,
  icon,
}: {
  heading: string;
  body: string | null;
  icon: 'flag' | 'laurel';
}) {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface px-5 py-12 flex flex-col items-center text-center">
      <ChampagneMedallion size={72} className="mb-5">
        {icon === 'laurel' ? (
          <Laurel height={40} className="text-primary dark:text-text" />
        ) : (
          <PinFlag size={36} className="text-primary dark:text-text" />
        )}
      </ChampagneMedallion>
      <p className="font-serif text-[16px] font-medium tracking-[-0.005em] text-text">
        {heading}
      </p>
      {body && (
        <p className="mt-1.5 max-w-[280px] font-sans text-[12.5px] leading-relaxed text-muted">
          {body}
        </p>
      )}
    </div>
  );
}

async function GamesLedger({ view }: { view: LedgerView }) {
  const games = await fetchLedgerGames(view);
  const gameIds = games.map((g) => g.id);
  const t = await getTranslations('admin.games');
  const tStatus = await getTranslations('gameStatus');
  const locale = await getLocale();
  const { data: rosterRows } = await readRosterRows(gameIds);
  const playerCounts = new Map<string, number>();
  for (const r of rosterRows ?? []) {
    playerCounts.set(r.game_id, (playerCounts.get(r.game_id) ?? 0) + 1);
  }

  if (games.length === 0) {
    const empty = {
      draft: { heading: t('emptyDraftsHeading'), body: null },
      active: { heading: t('emptyActiveHeading'), body: null },
      finished: { heading: t('emptyFinishedHeading'), body: t('emptyFinishedBody') },
    }[view];
    return (
      <EmptyLedger
        heading={empty.heading}
        body={empty.body}
        icon={view === 'finished' ? 'laurel' : 'flag'}
      />
    );
  }

  return (
    <>
      <LedgerHeader
        leftLabel={t('colGames')}
        rightLabel={t('colStatus')}
        gridTemplateColumns={GAMES_LEDGER_GRID}
      />

      {/* Ledger body. data-focus-inset: radene er full-bleed, så
          `overflow-hidden` klipper en outline med positiv offset helt bort
          (#1402). */}
      <div
        data-focus-inset
        className="overflow-hidden rounded-b-2xl border bg-surface"
        style={{
          borderColor: 'var(--border)',
          borderTop: 'none',
        }}
      >
        {games.map((g, i) => {
          const courseName = g.courses?.name ?? t('unknownCourse');
          const shortDate = (iso: string | null) =>
            iso ? formatShortOsloDayMonthLocale(iso, locale as AppLocale) : null;
          const dateLine =
            g.status === 'draft'
              ? tStatus('draft')
              : g.status === 'finished'
                ? shortDate(g.ended_at)
                : g.status === 'scheduled'
                  ? shortDate(g.scheduled_tee_off_at) ?? shortDate(g.created_at)
                  : shortDate(g.started_at) ?? shortDate(g.created_at);
          const players = playerCounts.get(g.id) ?? 0;
          const meta = [
            dateLine,
            players > 0 ? `${players}p` : null,
            courseName,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <SmartLink
              key={g.id}
              href={`/admin/games/${g.id}`}
              className="grid items-center gap-2.5 px-3.5 py-3.5"
              style={{
                gridTemplateColumns: GAMES_LEDGER_GRID,
                borderTop:
                  i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
              }}
            >
              <div className="min-w-0">
                <p className="truncate font-serif text-base font-medium tracking-[-0.005em] text-text">
                  {localizeGameName(g.name, g.courses?.name ?? null, locale as AppLocale)}
                </p>
                <p className="mt-0.5 truncate font-sans text-[11.5px] tabular-nums text-muted">
                  {meta}
                </p>
                {/* Modus-chip i egen rad UNDER meta — bevisst lavmælt
                    plassering så listen scanner som «navn, hva, hvem».
                    Inline-flex sikrer at chip-en ikke streches over hele
                    raden hvis spillnavnet er langt. */}
                <div className="mt-1 inline-flex">
                  <ModeChip mode={g.game_mode} modeConfig={g.mode_config} />
                </div>
              </div>
              <div className="text-right">
                <StatusChip status={g.status} />
              </div>
              <span aria-hidden className="text-[14px] text-muted">
                ›
              </span>
            </SmartLink>
          );
        })}
      </div>
    </>
  );
}

function GamesLedgerSkeleton() {
  const t = useTranslations('admin.games');
  return (
    <>
      <LedgerHeader
        leftLabel={t('colGames')}
        rightLabel={t('colStatus')}
        gridTemplateColumns={GAMES_LEDGER_GRID}
      />
      <div
        className="overflow-hidden rounded-b-2xl border bg-surface"
        style={{ borderColor: 'var(--border)', borderTop: 'none' }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="grid items-center gap-2.5 px-3.5 py-3.5"
            style={{
              gridTemplateColumns: GAMES_LEDGER_GRID,
              borderTop:
                i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
            }}
          >
            <div className="min-w-0">
              <Skeleton className="h-4 w-3/5" delay={i * 90} />
              <Skeleton className="mt-1 h-3 w-2/5" delay={i * 90 + 30} />
            </div>
            <Skeleton className="ml-auto h-5 w-24 rounded-full" delay={i * 90 + 60} />
            <span aria-hidden className="text-[14px] text-muted">
              ›
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
