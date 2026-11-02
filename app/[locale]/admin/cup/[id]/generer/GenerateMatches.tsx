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
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import { getRoleContext } from '@/lib/admin/auth';
import { MAX_PERSONAL_CUP_MATCHES } from '@/lib/cup/limits';
import { loadCupGenerateInput } from '@/lib/cup/loadCupGenerateInput';
import type { WizardTeeBox } from '@/lib/cup/matchPlan';
import { type WizardPlayer } from '@/lib/cup/getCupCandidatePlayers';
import { GenerateMatchesWizard } from './GenerateMatchesWizard';

// WizardPlayer bor i lib/cup/getCupCandidatePlayers (#1472). Re-eksportert her
// så eksisterende importører av `./GenerateMatches` (GenerateMatchesWizard +
// dens test) er uendret.
export type { WizardPlayer, WizardTeeBox };

type GenerateMatchesVariant = 'admin' | 'club';

/**
 * Guided empty-state-kortene (#752/#1488 K13) — vis lenke til det rommet som
 * mangler noe (Oppsett / Spillere). Trukket ut så de to betingede kortene ikke
 * teller mot `GenerateMatches`-kompleksiteten. Kan stables (begge mangler på en
 * fersk cup).
 */
function GenerateMatchesEmptyStateCards({
  planReady,
  hasParticipants,
  cupBase,
  t,
}: {
  planReady: boolean;
  hasParticipants: boolean;
  cupBase: string;
  t: Awaited<ReturnType<typeof getTranslations<'cup'>>>;
}) {
  return (
    <div className="space-y-3">
      {!planReady && (
        <Card>
          <p className="text-sm text-muted mb-2">
            {t('generate.emptyStateNoPlan')}
          </p>
          <SmartLink
            href={`${cupBase}/oppsett`}
            className="tap-extend text-sm text-text underline hover:no-underline [--tap-extend:-14px_-8px]"
          >
            {t('generate.emptyStateNoPlanLink')}
          </SmartLink>
        </Card>
      )}
      {!hasParticipants && (
        <Card>
          <p className="text-sm text-muted mb-2">
            {t('generate.emptyStateNoParticipants')}
          </p>
          <SmartLink
            href={`${cupBase}/spillere`}
            className="tap-extend text-sm text-text underline hover:no-underline [--tap-extend:-14px_-8px]"
          >
            {t('generate.emptyStateNoParticipantsLink')}
          </SmartLink>
        </Card>
      )}
    </div>
  );
}

/**
 * Delt Fordel-og-generer-flate (#524/#1472, Rom 3). Begge ruter
 * (`/admin/cup/[id]/generer` og `/klubber/[id]/cup/[cupId]/generer`) rendrer
 * denne. Gaten gjøres i ruten; komponenten gjør all fetching + chrome.
 *
 * #1472: bane/tee/tee-off/format/strategi kommer nå fra den LAGREDE planen
 * (Oppsett-rommet), og rosteren er cupens PÅMELDTE deltakere (Spillere-rommet)
 * — ikke lenger kandidat-kilden. Mangler forutsetningene, viser rommet en
 * guided empty-state (#752) med lenke til det rommet som mangler noe, i stedet
 * for veiviseren.
 */
export async function GenerateMatches({
  tournamentId,
  variant,
}: {
  tournamentId: string;
  variant: GenerateMatchesVariant;
}) {
  const supabase = await getServerClient();
  const { isAdmin } = await getRoleContext(supabase);

  // Oversettelsene først: navne-fallbacken (#1527) er input til snapshot-en.
  const [t, locale] = await Promise.all([getTranslations('cup'), getLocale()]);
  const unknownLabel = t('manage.unknownPlayer');

  const snapshot = await getCupSnapshot(tournamentId, unknownLabel);
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

  const admin = getAdminClient();

  // #2752: planen og de påmeldte leses av samme funksjon som appens rute.
  // planReady krever at planen finnes, har bane+tee, OG at de faktisk resolver
  // (arkivert/slettet tee → ufullstendig).
  const {
    participants,
    planCourseName,
    planTeeName,
    selectedTee,
    presetId,
    customSessions,
    strategy,
  } = await loadCupGenerateInput(supabase, admin, tournamentId, unknownLabel);
  const planReady = selectedTee !== undefined;

  let clubName: string | null = null;
  if (groupId) {
    const { data: club } = await admin
      .from('groups')
      .select('name')
      .eq('id', groupId)
      .maybeSingle();
    clubName = (club?.name as string | null | undefined) ?? null;
  }

  const Shell = variant === 'club' ? AppShell : AdminShell;
  const cupBase =
    variant === 'club' && groupId
      ? `/klubber/${groupId}/cup/${tournamentId}`
      : `/admin/cup/${tournamentId}`;
  const backHref = cupBase;
  const kicker = variant === 'club' ? (clubName ?? t('ledger.kicker')) : t('ledger.kicker');
  const ribbonKicker =
    variant === 'club'
      ? t('generate.brassRibbonClub', { name: tournament.name })
      : t('generate.brassRibbonAdmin', { name: tournament.name });

  // #526: personlig cup av en vanlig bruker er capped; admin og klubb-cup er
  // uncapped. Speiler cap-håndhevingen i createCupMatchesFromPlan.
  const matchCap =
    !groupId && !isAdmin ? MAX_PERSONAL_CUP_MATCHES : undefined;

  const hasParticipants = participants.length > 0;

  // #752: guided empty-state — vis forklaring + lenke til det rommet som mangler
  // noe (Oppsett / Spillere) i stedet for veiviseren. Kan stables (begge
  // mangler på en fersk cup).
  if (!planReady || !hasParticipants) {
    return (
      <Shell>
        <TopBar backHref={backHref} kicker={kicker} />
        <BrassRibbon kicker={ribbonKicker} />
        <PageHeader
          title={t('generate.pageTitle')}
          subtitle={`${tournament.team_1_name} ${t('generate.mot')} ${tournament.team_2_name}`}
        />
        <GenerateMatchesEmptyStateCards
          planReady={planReady}
          hasParticipants={hasParticipants}
          cupBase={cupBase}
          t={t}
        />
      </Shell>
    );
  }

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
        players={participants}
        matchCap={matchCap}
        planCourseName={planCourseName}
        planTeeName={planTeeName}
        selectedTee={selectedTee}
        presetId={presetId}
        customSessions={customSessions}
        strategy={strategy}
      />
    </Shell>
  );
}
