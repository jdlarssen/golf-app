import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import { getClubMemberOptionsForClub } from '@/lib/clubs/getClubMemberOptionsForClub';
import { GenerateMatchesWizard } from './GenerateMatchesWizard';

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

type GenerateMatchesVariant = 'admin' | 'club';

/**
 * Delt match-genererings-flate (#524). Begge ruter (`/admin/cup/[id]/generer`
 * og `/klubber/[id]/cup/[cupId]/generer`) rendrer denne. Gaten gjøres i ruten;
 * komponenten gjør all fetching + chrome.
 *
 * Spiller-kilden følger cupens kontekst: klubb-cup (group_id satt) henter KUN
 * klubbens medlemmer; frittstående henter alle profil-fullførte brukere.
 */
export async function GenerateMatches({
  tournamentId,
  variant,
}: {
  tournamentId: string;
  variant: GenerateMatchesVariant;
}) {
  const supabase = await getServerClient();

  const snapshot = await getCupSnapshot(tournamentId);
  if (!snapshot) notFound();

  const { tournament } = snapshot;
  const groupId = tournament.group_id;

  // Bare generering mens cupen er utkast.
  if (tournament.status !== 'draft') {
    redirect(
      variant === 'club' && groupId
        ? `/klubber/${groupId}/cup/${tournamentId}`
        : `/admin/cup/${tournamentId}`,
    );
  }

  const coursesResult = await supabase
    .from('courses')
    .select('id, name, tee_boxes(id, name, archived_at)')
    .order('name', { ascending: true })
    .returns<CourseRow[]>();
  if (coursesResult.error) throw coursesResult.error;

  const courses: WizardCourse[] = (coursesResult.data ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      teeBoxes: (c.tee_boxes ?? [])
        .filter((t) => t.archived_at === null)
        .map((t) => ({ id: t.id, name: t.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'no')),
    }))
    .filter((c) => c.teeBoxes.length > 0);

  // Spiller-kilde: klubb-cup → kun medlemmer; frittstående → alle profil-fullførte.
  let players: WizardPlayer[];
  if (groupId) {
    const members = await getClubMemberOptionsForClub(groupId);
    players = members
      .filter((m) => !m.pending)
      .map((m) => ({
        id: m.id,
        displayName: m.nickname?.trim() || m.name?.trim() || 'Ukjent spiller',
        hcpIndex: m.hcp_index,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'no'));
  } else {
    const usersResult = await supabase
      .from('users')
      .select('id, name, nickname, hcp_index, profile_completed_at')
      .order('name', { ascending: true, nullsFirst: true })
      .returns<UserRow[]>();
    if (usersResult.error) throw usersResult.error;
    players = (usersResult.data ?? [])
      .filter((u) => u.profile_completed_at !== null)
      .map((u) => ({
        id: u.id,
        displayName: u.nickname?.trim() || u.name?.trim() || 'Ukjent spiller',
        hcpIndex: Number(u.hcp_index),
      }));
  }

  let clubName: string | null = null;
  if (groupId) {
    const { data: club } = await getAdminClient()
      .from('groups')
      .select('name')
      .eq('id', groupId)
      .maybeSingle();
    clubName = (club?.name as string | null | undefined) ?? null;
  }

  const Shell = variant === 'club' ? AppShell : AdminShell;
  const backHref =
    variant === 'club' && groupId
      ? `/klubber/${groupId}/cup/${tournamentId}`
      : `/admin/cup/${tournamentId}`;
  const kicker = variant === 'club' ? (clubName ?? 'Klubbhuset') : 'Klubbhuset';
  const ribbonKicker =
    variant === 'club'
      ? `Klubb-cup · ${tournament.name}`
      : `Cup · ${tournament.name}`;

  return (
    <Shell>
      <TopBar backHref={backHref} kicker={kicker} />
      <BrassRibbon kicker={ribbonKicker} />
      <PageHeader
        title="Generer matcher"
        subtitle={`${tournament.team_1_name} mot ${tournament.team_2_name}`}
      />
      <GenerateMatchesWizard
        tournamentId={tournamentId}
        team1Name={tournament.team_1_name}
        team2Name={tournament.team_2_name}
        players={players}
        courses={courses}
      />
    </Shell>
  );
}
