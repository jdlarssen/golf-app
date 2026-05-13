import { Suspense, cache } from 'react';
import { redirect } from 'next/navigation';
import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AdminShell } from '@/components/ui/AdminShell';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  GameForm,
  type CourseOption,
  type PlayerOption,
  type InitialValues,
} from '@/app/admin/games/new/GameForm';
import {
  saveDraftAction,
  publishFromDraftAction,
  updateScheduledAction,
} from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  error?: string | string[];
  emails?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Spillet må ha et navn.',
  course_required: 'Velg en bane.',
  tee_required: 'Velg en tee-boks.',
  bad_allowance: 'HCP-allowance må være et helt tall mellom 0 og 100.',
  players_required: 'Du må velge nøyaktig 8 spillere.',
  duplicate_player: 'Samme spiller kan ikke velges flere ganger.',
  bad_team: 'Hver spiller må tilhøre et lag (1–4).',
  bad_flight: 'Hver spiller må tilhøre en flight (1–4).',
  team_balance: 'Hvert lag må ha nøyaktig 2 spillere.',
  tee_off_required: 'Tee-off-tidspunkt er påkrevd.',
  db_game: 'Klarte ikke å oppdatere spillet. Prøv igjen.',
  db_players: 'Klarte ikke å oppdatere spillerne. Prøv igjen.',
  not_editable:
    'Spillet kan ikke redigeres lenger — det er allerede startet eller avsluttet.',
  pending_players:
    'Disse spillerne har ikke fullført registreringen ennå{LIST}. De må logge inn og fylle inn navn + HCP før spillet kan publiseres.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildErrorMessage(
  errorCode: string | undefined,
  emails: string | undefined,
): string | undefined {
  if (!errorCode) return undefined;
  const base = ERROR_MESSAGES[errorCode];
  if (!base) return undefined;
  if (errorCode === 'pending_players') {
    return base.replace('{LIST}', emails ? `: ${emails}` : '');
  }
  return base;
}

type CourseRow = {
  id: string;
  name: string;
  tee_boxes: { id: string; name: string }[];
};

type UserRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
  email: string;
  profile_completed_at: string | null;
};

type GameRow = {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  // Nullable since migration 0011 — drafts may not have a course or tee
  // assigned yet.
  course_id: string | null;
  tee_box_id: string | null;
  scheduled_tee_off_at: string | null;
  hcp_allowance_pct: number;
  require_peer_approval: boolean;
};

type GamePlayerRow = {
  user_id: string;
  team_number: number;
  flight_number: number;
};

// `datetime-local` inputs want 'YYYY-MM-DDTHH:mm' in browser-local time, but
// the DB stores `timestamptz` (UTC instant). We pre-format the value in
// Europe/Oslo wall-clock so the input shows the same time the admin originally
// picked — regardless of where the admin's browser thinks it is right now.
function formatForDateTimeLocalInOslo(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  // en-CA produces YYYY-MM-DD HH:MM (24h); reshape to YYYY-MM-DDTHH:mm so it
  // matches what <input type="datetime-local"> emits and accepts.
  const parts = fmt.formatToParts(d);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}`;
}

const getEditContext = cache(async () => {
  const supabase = await getServerClient();
  const userId = await getProxyVerifiedUserId();
  return { supabase, userId };
});

export default async function EditGamePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const errorMessage = buildErrorMessage(first(sp.error), first(sp.emails));

  const { supabase, userId } = await getEditContext();
  if (!userId) redirect('/login');

  // Gating: admin check + game row in parallel. Both determine whether the
  // page should render at all.
  const [profileRes, gameRes] = await Promise.all([
    supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .single(),
    supabase
      .from('games')
      .select(
        'id, name, status, course_id, tee_box_id, scheduled_tee_off_at, hcp_allowance_pct, require_peer_approval',
      )
      .eq('id', id)
      .single<GameRow>(),
  ]);

  if (!profileRes.data?.is_admin) redirect('/');

  if (gameRes.error || !gameRes.data) {
    redirect('/admin/games');
  }
  const game = gameRes.data;

  // Edits are allowed while the game is still in 'draft' or 'scheduled'.
  // Once it flips to 'active' or 'finished', state changes (handicaps, scores)
  // make the roster and tee-off effectively immutable.
  if (game.status !== 'draft' && game.status !== 'scheduled') {
    redirect(`/admin/games/${id}?error=not_editable`);
  }

  return (
    <AdminShell>
      <div className="-mt-3 mb-2 flex items-center justify-between">
        <BackLink href={`/admin/games/${id}`}>Tilbake</BackLink>
        <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          Spill · protokoll
        </p>
        <span className="w-[80px]" aria-hidden />
      </div>

      <BrassRibbon kicker="Rediger spill" />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {game.name}
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          Endre bane, spillere, lag eller innstillinger
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        <Banner tone="info">
          {game.status === 'draft'
            ? 'Spillet er fortsatt et utkast — bare du ser det. Fyll inn det som mangler og publiser når dere er klare.'
            : 'Spillet er i planlagt-fasen. Spillerne ser endringene neste gang de åpner appen.'}
        </Banner>
        <Suspense fallback={null}>
          <PlayerShortageBanner />
        </Suspense>
      </div>

      <div className="mt-5">
        <Card>
          <Suspense fallback={<GameFormSkeleton />}>
            <EditGameFormBody gameId={id} game={game} />
          </Suspense>
        </Card>
      </div>
    </AdminShell>
  );
}

const getOptions = cache(async () => {
  const { supabase } = await getEditContext();
  const [coursesResult, usersResult] = await Promise.all([
    supabase
      .from('courses')
      .select('id, name, tee_boxes(id, name)')
      .order('name', { ascending: true })
      .returns<CourseRow[]>(),
    supabase
      .from('users')
      .select('id, name, nickname, hcp_index, email, profile_completed_at')
      .order('profile_completed_at', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true, nullsFirst: true })
      .returns<UserRow[]>(),
  ]);
  if (coursesResult.error) throw coursesResult.error;
  if (usersResult.error) throw usersResult.error;

  const courses: CourseOption[] = (coursesResult.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    tee_boxes: (c.tee_boxes ?? [])
      .map((t) => ({ id: t.id, name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'no')),
  }));

  const playerOptions: PlayerOption[] = (usersResult.data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    nickname: u.nickname ?? null,
    hcp_index: Number(u.hcp_index),
    email: u.email,
    pending: u.profile_completed_at === null,
  }));

  return { courses, playerOptions };
});

async function PlayerShortageBanner() {
  const { playerOptions } = await getOptions();
  if (playerOptions.length >= 8) return null;
  return (
    <Banner tone="info">
      Du trenger 8 registrerte spillere. Inviter flere fra{' '}
      <SmartLink
        href="/admin/invitations"
        className="underline hover:no-underline"
      >
        Invitasjoner
      </SmartLink>
      -siden.
    </Banner>
  );
}

async function EditGameFormBody({
  gameId,
  game,
}: {
  gameId: string;
  game: GameRow;
}) {
  const { supabase } = await getEditContext();
  const [{ courses, playerOptions }, playersResult] = await Promise.all([
    getOptions(),
    supabase
      .from('game_players')
      .select('user_id, team_number, flight_number')
      .eq('game_id', gameId)
      .returns<GamePlayerRow[]>(),
  ]);

  if (playersResult.error) throw playersResult.error;

  const initialValues: InitialValues = {
    name: game.name,
    // course_id / tee_box_id may be null on a draft. The form treats undefined
    // as "not chosen yet", so coerce with ??.
    course_id: game.course_id ?? undefined,
    tee_box_id: game.tee_box_id ?? undefined,
    scheduled_tee_off_at: formatForDateTimeLocalInOslo(
      game.scheduled_tee_off_at,
    ),
    hcp_allowance_pct: String(game.hcp_allowance_pct),
    require_peer_approval: game.require_peer_approval,
    players: (playersResult.data ?? []).map((p) => ({
      user_id: p.user_id,
      team_number: p.team_number,
      flight_number: p.flight_number,
    })),
  };

  if (game.status === 'draft') {
    return (
      <GameForm
        courses={courses}
        players={playerOptions}
        initialValues={initialValues}
        mode={{
          kind: 'edit-draft',
          gameId,
          saveDraftAction,
          publishAction: publishFromDraftAction,
        }}
      />
    );
  }

  return (
    <GameForm
      courses={courses}
      players={playerOptions}
      initialValues={initialValues}
      mode={{
        kind: 'edit-scheduled',
        gameId,
        updateAction: updateScheduledAction,
      }}
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
