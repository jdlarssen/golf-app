import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import { GenerateMatchesWizard } from './GenerateMatchesWizard';

type Params = Promise<{ id: string }>;

type CourseRow = {
  id: string;
  name: string;
  tee_boxes: {
    id: string;
    name: string;
    archived_at: string | null;
  }[];
};

type UserRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
  profile_completed_at: string | null;
};

export type WizardPlayer = {
  id: string;
  displayName: string;
  hcpIndex: number;
};

export type WizardTeeBox = {
  id: string;
  name: string;
};

export type WizardCourse = {
  id: string;
  name: string;
  teeBoxes: WizardTeeBox[];
};

export default async function GenerateMatchesPage({ params }: { params: Params }) {
  const { id } = await params;

  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const snapshot = await getCupSnapshot(id);
  if (!snapshot) notFound();

  const { tournament } = snapshot;

  // Only allow match generation while the cup is still a draft
  if (tournament.status !== 'draft') {
    redirect(`/admin/cup/${id}`);
  }

  const [coursesResult, usersResult] = await Promise.all([
    supabase
      .from('courses')
      .select('id, name, tee_boxes(id, name, archived_at)')
      .order('name', { ascending: true })
      .returns<CourseRow[]>(),
    supabase
      .from('users')
      .select('id, name, nickname, hcp_index, profile_completed_at')
      .order('name', { ascending: true, nullsFirst: true })
      .returns<UserRow[]>(),
  ]);

  if (coursesResult.error) throw coursesResult.error;
  if (usersResult.error) throw usersResult.error;

  const courses: WizardCourse[] = (coursesResult.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    teeBoxes: (c.tee_boxes ?? [])
      .filter((t) => t.archived_at === null)
      .map((t) => ({ id: t.id, name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'no')),
  })).filter((c) => c.teeBoxes.length > 0);

  // Only show profile-completed players (profile_completed_at IS NOT NULL)
  const players: WizardPlayer[] = (usersResult.data ?? [])
    .filter((u) => u.profile_completed_at !== null)
    .map((u) => ({
      id: u.id,
      displayName: u.nickname?.trim() || u.name?.trim() || 'Ukjent spiller',
      hcpIndex: Number(u.hcp_index),
    }));

  return (
    <AdminShell>
      <TopBar backHref={`/admin/cup/${id}`} kicker="Klubbhuset" />
      <BrassRibbon kicker={`Cup · ${tournament.name}`} />
      <PageHeader
        title="Generer matcher"
        subtitle={`${tournament.team_1_name} mot ${tournament.team_2_name}`}
      />
      <GenerateMatchesWizard
        tournamentId={id}
        team1Name={tournament.team_1_name}
        team2Name={tournament.team_2_name}
        players={players}
        courses={courses}
      />
    </AdminShell>
  );
}
