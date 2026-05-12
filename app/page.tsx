import { Suspense, cache } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { BrandMark } from '@/components/ui/BrandMark';
import { ChampagneMedallion } from '@/components/ui/ChampagneMedallion';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { Skeleton } from '@/components/ui/Skeleton';
import { PinFlag } from '@/components/icons/PinFlag';
import { firstName } from '@/lib/firstName';

type SearchParams = Promise<{ profile?: string | string[] }>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

// Request-scoped Supabase client + verified user id. The user id is forwarded
// by proxy.ts (which already called auth.getUser to refresh the session) so
// we don't pay another Supabase Auth round-trip per page render.
const getHomeContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId } = await getHomeContext();
  if (!userId) {
    redirect('/login');
  }

  const params = await searchParams;
  const profileUpdated = first(params.profile) === 'updated';

  return (
    <AppShell>
      <BrandMark className="mb-6" />

      {profileUpdated && (
        <div className="mb-4">
          <Banner tone="success">✓ Profilen din er oppdatert.</Banner>
        </div>
      )}

      <Suspense fallback={<HomeBodySkeleton />}>
        <HomeBody />
      </Suspense>
    </AppShell>
  );
}

// ─── Body ────────────────────────────────────────────────────────────────

async function HomeBody() {
  const { supabase, userId } = await getHomeContext();

  type GameRow = {
    game_id: string;
    team_number: number;
    flight_number: number;
    games: {
      id: string;
      name: string;
      status: 'draft' | 'scheduled' | 'active' | 'finished';
      ended_at: string | null;
      courses: { name: string } | null;
    } | null;
  };

  // Parallel-fetch profile, active games, finished games — they don't depend
  // on each other and roughly triple-tripled the latency when run serially.
  const [profileRes, rawActiveRes, rawFinishedRes] = await Promise.all([
    supabase
      .from('users')
      .select('name, is_admin')
      .eq('id', userId!)
      .single(),
    supabase
      .from('game_players')
      .select(
        'game_id, team_number, flight_number, games!inner(id, name, status, ended_at, courses(name))',
      )
      .eq('user_id', userId!)
      .in('games.status', ['draft', 'scheduled', 'active'])
      .returns<GameRow[]>(),
    supabase
      .from('game_players')
      .select(
        'game_id, team_number, games!inner(id, name, status, ended_at, courses(name))',
      )
      .eq('user_id', userId!)
      .eq('games.status', 'finished')
      .order('ended_at', { foreignTable: 'games', ascending: false })
      .returns<GameRow[]>(),
  ]);

  const { data: profile, error: profileError } = profileRes;

  // PGRST116 = "Cannot coerce the result to a single JSON object" → no row
  // for this auth user yet. Send them to the profile-completion flow.
  if (profileError && profileError.code === 'PGRST116') {
    redirect('/complete-profile');
  }
  if (profileError) {
    throw profileError;
  }

  const activeGames = (rawActiveRes.data ?? [])
    .filter((row): row is GameRow & { games: NonNullable<GameRow['games']> } =>
      row.games != null,
    )
    .map((row) => ({
      ...row.games,
      teamNumber: row.team_number,
      flightNumber: row.flight_number,
    }));

  const finishedGames = (rawFinishedRes.data ?? [])
    .filter((row): row is GameRow & { games: NonNullable<GameRow['games']> } =>
      row.games != null,
    )
    .map((row) => ({
      ...row.games,
      teamNumber: row.team_number,
      flightNumber: row.flight_number,
    }));

  const STATUS_LABELS = {
    draft: 'Utkast',
    scheduled: 'Planlagt',
    active: 'Pågående',
    finished: 'Avsluttet',
  } as const;

  const isEmptyState =
    activeGames.length === 0 && finishedGames.length === 0;
  const firstNameValue = firstName(profile?.name) ?? 'spiller';

  if (isEmptyState) {
    return (
      <>
        <section className="flex flex-col items-center text-center">
          <ChampagneMedallion className="mb-7">
            <PinFlag size={72} className="text-primary dark:text-text" />
          </ChampagneMedallion>
          <Kicker tone="accent" className="mb-2.5">
            KLUBBHUSET ER ÅPENT
          </Kicker>
          <h1 className="font-serif text-[30px] font-medium tracking-[-0.02em] leading-tight text-text">
            Velkommen, {firstNameValue}.
          </h1>
          <p className="mt-3 font-sans text-sm leading-relaxed text-muted max-w-[280px]">
            {profile?.is_admin
              ? 'Ingen turneringer enda. Sett opp første runde og kom i gang.'
              : 'Du er klar. Admin setter opp neste runde.'}
          </p>
          {profile?.is_admin && (
            <div className="mt-8 w-full max-w-[280px]">
              <LinkButton href="/admin/games/new" full>
                Opprett en turnering
              </LinkButton>
            </div>
          )}
          <PullQuote className="mt-8">
            En god runde begynner med god planlegging.
          </PullQuote>
        </section>

        <footer className="mt-14 pt-6 border-t border-border/60 dark:border-border/80">
          <ul className="flex flex-col gap-1 items-center">
            <li>
              <SmartLink
                href="/profile"
                className="inline-flex items-center min-h-[44px] px-3 text-sm text-muted hover:text-text transition-colors"
              >
                Min profil
              </SmartLink>
            </li>
            {profile?.is_admin && (
              <li>
                <SmartLink
                  href="/admin"
                  className="inline-flex items-center min-h-[44px] px-3 text-sm text-muted hover:text-text transition-colors"
                >
                  Sekretariatet
                </SmartLink>
              </li>
            )}
            <li>
              <form action="/logout" method="post">
                <button
                  type="submit"
                  className="inline-flex items-center min-h-[44px] px-3 text-sm text-muted hover:text-danger transition-colors"
                >
                  Logg ut
                </button>
              </form>
            </li>
          </ul>
        </footer>
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Hei, ${profile?.name ?? 'spiller'} 👋`} />

      <nav className="space-y-6">
        {activeGames.length > 0 && (
          <Section label="Mine spill">
            {activeGames.map((g) => (
              <SmartLink key={g.id} href={`/games/${g.id}`} className="block">
                <Card className="min-h-[44px] hover:border-primary/30 transition-colors p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="block font-serif text-lg font-medium tracking-tight text-text truncate">
                        {g.name}
                      </span>
                      <span className="block text-xs text-muted mt-1 truncate">
                        {[
                          g.courses?.name,
                          `Lag ${g.teamNumber} · Flight ${g.flightNumber}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusPill
                        status={g.status}
                        label={STATUS_LABELS[g.status]}
                      />
                      <span aria-hidden className="text-muted">
                        →
                      </span>
                    </div>
                  </div>
                </Card>
              </SmartLink>
            ))}
          </Section>
        )}

        {finishedGames.length > 0 && (
          <Section label="Avsluttede spill">
            {finishedGames.map((g) => (
              <SmartLink
                key={g.id}
                href={`/games/${g.id}/leaderboard`}
                className="block"
              >
                <Card className="min-h-[44px] hover:border-primary/30 transition-colors p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="block font-serif text-lg font-medium tracking-tight text-text truncate">
                        {g.name}
                      </span>
                      <span className="block text-xs text-muted mt-1 truncate">
                        {[g.courses?.name, 'Leaderboard']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <span aria-hidden className="text-accent shrink-0">
                      🏆
                    </span>
                  </div>
                </Card>
              </SmartLink>
            ))}
          </Section>
        )}

        <Section label="Profil">
          <SmartLink href="/profile" className="block">
            <Card className="min-h-[44px] flex items-center justify-between hover:bg-primary-soft transition-colors p-5">
              <span className="text-base font-medium text-text">
                Min profil
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
            </Card>
          </SmartLink>
        </Section>

        {profile?.is_admin && (
          <Section label="Admin" accent>
            <SmartLink href="/admin" className="block">
              <Card className="min-h-[44px] flex items-center justify-between hover:bg-primary-soft transition-colors p-5">
                <span className="text-base font-medium text-text">
                  Sekretariatet
                </span>
                <span aria-hidden className="text-muted">
                  →
                </span>
              </Card>
            </SmartLink>
          </Section>
        )}

        <form action="/logout" method="post" className="pt-2">
          <button
            type="submit"
            className="w-full min-h-[44px] text-sm font-medium tracking-tight text-danger hover:bg-danger/[0.08] rounded-full px-4 py-2.5 transition-colors"
          >
            Logg ut
          </button>
        </form>
      </nav>

      <p className="mt-10 text-xs text-muted text-center">
        Mer kommer her snart.
      </p>
    </>
  );
}

// ─── Body skeleton ───────────────────────────────────────────────────────

function HomeBodySkeleton() {
  return (
    <>
      <div className="mb-6">
        <Skeleton className="h-9 w-3/5" />
      </div>

      <nav className="space-y-6">
        <SectionSkeleton labelWidth={80} cardCount={1} delay={0} />
        <SectionSkeleton labelWidth={140} cardCount={1} delay={120} />
        <SectionSkeleton labelWidth={60} cardCount={1} delay={240} />
      </nav>
    </>
  );
}

function SectionSkeleton({
  labelWidth,
  cardCount,
  delay,
}: {
  labelWidth: number;
  cardCount: number;
  delay: number;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Skeleton
          className="h-2.5"
          style={{ width: labelWidth }}
          delay={delay}
        />
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: cardCount }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-[72px] rounded-2xl"
            delay={delay + 30 + i * 30}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function Section({
  label,
  accent = false,
  children,
}: {
  label: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p
          className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
            accent ? 'text-accent' : 'text-muted'
          }`}
        >
          {label}
        </p>
        <div
          className={`h-px flex-1 ${accent ? 'bg-accent/30' : 'bg-border'}`}
        />
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function StatusPill({
  status,
  label,
}: {
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  label: string;
}) {
  const classes =
    status === 'active'
      ? 'bg-primary-soft text-primary border-primary/20'
      : status === 'scheduled'
        ? 'bg-accent/10 text-accent border-accent/30'
        : status === 'draft'
          ? 'bg-warning/10 text-warning border-warning/30'
          : 'bg-border/40 text-muted border-border';
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium uppercase tracking-widest px-2 py-0.5 rounded-full border ${classes}`}
    >
      {label}
    </span>
  );
}
