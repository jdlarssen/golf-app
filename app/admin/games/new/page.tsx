import Link from 'next/link';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';
import { GameForm, type CourseOption, type PlayerOption } from './GameForm';
import { createGameDraft, createAndStartGame } from './actions';

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
  db_game: 'Klarte ikke å lagre spillet. Prøv igjen, eller sjekk Supabase-loggene.',
  db_users: 'Klarte ikke å lese spillere fra databasen. Prøv igjen.',
  db_tee: 'Klarte ikke å lese tee-boksen fra databasen. Prøv igjen.',
  db_players:
    'Klarte ikke å lagre spillerne på spillet. Prøv igjen, eller sjekk Supabase-loggene.',
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

export default async function NewGamePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const supabase = await getServerClient();

  const [coursesResult, usersResult] = await Promise.all([
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

  const players: PlayerOption[] = (usersResult.data ?? []).map((u) => ({
    id: u.id,
    name: u.name,
    nickname: u.nickname ?? null,
    hcp_index: Number(u.hcp_index),
  }));

  return (
    <AppShell>
      <PageHeader
        title="Nytt spill"
        subtitle="Velg bane, spillere, lag og innstillinger"
        action={
          <BackLink href="/admin/games">Tilbake</BackLink>
        }
      />

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      {players.length < 8 && (
        <div className="mb-4">
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
        </div>
      )}

      <Card>
        <GameForm
          courses={courses}
          players={players}
          createDraftAction={createGameDraft}
          createAndStartAction={createAndStartGame}
        />
      </Card>
    </AppShell>
  );
}
