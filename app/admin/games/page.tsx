import Link from 'next/link';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';

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

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('no-NO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type GameStatus = 'draft' | 'scheduled' | 'active' | 'finished';

const STATUS_LABELS: Record<GameStatus, string> = {
  draft: 'Utkast',
  scheduled: 'Planlagt',
  active: 'Pågående',
  finished: 'Avsluttet',
};

const STATUS_BADGE_CLASSES: Record<GameStatus, string> = {
  draft:
    'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700',
  scheduled:
    'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900',
  active:
    'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300 border border-green-200 dark:border-green-900',
  finished:
    'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900',
};

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  created_at: string;
  courses: { name: string } | null;
};

export default async function GamesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const status = first(params.status);
  const name = first(params.name) ?? '';
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const supabase = await getServerClient();
  const { data: games, error } = await supabase
    .from('games')
    .select('id, name, status, created_at, courses(name)')
    .order('created_at', { ascending: false })
    .limit(20)
    .returns<GameRow[]>();

  if (error) {
    throw error;
  }

  const statusFn = status ? STATUS_MESSAGES[status] : undefined;
  const statusMessage = statusFn ? statusFn(name) : undefined;

  return (
    <AppShell>
      <PageHeader
        title="Spill"
        subtitle="Administrer pågående og avsluttede spill"
        action={
          <BackLink href="/">Tilbake</BackLink>
        }
      />

      {statusMessage && (
        <div className="mb-4">
          <Banner tone="success">{statusMessage}</Banner>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="mb-4">
        <Link
          href="/admin/games/new"
          className="block w-full text-center bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          + Nytt spill
        </Link>
      </div>

      <Card>
        {games && games.length > 0 ? (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {games.map((game) => {
              const courseName = game.courses?.name ?? '(ukjent bane)';
              return (
                <li key={game.id} className="py-3">
                  <Link
                    href={`/admin/games/${game.id}`}
                    className="block hover:bg-zinc-50 dark:hover:bg-zinc-800 -mx-2 px-2 py-1 rounded transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {game.name}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {courseName}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Opprettet {formatDate(game.created_at)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[game.status]}`}
                      >
                        {STATUS_LABELS[game.status]}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">
            Ingen spill ennå. Opprett ditt første spill når dere er klare for runde.
          </p>
        )}
      </Card>
    </AppShell>
  );
}
