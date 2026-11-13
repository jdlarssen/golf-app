import { getAdminContext } from '../_dashboardContext';
import { GettingStartedChecklist } from '../GettingStartedChecklist';
import { onlyStandaloneGames } from '@/lib/games/arrangedGames';

/**
 * «Kom i gang» (#1177) on top of the morning report until the setup is done
 * (#2345, owner's answer: kept). The counts are the ones the old tile grid
 * read for the checklist, moved as they were; the checklist hides itself
 * once all three steps are done.
 */
export async function GettingStartedSection() {
  const { supabase } = await getAdminContext();

  const [
    activeGamesRes,
    plannedGamesRes,
    pendingInvitesRes,
    usersRes,
    coursesRes,
    lastFinishedRes,
  ] = await Promise.all([
    // /admin/games holds standalone games only; cup matches and league
    // flights stand on their cup's and league's pages (#2269).
    onlyStandaloneGames(
      supabase.from('games').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ),
    onlyStandaloneGames(
      supabase
        .from('games')
        .select('id', { count: 'exact', head: true })
        .in('status', ['draft', 'scheduled']),
    ),
    // «Ventende invitasjoner» = alle uaksepterte, utløpte inkludert: det er
    // nøyaktig det ventelista på /admin/spillere viser (utløpte får «Utløpt»-
    // merke, #1381). Samme kjede i spillere/page.tsx (getCounts) og
    // _components/PendingInvitations.tsx — endres definisjonen, endres alle tre.
    supabase
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .is('accepted_at', null),
    // «Registrert» = ferdig onboardede, ikke-slettede spillere — nøyaktig det
    // spillerlista på /admin/spillere viser (#1662). Samme kjede i
    // spillere/page.tsx (getCounts) — endres definisjonen, endres begge.
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .not('profile_completed_at', 'is', null)
      .is('deleted_at', null),
    supabase.from('courses').select('id', { count: 'exact', head: true }),
    onlyStandaloneGames(supabase.from('games').select('ended_at').eq('status', 'finished'))
      // NULLS LAST: Postgres puts NULL first in DESC (#2269).
      .order('ended_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const activeCount = activeGamesRes.count ?? 0;
  const plannedCount = plannedGamesRes.count ?? 0;
  const pendingInvites = pendingInvitesRes.count ?? 0;
  const userCount = usersRes.count ?? 0;
  const courseCount = coursesRes.count ?? 0;
  const lastFinishedAt = (lastFinishedRes.data as { ended_at: string | null } | null)
    ?.ended_at;

  // #1177: goal-gradient onboarding — «Konto opprettet» is step 1,
  // pre-checked; the checklist auto-hides once all three are true.
  const hasCourse = courseCount >= 1;
  const hasGame = activeCount + plannedCount >= 1 || lastFinishedAt != null;
  const hasInvited = pendingInvites >= 1 || userCount >= 2;

  // `empty:hidden`: once the checklist hides itself, its margin goes too.
  return (
    <div className="mt-3.5 empty:hidden">
      <GettingStartedChecklist
        hasCourse={hasCourse}
        hasGame={hasGame}
        hasInvited={hasInvited}
      />
    </div>
  );
}
