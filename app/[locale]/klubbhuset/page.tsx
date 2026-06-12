import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import { formatTeeOffDateLocale, formatTeeOffTimeLocale } from '@/lib/i18n/format';
import type { GameStatus } from '@/lib/games/status';
import type { AppLocale } from '@/i18n/routing';

type CreatedGame = {
  id: string;
  name: string;
  status: GameStatus;
  scheduled_tee_off_at: string | null;
  courses: { name: string } | null;
};

const STATUS_TO_TONE: Record<GameStatus, StatusChipTone> = {
  draft: 'utkast',
  scheduled: 'påmelding',
  active: 'aktiv',
  finished: 'signert',
};

/**
 * Klubbhuset (#429) — a player's hub for the games they *arrange* (created),
 * as opposed to the games they play in (which live on the home page). Shaped
 * like the admin Sekretariat games list, but filtered to created_by = me via
 * the request-scoped client (RLS 0071 "games select own created").
 *
 * This is the «Spill» section of the universal Klubbhuset room (#392): reached
 * from the Spill-tile in /admin (Klubbhuset) for non-admins, and active under
 * the Klubbhuset bottom-nav tab. Each row links to the game's home, where the
 * «Styr spillere» / Rediger / Avslutt arranger controls live.
 */
export default async function KlubbhusetPage() {
  const [t, locale] = await Promise.all([
    getTranslations('klubbhuset'),
    getLocale() as Promise<AppLocale>,
  ]);
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });

  const { data: games } = await supabase
    .from('games')
    .select('id, name, status, scheduled_tee_off_at, courses(name)')
    .eq('created_by', user!.id)
    .order('created_at', { ascending: false })
    .returns<CreatedGame[]>();

  const created = games ?? [];

  return (
    <AppShell>
      <TopBar backHref="/admin" kicker={t('kicker')} />
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
      />

      {created.length === 0 ? (
        <div className="space-y-5 text-center">
          <p className="text-sm text-muted">
            {t('emptyState')}
          </p>
          <LinkButton href="/opprett-spill" full>
            {t('newRoundButton')}
          </LinkButton>
        </div>
      ) : (
        <nav className="space-y-2">
          {created.map((g) => {
            const teeOff = g.scheduled_tee_off_at
              ? new Date(g.scheduled_tee_off_at)
              : null;
            return (
              <SmartLink key={g.id} href={`/games/${g.id}`} className="block">
                <Card className="min-h-[44px] p-5 transition-colors hover:border-primary/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-serif text-lg font-medium tracking-tight text-text">
                        {g.name}
                      </span>
                      {g.courses?.name && (
                        <span className="mt-1 block truncate text-xs text-muted">
                          {g.courses.name}
                        </span>
                      )}
                      {teeOff && (
                        <span className="mt-1 block truncate text-xs tabular-nums text-muted">
                          {formatTeeOffDateLocale(teeOff, locale)} {t('teeOffAt', { time: formatTeeOffTimeLocale(teeOff, locale) })}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusChip tone={STATUS_TO_TONE[g.status]} />
                      <span aria-hidden className="text-muted">
                        →
                      </span>
                    </div>
                  </div>
                </Card>
              </SmartLink>
            );
          })}
        </nav>
      )}
    </AppShell>
  );
}
