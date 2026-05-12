import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import {
  GameForm,
  type CourseOption,
  type PlayerOption,
  type InitialValues,
} from '@/app/admin/games/new/GameForm';
import { updateGameAction } from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

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
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

type CourseRow = {
  id: string;
  name: string;
  tee_boxes: { id: string; name: string }[];
};

type UserRow = {
  id: string;
  name: string;
  nickname: string | null;
  hcp_index: number | string;
};

type GameRow = {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'active' | 'finished';
  course_id: string;
  tee_box_id: string;
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

export default async function EditGamePage({
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

  // Auth gate.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) redirect('/');

  // Load the game row first so we can short-circuit if it isn't editable.
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, status, course_id, tee_box_id, scheduled_tee_off_at, hcp_allowance_pct, require_peer_approval',
    )
    .eq('id', id)
    .single<GameRow>();

  if (gameError || !game) {
    redirect('/admin/games');
  }

  // Edits are only allowed while the game is in 'scheduled'. Once it flips to
  // 'active' or 'finished', state changes (handicaps, scores) make the roster
  // and tee-off effectively immutable.
  if (game!.status !== 'scheduled') {
    redirect(`/admin/games/${id}?error=not_editable`);
  }

  const [coursesResult, usersResult, playersResult] = await Promise.all([
    supabase
      .from('courses')
      .select('id, name, tee_boxes(id, name)')
      .order('name', { ascending: true })
      .returns<CourseRow[]>(),
    supabase
      .from('users')
      .select('id, name, nickname, hcp_index')
      .order('name', { ascending: true })
      .returns<UserRow[]>(),
    supabase
      .from('game_players')
      .select('user_id, team_number, flight_number')
      .eq('game_id', id)
      .returns<GamePlayerRow[]>(),
  ]);

  if (coursesResult.error) throw coursesResult.error;
  if (usersResult.error) throw usersResult.error;
  if (playersResult.error) throw playersResult.error;

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
  }));

  const initialValues: InitialValues = {
    name: game!.name,
    course_id: game!.course_id,
    tee_box_id: game!.tee_box_id,
    scheduled_tee_off_at: formatForDateTimeLocalInOslo(
      game!.scheduled_tee_off_at,
    ),
    hcp_allowance_pct: String(game!.hcp_allowance_pct),
    require_peer_approval: game!.require_peer_approval,
    players: (playersResult.data ?? []).map((p) => ({
      user_id: p.user_id,
      team_number: p.team_number,
      flight_number: p.flight_number,
    })),
  };

  const updateAction = updateGameAction.bind(null, id);

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
          {game!.name}
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          Endre bane, spillere, lag eller innstillinger
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        <Banner tone="info">
          Spillet er i planlagt-fasen. Spillerne ser endringene neste gang
          de åpner appen.
        </Banner>
        {playerOptions.length < 8 && (
          <Banner tone="info">
            Du trenger 8 registrerte spillere. Inviter flere fra{' '}
            <Link
              href="/admin/invitations"
              className="underline hover:no-underline"
            >
              Invitasjoner
            </Link>
            -siden.
          </Banner>
        )}
      </div>

      <div className="mt-5">
        <Card>
          <GameForm
            courses={courses}
            players={playerOptions}
            initialValues={initialValues}
            editMode
            updateAction={updateAction}
          />
        </Card>
      </div>
    </AdminShell>
  );
}
