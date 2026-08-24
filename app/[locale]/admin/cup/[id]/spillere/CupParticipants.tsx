import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import { getRoleContext } from '@/lib/admin/auth';
import { getCupCandidatePlayers } from '@/lib/cup/getCupCandidatePlayers';
import { MAX_PERSONAL_CUP_PLAYERS } from '@/lib/cup/limits';
import {
  CupParticipantsList,
  type ParticipantRow,
  type AddableRow,
} from './CupParticipantsList';
import { CupShareLink } from './CupShareLink';

type CupRoomVariant = 'admin' | 'club';

type UserRel = {
  id: string;
  name: string | null;
  nickname: string | null;
  hcp_index: number | string;
};

// Supabase JS typer FK-joins som array selv på many-to-one — normaliser.
function userOf(rel: UserRel | UserRel[] | null | undefined): UserRel | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function displayNameOf(u: UserRel | null, unknownLabel: string): string {
  return u?.nickname?.trim() || u?.name?.trim() || unknownLabel;
}

/**
 * Delt Spillere-flate (#1472, Rom 2). Begge ruter (`/admin/cup/[id]/spillere`
 * og `/klubber/[id]/cup/[cupId]/spillere`) rendrer denne. Gaten gjøres i ruten.
 *
 * Deltakerlista hentes med admin-client (service-role) så klubb-admins ser hele
 * lista uansett users-RLS. Kandidatene følger cupens kontekst via den delte
 * `getCupCandidatePlayers`-helperen (samme kilde som Fordel-rommet).
 * Draft-only — ellers redirect til cup-detalj.
 */
export async function CupParticipants({
  tournamentId,
  variant,
  statusCode,
}: {
  tournamentId: string;
  variant: CupRoomVariant;
  statusCode?: string;
}) {
  const supabase = await getServerClient();

  // Oversettelsene først: navne-fallbacken (#1527) er input til både snapshot-en
  // og kandidat-kilden under. Begge er lokale oppslag, ingen ekstra rundtur.
  const [t, locale] = await Promise.all([getTranslations('cup'), getLocale()]);
  const unknownLabel = t('manage.unknownPlayer');

  const [{ userId, isAdmin }, snapshot] = await Promise.all([
    getRoleContext(supabase),
    getCupSnapshot(tournamentId, unknownLabel),
  ]);
  if (!snapshot) notFound();

  const { tournament } = snapshot;
  const groupId = tournament.group_id;

  if (tournament.status !== 'draft') {
    redirect({
      href:
        variant === 'club' && groupId
          ? `/klubber/${groupId}/cup/${tournamentId}`
          : `/admin/cup/${tournamentId}`,
      locale,
    });
  }

  const admin = getAdminClient();

  const [participantRes, candidates, shortIdRes] = await Promise.all([
    admin
      .from('tournament_participants')
      .select(
        'user_id, created_at, users:users!tournament_participants_user_id_fkey(id, name, nickname, hcp_index)',
      )
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true }),
    getCupCandidatePlayers(supabase, { groupId, userId, isAdmin, unknownLabel }),
    // #1490: `short_id` bygger den delbare påmeldingslenken. Egen slank
    // lesing framfor å utvide `getCupSnapshot` — snapshot-en leses av cup-
    // detaljen, resultatsiden og spectate, og ingen av dem trenger kolonnen.
    admin
      .from('tournaments')
      .select('short_id')
      .eq('id', tournamentId)
      .maybeSingle<{ short_id: string }>(),
  ]);
  if (participantRes.error) throw participantRes.error;

  const participants: ParticipantRow[] = (participantRes.data ?? []).map(
    (row) => {
      const u = userOf(row.users as UserRel | UserRel[] | null);
      return {
        userId: row.user_id,
        displayName: displayNameOf(u, unknownLabel),
        hcpIndex: Number(u?.hcp_index ?? 0),
      };
    },
  );

  const participantIds = new Set(participants.map((p) => p.userId));
  const addable: AddableRow[] = candidates
    .filter((c) => !participantIds.has(c.id))
    .map((c) => ({
      userId: c.id,
      displayName: c.displayName,
      hcpIndex: c.hcpIndex,
      pending: c.pending ?? false,
    }));

  // #526: personlig cup av en vanlig bruker er capped; admin/klubb er uncapped.
  // Speiler add-time-håndhevingen i addCupParticipant.
  const cap = !groupId && !isAdmin ? MAX_PERSONAL_CUP_PLAYERS : undefined;

  let clubName: string | null = null;
  if (variant === 'club' && groupId) {
    const { data: club } = await admin
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
  const kicker =
    variant === 'club' ? (clubName ?? t('ledger.kicker')) : t('ledger.kicker');
  const ribbonKicker =
    variant === 'club'
      ? t('participants.brassRibbonClub', { name: tournament.name })
      : t('participants.brassRibbonAdmin', { name: tournament.name });

  const emptyCandidatesHref = groupId
    ? `/klubber/${groupId}`
    : '/admin/spillere';
  const emptyCandidatesLinkKey = groupId
    ? ('emptyCandidatesLinkClub' as const)
    : ('emptyCandidatesLink' as const);

  const statusMessage =
    statusCode === 'participant_added' || statusCode === 'participant_removed'
      ? t(`participants.statusMessages.${statusCode}`)
      : undefined;

  // Absolutt URL: lenken skal kunne limes inn i en melding og virke der, ikke
  // bare i appen. Samme fallback-mønster som klubbens del-lenke.
  const joinUrl = shortIdRes.data
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://tornygolf.no'}/cup/bli-med/${shortIdRes.data.short_id}`
    : null;

  return (
    <Shell>
      <TopBar backHref={backHref} kicker={kicker} />
      <BrassRibbon kicker={ribbonKicker} />
      <PageHeader
        title={t('participants.pageTitle')}
        subtitle={t('participants.subtitle', {
          team1: tournament.team_1_name,
          team2: tournament.team_2_name,
        })}
      />
      {statusMessage && (
        <div className="mb-4">
          <Banner tone="success">{statusMessage}</Banner>
        </div>
      )}
      {joinUrl && (
        <div className="mb-6">
          <CupShareLink joinUrl={joinUrl} />
        </div>
      )}
      <CupParticipantsList
        // Remonter på deltaker-signaturen: en vellykket add/remove redirecter
        // og re-rendrer server-side, og et gammelt feil-banner skal ikke
        // overleve den nye lista.
        key={participants.map((p) => p.userId).join(',')}
        tournamentId={tournamentId}
        participants={participants}
        addable={addable}
        candidateCount={candidates.length}
        cap={cap}
        emptyCandidatesHref={emptyCandidatesHref}
        emptyCandidatesLinkKey={emptyCandidatesLinkKey}
      />
    </Shell>
  );
}
