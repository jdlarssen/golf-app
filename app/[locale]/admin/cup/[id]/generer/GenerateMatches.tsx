import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import { getClubMemberOptionsForClub } from '@/lib/clubs/getClubMemberOptionsForClub';
import { getFriendPlayerOptions } from '@/lib/friends/getFriendPlayerOptions';
import { getRoleContext } from '@/lib/admin/auth';
import { MAX_PERSONAL_CUP_MATCHES } from '@/lib/cup/limits';
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
 * Spiller-kilden følger cupens kontekst (#524/#526/#464):
 *  - klubb-cup (group_id satt) → KUN klubbens medlemmer.
 *  - personlig cup, global admin → alle profil-fullførte brukere (sekretariat).
 *  - personlig cup, vanlig skaper → skaperens venner + skaperen selv (samme
 *    venne-scoping som opprett-veiviseren, ikke hele brukerbasen).
 */
export async function GenerateMatches({
  tournamentId,
  variant,
}: {
  tournamentId: string;
  variant: GenerateMatchesVariant;
}) {
  const supabase = await getServerClient();
  const { userId, isAdmin } = await getRoleContext(supabase);

  const [snapshot, t, locale] = await Promise.all([
    getCupSnapshot(tournamentId),
    getTranslations('cup'),
    getLocale(),
  ]);
  if (!snapshot) notFound();

  const { tournament } = snapshot;
  const groupId = tournament.group_id;

  // Bare generering mens cupen er utkast.
  if (tournament.status !== 'draft') {
    redirect({
      href:
        variant === 'club' && groupId
          ? `/klubber/${groupId}/cup/${tournamentId}`
          : `/admin/cup/${tournamentId}`,
      locale,
    });
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

  // Spiller-kilde følger cupens kontekst (se docstring).
  let players: WizardPlayer[];
  if (groupId) {
    // Klubb-cup → kun medlemmer.
    const members = await getClubMemberOptionsForClub(groupId);
    players = members
      .filter((m) => !m.pending)
      .map((m) => ({
        id: m.id,
        displayName: m.nickname?.trim() || m.name?.trim() || 'Ukjent spiller',
        hcpIndex: m.hcp_index,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'no'));
  } else if (isAdmin) {
    // Personlig cup, global admin → alle profil-fullførte brukere.
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
  } else {
    // Personlig cup, vanlig skaper → skaperens venner + skaperen selv (#464).
    // Skaperen selv hentes direkte (alltid synlig for seg selv via RLS); venner
    // via admin-client-helperen så de ikke faller ut av users-RLS-en.
    const [friends, selfResult] = await Promise.all([
      getFriendPlayerOptions(userId),
      supabase
        .from('users')
        .select('id, name, nickname, hcp_index, profile_completed_at')
        .eq('id', userId)
        .maybeSingle<UserRow>(),
    ]);
    const byId = new Map<string, WizardPlayer>();
    const self = selfResult.data;
    if (self && self.profile_completed_at !== null) {
      byId.set(self.id, {
        id: self.id,
        displayName:
          self.nickname?.trim() || self.name?.trim() || 'Ukjent spiller',
        hcpIndex: Number(self.hcp_index),
      });
    }
    for (const f of friends) {
      if (f.pending || byId.has(f.id)) continue;
      byId.set(f.id, {
        id: f.id,
        displayName: f.nickname?.trim() || f.name?.trim() || 'Ukjent spiller',
        hcpIndex: f.hcp_index,
      });
    }
    players = [...byId.values()].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, 'no'),
    );
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
      ? t('generate.brassRibbonClub', { name: tournament.name })
      : t('generate.brassRibbonAdmin', { name: tournament.name });

  // #526: personlig cup av en vanlig bruker er capped; admin og klubb-cup er
  // uncapped. Speiler cap-håndhevingen i createCupMatchesFromPlan.
  const matchCap =
    !groupId && !isAdmin ? MAX_PERSONAL_CUP_MATCHES : undefined;

  return (
    <Shell>
      <TopBar backHref={backHref} kicker={kicker} />
      <BrassRibbon kicker={ribbonKicker} />
      <PageHeader
        title={t('generate.pageTitle')}
        subtitle={`${tournament.team_1_name} ${t('generate.mot')} ${tournament.team_2_name}`}
      />
      <GenerateMatchesWizard
        tournamentId={tournamentId}
        team1Name={tournament.team_1_name}
        team2Name={tournament.team_2_name}
        players={players}
        courses={courses}
        matchCap={matchCap}
      />
    </Shell>
  );
}
