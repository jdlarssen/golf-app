import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { BrandMark } from '@/components/ui/BrandMark';
import { ChampagneMedallion } from '@/components/ui/ChampagneMedallion';
import { Kicker } from '@/components/ui/Kicker';
import { PullQuote } from '@/components/ui/PullQuote';
import { PinFlag } from '@/components/icons/PinFlag';
import { firstName } from '@/lib/firstName';

type SearchParams = Promise<{ profile?: string | string[] }>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('name, is_admin')
    .eq('id', user.id)
    .single();

  // PGRST116 = "Cannot coerce the result to a single JSON object" → no row
  // for this auth user yet. Send them to the profile-completion flow.
  if (profileError && profileError.code === 'PGRST116') {
    redirect('/complete-profile');
  }

  // Any other error: surface it. We don't want to silently render "spiller"
  // and mask a real DB / RLS problem.
  if (profileError) {
    throw profileError;
  }

  const params = await searchParams;
  const profileUpdated = first(params.profile) === 'updated';

  // Games the user participates in that are draft or active. Pull in the
  // course name plus the player's own team/flight so each card carries some
  // weight beyond just the game name.
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
  const { data: rawActive } = await supabase
    .from('game_players')
    .select(
      'game_id, team_number, flight_number, games!inner(id, name, status, ended_at, courses(name))',
    )
    .eq('user_id', user.id)
    .in('games.status', ['draft', 'scheduled', 'active'])
    .returns<GameRow[]>();
  const activeGames = (rawActive ?? [])
    .filter((row): row is GameRow & { games: NonNullable<GameRow['games']> } =>
      row.games != null,
    )
    .map((row) => ({
      ...row.games,
      teamNumber: row.team_number,
      flightNumber: row.flight_number,
    }));

  // Finished games the user participated in, newest first.
  const { data: rawFinished } = await supabase
    .from('game_players')
    .select(
      'game_id, team_number, games!inner(id, name, status, ended_at, courses(name))',
    )
    .eq('user_id', user.id)
    .eq('games.status', 'finished')
    .order('ended_at', { foreignTable: 'games', ascending: false })
    .returns<GameRow[]>();
  const finishedGames = (rawFinished ?? [])
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

  return (
    <AppShell>
      <BrandMark className="mb-6" />

      {profileUpdated && (
        <div className="mb-4">
          <Banner tone="success">✓ Profilen din er oppdatert.</Banner>
        </div>
      )}

      {isEmptyState && (
        <section className="flex flex-col items-center text-center">
          <ChampagneMedallion className="mb-7">
            {/* Dark mode: sage primary on dark-forest medallion was only ~3.2:1
                contrast on the 2px pole. Switch to cream `text-text` so the
                pole reads as an etched silhouette while the champagne flag
                head (hardcoded #C9A961) remains the visual focal point. */}
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
      )}

      {!isEmptyState && (
        <PageHeader title={`Hei, ${profile?.name ?? 'spiller'} 👋`} />
      )}

      {isEmptyState ? (
        // Dark mode: `border-border/60` (#2d3f32 at 60% alpha) on the very
        // dark bg #0f1612 sits at ~1.34:1 — risks disappearing entirely. Bump
        // to /80 in dark mode for a visible-but-quiet hairline.
        <footer className="mt-14 pt-6 border-t border-border/60 dark:border-border/80">
          <ul className="flex flex-col gap-1 items-center">
            <li>
              <Link
                href="/profile"
                className="inline-flex items-center min-h-[44px] px-3 text-sm text-muted hover:text-text transition-colors"
              >
                Min profil
              </Link>
            </li>
            {profile?.is_admin && (
              <li>
                <Link
                  href="/admin"
                  className="inline-flex items-center min-h-[44px] px-3 text-sm text-muted hover:text-text transition-colors"
                >
                  Sekretariatet
                </Link>
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
      ) : (
        <nav className="space-y-6">
          {activeGames.length > 0 && (
            <Section label="Mine spill">
              {activeGames.map((g) => (
                <Link key={g.id} href={`/games/${g.id}`} className="block">
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
                        <StatusPill status={g.status} label={STATUS_LABELS[g.status]} />
                        <span aria-hidden className="text-muted">
                          →
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </Section>
          )}

          {finishedGames.length > 0 && (
            <Section label="Avsluttede spill">
              {finishedGames.map((g) => (
                <Link
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
                </Link>
              ))}
            </Section>
          )}

          <Section label="Profil">
            <Link href="/profile" className="block">
              <Card className="min-h-[44px] flex items-center justify-between hover:bg-primary-soft transition-colors p-5">
                <span className="text-base font-medium text-text">Min profil</span>
                <span aria-hidden className="text-muted">
                  →
                </span>
              </Card>
            </Link>
          </Section>

          {profile?.is_admin && (
            <Section label="Admin" accent>
              <Link href="/admin" className="block">
                <Card className="min-h-[44px] flex items-center justify-between hover:bg-primary-soft transition-colors p-5">
                  <span className="text-base font-medium text-text">
                    Sekretariatet
                  </span>
                  <span aria-hidden className="text-muted">
                    →
                  </span>
                </Card>
              </Link>
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
      )}

      {!isEmptyState && (
        <p className="mt-10 text-xs text-muted text-center">
          Mer kommer her snart.
        </p>
      )}
    </AppShell>
  );
}

/**
 * Section divider used to group cards on the home page. Optional `accent`
 * variant renders the label in champagne — used to set admin apart from the
 * player-facing surfaces above.
 */
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

/** Compact status pill rendered next to the game name on active cards. */
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
