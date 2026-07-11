import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getServerClient } from '@/lib/supabase/server';
import {
  formatShortDateWithYearLocale,
  formatShortOsloDateWithYearLocale,
} from '@/lib/i18n/format';
import { RoundStartClient } from './RoundStartClient';
import type { AppLocale } from '@/i18n/routing';


type Params = Promise<{ id: string; roundId: string }>;

function windowStatus(
  opensAt: string,
  closesAt: string,
): 'open' | 'upcoming' | 'closed' {
  const now = Date.now();
  if (now < new Date(opensAt).getTime()) return 'upcoming';
  if (now > new Date(closesAt).getTime()) return 'closed';
  return 'open';
}

function fmtWindow(iso: string, locale: AppLocale): string {
  // Round windows are timestamptz — read in Oslo wall-clock so a near-midnight
  // boundary shows the right calendar date on a UTC server (#687). Plain
  // YYYY-MM-DD season dates have no time component, parse at midday.
  if (iso.length === 10) {
    return formatShortDateWithYearLocale(new Date(`${iso}T12:00:00`), locale);
  }
  return formatShortOsloDateWithYearLocale(iso, locale);
}

export default async function RoundSpillPage({ params }: { params: Params }) {
  const { id: leagueId, roundId } = await params;
  const [t, locale] = await Promise.all([
    getTranslations('liga.player.runde'),
    getLocale() as Promise<AppLocale>,
  ]);

  const snapshot = await getLigaSnapshot(leagueId);
  if (!snapshot) redirect({ href: `/liga/${leagueId}`, locale });

  // Narrowed after redirect guard above.
  const { league, rounds, participants } = snapshot!;

  const round = rounds.find((r: { id: string }) => r.id === roundId);
  if (!round) redirect({ href: `/liga/${leagueId}`, locale });

  // Resolve current user.
  let currentUserId = await getProxyVerifiedUserId();
  if (!currentUserId) {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    currentUserId = user?.id ?? null;
  }

  // Must be a participant.
  const isParticipant =
    currentUserId !== null &&
    participants.some((p: { userId: string }) => p.userId === currentUserId);
  if (!isParticipant) redirect({ href: `/liga/${leagueId}`, locale });

  const ws = windowStatus(round!.opensAt, round!.closesAt);

  // Co-players = all participants except the current user.
  const coPlayers = participants.filter((p: { userId: string }) => p.userId !== currentUserId);

  return (
    <AppShell>
      <TopBar
        backHref={`/liga/${leagueId}`}
        backLabel={league.name}
        kicker={t('kicker')}
      />

      <header className="mb-6">
        <h1 className="font-serif text-2xl text-text leading-tight tracking-[-0.015em]">
          {round!.label}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {fmtWindow(round!.opensAt, locale)} – {fmtWindow(round!.closesAt, locale)}
        </p>
      </header>

      {/* Window not open — show message + back */}
      {ws !== 'open' && (
        <Card className="space-y-4">
          <p className="text-sm text-text">
            {ws === 'upcoming' ? t('windowUpcoming') : t('windowClosed')}
          </p>
          <LinkButton href={`/liga/${leagueId}`} variant="secondary" full>
            {t('backToLeague')}
          </LinkButton>
        </Card>
      )}

      {/* Round not ready (no course/tee) */}
      {ws === 'open' && (!round!.courseId || !round!.teeBoxId) && (
        <Card className="space-y-4">
          <p className="text-sm text-text">
            {t('missingSetup')}
          </p>
          <LinkButton href={`/liga/${leagueId}`} variant="secondary" full>
            {t('backToLeague')}
          </LinkButton>
        </Card>
      )}

      {/* Ready to start */}
      {ws === 'open' && round!.courseId && round!.teeBoxId && (
        <Card>
          <p className="text-sm text-muted mb-5">
            {t('markerRule')}
          </p>
          <RoundStartClient roundId={roundId} coPlayers={coPlayers} />
        </Card>
      )}
    </AppShell>
  );
}
