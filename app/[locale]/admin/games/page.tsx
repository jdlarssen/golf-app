import { first } from '@/lib/url/searchParams';
import { Suspense, cache } from 'react';
import { getTranslations, getLocale } from 'next-intl/server';
import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { ChampagneMedallion } from '@/components/ui/ChampagneMedallion';
import { LedgerHeader } from '@/components/admin/LedgerHeader';
import { PinFlag, Laurel } from '@/components/icons';
import { ModeChip } from '@/components/ui/ModeChip';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import { TopBar } from '@/components/ui/TopBar';
import type { GameStatus } from '@/lib/games/status';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import { formatShortDateLocale } from '@/lib/i18n/format';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';

const GAMES_LEDGER_GRID = '1fr 84px 14px';

type SearchParams = Promise<{
  status?: string | string[];
  name?: string | string[];
  error?: string | string[];
}>;

const STATUS_TO_TONE: Record<GameStatus, StatusChipTone> = {
  draft: 'utkast',
  scheduled: 'påmelding',
  active: 'aktiv',
  finished: 'signert',
};

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
  const filterFinished = !isBannerStatus && statusFilter === 'finished';
  const heading = filterFinished ? t('headingProtocol') : t('headingOngoing');

  return (
    <AdminShell>
      <TopBar
        backHref="/admin"
        kicker={tNav('klubbhus')}
        action={
          filterFinished ? null : (
            // Resultatprotokoll er et arkiv — å starte et nytt spill herfra
            // er en uvanlig flyt. `action={null}` rendrer en usynlig spacer
            // i TopBar, så kicker-en holder samme effektive sentrering som
            // på «Pågående og kommende»-visningen.
            <SmartLink
              href="/admin/games/new"
              className="rounded-full border border-border bg-surface-2/50 px-2.5 py-[5px] font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-text"
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
          <Subtitle filterFinished={filterFinished} />
        </Suspense>
      </div>

      {(statusMessage || errorMessage) && (
        <div className="mt-4 space-y-2">
          {statusMessage && <Banner tone="success">{statusMessage}</Banner>}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      <Suspense fallback={<GamesLedgerSkeleton />}>
        <GamesLedger filterFinished={filterFinished} />
      </Suspense>

      <p className="mt-6 text-center font-serif text-[11px] italic leading-relaxed text-muted">
        {t('tapHint')}
      </p>
    </AdminShell>
  );
}

async function fetchGames(filterFinished: boolean) {
  const { supabase } = await getAdminGamesContext();
  let q = supabase
    .from('games')
    .select(
      'id, name, status, game_mode, mode_config, created_at, started_at, ended_at, scheduled_tee_off_at, courses(name)',
    )
    .order('created_at', { ascending: false })
    .limit(40);

  if (filterFinished) {
    q = q.eq('status', 'finished');
  } else {
    // Default "Pågående og kommende" view should NOT include signed/finished
    // runs — those live under ?status=finished.
    q = q.in('status', ['draft', 'scheduled', 'active']);
  }

  const { data, error } = await q.returns<GameRow[]>();
  if (error) throw error;
  return data ?? [];
}

async function Subtitle({ filterFinished }: { filterFinished: boolean }) {
  const games = await fetchGames(filterFinished);
  const n = games.length;
  const t = await getTranslations('admin.games');
  const subtitle = filterFinished
    ? t('subtitleFinished', { n })
    : t('subtitleOngoing', { n });
  return (
    <p className="font-sans text-[11.5px] tabular-nums text-muted">
      {subtitle}
    </p>
  );
}

function SubtitleSkeleton() {
  return <Skeleton className="h-3 w-40" />;
}

async function GamesLedger({ filterFinished }: { filterFinished: boolean }) {
  const { supabase } = await getAdminGamesContext();
  const games = await fetchGames(filterFinished);
  const gameIds = games.map((g) => g.id);
  const t = await getTranslations('admin.games');
  const locale = await getLocale();

  // Player counts per game in one round-trip. group-by not supported in the
  // PostgREST builder; fetch raw game_id rows and count in TS — bounded
  // since we cap at 40 games.
  type GP = { game_id: string };
  const { data: gpRows } = await supabase
    .from('game_players')
    .select('game_id')
    .in('game_id', gameIds.length > 0 ? gameIds : ['00000000-0000-0000-0000-000000000000'])
    .returns<GP[]>();
  const playerCounts = new Map<string, number>();
  for (const r of gpRows ?? []) {
    playerCounts.set(r.game_id, (playerCounts.get(r.game_id) ?? 0) + 1);
  }

  if (games.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-border bg-surface px-5 py-12 flex flex-col items-center text-center">
        <ChampagneMedallion size={72} className="mb-5">
          {filterFinished ? (
            <Laurel height={40} className="text-primary dark:text-text" />
          ) : (
            <PinFlag size={36} className="text-primary dark:text-text" />
          )}
        </ChampagneMedallion>
        <p className="font-serif text-[16px] font-medium tracking-[-0.005em] text-text">
          {filterFinished
            ? t('emptyFinishedHeading')
            : t('emptyOngoingHeading')}
        </p>
        <p className="mt-1.5 max-w-[280px] font-sans text-[12.5px] leading-relaxed text-muted">
          {filterFinished
            ? t('emptyFinishedBody')
            : t('emptyOngoingBody', { createLabel: t('createLabel') })}
        </p>
      </div>
    );
  }

  return (
    <>
      <LedgerHeader
        leftLabel={t('colGames')}
        rightLabel={t('colStatus')}
        gridTemplateColumns={GAMES_LEDGER_GRID}
      />

      {/* Ledger body */}
      <div
        className="overflow-hidden rounded-b-2xl border bg-surface"
        style={{
          borderColor: 'var(--border)',
          borderTop: 'none',
        }}
      >
        {games.map((g, i) => {
          const courseName = g.courses?.name ?? t('unknownCourse');
          const shortDate = (iso: string | null) =>
            iso ? formatShortDateLocale(iso, locale as AppLocale) : null;
          const dateLine =
            g.status === 'draft'
              ? t('draftWord')
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
          // Cap stagger at row 8 so long ledgers (up to 40 rows) don't drag
          // the final reveal out past ~half a second — matches the leaderboard
          // `.lb-row` pattern in globals.css.
          const staggerStep = Math.min(i, 8);
          return (
            <SmartLink
              key={g.id}
              href={`/admin/games/${g.id}`}
              className="reveal-up grid items-center gap-2.5 px-3.5 py-3.5"
              style={{
                gridTemplateColumns: GAMES_LEDGER_GRID,
                animationDelay: `${60 + staggerStep * 60}ms`,
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
                <StatusChip tone={STATUS_TO_TONE[g.status]} />
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
  return (
    <>
      <LedgerHeader
        leftLabel="Spill"
        rightLabel="Status"
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
            <Skeleton className="ml-auto h-5 w-20 rounded-full" delay={i * 90 + 60} />
            <span aria-hidden className="text-[14px] text-muted">
              ›
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
