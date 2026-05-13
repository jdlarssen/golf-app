import { Suspense, cache } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { BackLink } from '@/components/ui/BackLink';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import type { GameStatus } from '@/lib/games/status';

type SearchParams = Promise<{
  status?: string | string[];
  name?: string | string[];
  error?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  not_found: 'Spillet ble ikke funnet.',
};

const STATUS_MESSAGES: Record<string, (name: string) => string> = {
  created: (name) => `✓ Spillet «${name}» ble lagret som utkast.`,
  started: (name) => `✓ Spillet «${name}» er startet.`,
  deleted: (name) => `✓ Spillet «${name}» er slettet.`,
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const MONTHS_NB = [
  'jan',
  'feb',
  'mar',
  'apr',
  'mai',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'des',
];

function shortNb(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return `${d.getDate()}. ${MONTHS_NB[d.getMonth()]}`;
  } catch {
    return null;
  }
}

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
  const params = await searchParams;
  const statusFilter = first(params.status);
  const name = first(params.name) ?? '';
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  // Banner messages are keyed by the `status=` param emitted from form actions
  // (created/started). The same `status` param is also used as a filter when
  // it carries a game-status value (finished). Branch on the known message
  // keys to keep both behaviours from colliding.
  const isBannerStatus = statusFilter
    ? Object.prototype.hasOwnProperty.call(STATUS_MESSAGES, statusFilter)
    : false;
  const statusFn = isBannerStatus
    ? STATUS_MESSAGES[statusFilter as keyof typeof STATUS_MESSAGES]
    : undefined;
  const statusMessage = statusFn ? statusFn(name) : undefined;
  const filterFinished = !isBannerStatus && statusFilter === 'finished';
  const heading = filterFinished ? 'Resultatprotokoll' : 'Pågående og kommende';

  return (
    <AdminShell>
      <div className="-mt-3 mb-2 flex items-center justify-between">
        <BackLink href="/admin">Tilbake</BackLink>
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Sekretariatet
        </p>
        <SmartLink
          href="/admin/games/new"
          className="rounded-full border border-border bg-[rgba(229,224,211,0.5)] px-2.5 py-[5px] font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-text"
        >
          + Nytt
        </SmartLink>
      </div>

      <BrassRibbon kicker="Spill · protokoll" />

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
        Tap et spill for å redigere protokollen.
      </p>
    </AdminShell>
  );
}

async function fetchGames(filterFinished: boolean) {
  const { supabase } = await getAdminGamesContext();
  let q = supabase
    .from('games')
    .select(
      'id, name, status, created_at, started_at, ended_at, scheduled_tee_off_at, courses(name)',
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
  const subtitle = filterFinished
    ? `${games.length} signerte runder`
    : `${games.length} spill · sortert kronologisk`;
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
      <div className="mt-6 rounded-2xl border border-border bg-surface px-5 py-8 text-center text-sm text-muted">
        {filterFinished
          ? 'Ingen signerte runder ennå.'
          : 'Ingen spill ennå. Trykk «+ Nytt» for å opprette det første.'}
      </div>
    );
  }

  return (
    <>
      {/* Ledger header — forest strip with champagne kickers */}
      <div
        className="mt-4 grid items-center gap-2.5 rounded-t-[12px] px-3.5 py-2"
        style={{
          gridTemplateColumns: '1fr 84px 14px',
          background: 'var(--primary)',
          color: 'var(--bg)',
        }}
      >
        <span className="font-sans text-[9.5px] font-semibold uppercase text-accent" style={{ letterSpacing: '0.18em' }}>
          Spill
        </span>
        <span
          className="text-right font-sans text-[9.5px] font-semibold uppercase text-accent"
          style={{ letterSpacing: '0.18em' }}
        >
          Status
        </span>
        <span />
      </div>

      {/* Ledger body */}
      <div
        className="overflow-hidden rounded-b-2xl border bg-surface"
        style={{
          borderColor: 'var(--border)',
          borderTop: 'none',
        }}
      >
        {games.map((g, i) => {
          const courseName = g.courses?.name ?? '(ukjent bane)';
          const dateLine =
            g.status === 'draft'
              ? 'Utkast'
              : g.status === 'finished'
                ? shortNb(g.ended_at)
                : g.status === 'scheduled'
                  ? shortNb(g.scheduled_tee_off_at) ?? shortNb(g.created_at)
                  : shortNb(g.started_at) ?? shortNb(g.created_at);
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
              className="reveal-up grid items-center gap-2.5 px-3.5 py-3.5"
              style={{
                gridTemplateColumns: '1fr 84px 14px',
                animationDelay: `${60 + i * 60}ms`,
                borderTop:
                  i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
              }}
            >
              <div className="min-w-0">
                <p className="truncate font-serif text-base font-medium tracking-[-0.005em] text-text">
                  {g.name}
                </p>
                <p className="mt-0.5 truncate font-sans text-[11.5px] tabular-nums text-muted">
                  {meta}
                </p>
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
      <div
        className="mt-4 grid items-center gap-2.5 rounded-t-[12px] px-3.5 py-2"
        style={{
          gridTemplateColumns: '1fr 84px 14px',
          background: 'var(--primary)',
          color: 'var(--bg)',
        }}
      >
        <span className="font-sans text-[9.5px] font-semibold uppercase text-accent" style={{ letterSpacing: '0.18em' }}>
          Spill
        </span>
        <span
          className="text-right font-sans text-[9.5px] font-semibold uppercase text-accent"
          style={{ letterSpacing: '0.18em' }}
        >
          Status
        </span>
        <span />
      </div>
      <div
        className="overflow-hidden rounded-b-2xl border bg-surface"
        style={{ borderColor: 'var(--border)', borderTop: 'none' }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="grid items-center gap-2.5 px-3.5 py-3.5"
            style={{
              gridTemplateColumns: '1fr 84px 14px',
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
