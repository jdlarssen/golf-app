import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { BackLink } from '@/components/ui/BackLink';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Button } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import type { GameStatus } from '@/lib/games/status';
import { deleteGame } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

const ERROR_MESSAGES: Record<string, string> = {
  delete_failed: 'Slettingen feilet. Prøv igjen, eller sjekk Vercel-loggene.',
};

const STATUS_WARNINGS: Record<GameStatus, string | null> = {
  draft: null, // utkast — ingen er informert ennå, ingen warning nødvendig
  scheduled:
    'Spillet er planlagt og spillerne er invitert. De får ingen melding om at det er kansellert — du må evt. si fra selv.',
  active:
    'Spillet pågår nå. Sletting fjerner alle slag som er registrert så langt — spillerne mister sin runde uten varsel.',
  finished:
    'Spillet er avsluttet. Leaderboard og resultater forsvinner permanent. Spillere som har bokmerket lenken vil få 404.',
};

const MONTHS_NB = [
  'jan', 'feb', 'mar', 'apr', 'mai', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'des',
];

function shortNb(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return `${d.getDate()}. ${MONTHS_NB[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return null;
  }
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  scheduled_tee_off_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  courses: { name: string } | null;
};

export default async function DeleteGamePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const errorCode = first(sp.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const supabase = await getServerClient();

  const { data: game } = await supabase
    .from('games')
    .select('id, name, status, scheduled_tee_off_at, started_at, ended_at, created_at, courses(name)')
    .eq('id', id)
    .maybeSingle<GameRow>();

  if (!game) notFound();

  // Count child rows so the confirmation copy is accurate.
  const [gpRes, scoresRes, invRes] = await Promise.all([
    supabase
      .from('game_players')
      .select('user_id', { count: 'exact', head: true })
      .eq('game_id', id),
    supabase
      .from('scores')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', id),
    supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', id),
  ]);

  const playerCount = gpRes.count ?? 0;
  const scoreCount = scoresRes.count ?? 0;
  const invitationCount = invRes.count ?? 0;

  // Best available date line for the summary.
  const dateLine =
    shortNb(game.ended_at) ??
    shortNb(game.started_at) ??
    shortNb(game.scheduled_tee_off_at) ??
    shortNb(game.created_at);

  const warning = STATUS_WARNINGS[game.status];
  const buttonLabel =
    game.status === 'active'
      ? 'Slett pågående spill for alltid'
      : 'Slett spillet for alltid';

  return (
    <AdminShell>
      <div className="-mt-3 mb-2 flex items-center justify-between">
        <BackLink href={`/admin/games/${id}`}>Tilbake</BackLink>
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Sekretariatet
        </p>
        <span className="w-[80px]" aria-hidden />
      </div>

      <BrassRibbon kicker="Bekreft sletting" />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Slett «{game.name}»?
        </h1>
        <p className="font-sans text-[13px] leading-relaxed text-muted">
          {[game.courses?.name, dateLine].filter(Boolean).join(' · ')}
        </p>
      </div>

      {warning && (
        <div className="mt-4">
          <Banner tone={game.status === 'active' ? 'error' : 'warning'}>
            {warning}
          </Banner>
        </div>
      )}

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div
        className="mt-5 rounded-xl border bg-surface px-4 py-3.5"
        style={{ borderColor: 'rgba(180, 60, 60, 0.18)' }}
      >
        <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Slettes permanent
        </p>
        <ul className="space-y-1 font-sans text-[13px] text-text">
          <li>Spillet «{game.name}»</li>
          {playerCount > 0 && (
            <li>
              {playerCount} {playerCount === 1 ? 'spiller' : 'spillere'} i spillet
            </li>
          )}
          {scoreCount > 0 && (
            <li>
              {scoreCount} {scoreCount === 1 ? 'slaggerad' : 'slaggerader'}
            </li>
          )}
          {invitationCount > 0 && (
            <li>
              {invitationCount}{' '}
              {invitationCount === 1 ? 'invitasjon' : 'invitasjoner'} knyttet til
              spillet
            </li>
          )}
        </ul>
        <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
          Handlingen kan ikke angres.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <form action={deleteGame}>
          <input type="hidden" name="gameId" value={game.id} />
          <Button
            type="submit"
            className="w-full"
            style={{ background: '#a04040', borderColor: '#a04040' }}
          >
            {buttonLabel}
          </Button>
        </form>
        <SmartLink
          href={`/admin/games/${id}`}
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          Avbryt
        </SmartLink>
      </div>
    </AdminShell>
  );
}
