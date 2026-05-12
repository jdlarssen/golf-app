import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { BackLink } from '@/components/ui/BackLink';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';

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

type GameStatus = 'draft' | 'scheduled' | 'active' | 'finished';

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

  const supabase = await getServerClient();
  let q = supabase
    .from('games')
    .select(
      'id, name, status, created_at, started_at, ended_at, scheduled_tee_off_at, courses(name)',
    )
    .order('created_at', { ascending: false })
    .limit(40);

  if (!isBannerStatus && statusFilter === 'finished') {
    q = q.eq('status', 'finished');
  }

  const { data: games, error } = await q.returns<GameRow[]>();
  if (error) throw error;

  const gameIds = (games ?? []).map((g) => g.id);

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

  const visible = games ?? [];
  const heading =
    statusFilter === 'finished' ? 'Resultatprotokoll' : 'Pågående og kommende';
  const subtitle =
    statusFilter === 'finished'
      ? `${visible.length} signerte runder`
      : `${visible.length} spill · sortert kronologisk`;

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
        <p className="font-sans text-[11.5px] tabular-nums text-muted">
          {subtitle}
        </p>
      </div>

      {(statusMessage || errorMessage) && (
        <div className="mt-4 space-y-2">
          {statusMessage && <Banner tone="success">{statusMessage}</Banner>}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-surface px-5 py-8 text-center text-sm text-muted">
          {statusFilter === 'finished'
            ? 'Ingen signerte runder ennå.'
            : 'Ingen spill ennå. Trykk «+ Nytt» for å opprette det første.'}
        </div>
      ) : (
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
            {visible.map((g, i) => {
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
      )}

      <p className="mt-6 text-center font-serif text-[11px] italic leading-relaxed text-muted">
        Tap et spill for å redigere protokollen.
      </p>
    </AdminShell>
  );
}
