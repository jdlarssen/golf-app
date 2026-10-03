import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { SectionError } from '@/components/ui/SectionError';
import { getMyClubs } from '@/lib/clubs/getMyClubs';

/**
 * /klubber — the user's club list.
 *
 * Shows all clubs the logged-in user is a member of, with their role, and
 * links to /klubber/[id] for each.
 *
 * Klubb-opprettelse er admin-gated fra #50: vanlige brukere oppretter ikke
 * klubber lenger. I stedet for en «Opprett klubb»-dør viser siden en
 * kontakt-vei (klubb@tornygolf.no) — klubber settes opp via en avtale.
 *
 * Part of #50 (Klubb-eierskap, delegering & tilgangsstyring).
 */
export default async function KlubbListePage() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const locale = await getLocale();
  if (!user) redirect({ href: '/login', locale });

  const [clubsRes, t, tRoles] = await Promise.all([
    getMyClubs(supabase, user.id),
    getTranslations('klubb.list'),
    getTranslations('klubb.roles'),
  ]);

  // A failed read is not «no clubs» (#2490): an error box, and no contact
  // card, which would tell a member that they have no club.
  if (!clubsRes.ok) {
    console.error('[klubber] clubs failed');
    return (
      <AppShell>
        <TopBar backHref="/admin" kicker={t('kicker')} />
        <PageHeader title={t('pageTitle')} />
        <SectionError />
      </AppShell>
    );
  }
  const { clubs } = clubsRes;

  return (
    <AppShell>
      <TopBar backHref="/admin" kicker={t('kicker')} />
      <PageHeader title={t('pageTitle')} />

      {clubs.length === 0 ? (
        <p className="mb-6 text-center text-sm text-muted">
          {t('emptyState')}
        </p>
      ) : (
        <nav className="mb-6 space-y-2">
          {clubs.map((club) => (
            <SmartLink key={club.id} href={`/klubber/${club.id}`} className="block">
              <Card className="min-h-[44px] p-5 transition-colors hover:border-primary/30">
                <div className="flex items-center justify-between gap-3">
                  <span className="block truncate font-serif text-lg font-medium tracking-tight text-text">
                    {club.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="rounded-full border border-border px-2.5 py-0.5 font-sans text-xs text-muted">
                      {tRoles(club.role)}
                    </span>
                    <span aria-hidden className="text-muted">
                      →
                    </span>
                  </div>
                </div>
              </Card>
            </SmartLink>
          ))}
        </nav>
      )}

      {/* Admin-gated opprettelse (#50): kontakt-vei i stedet for opprett-dør.
          Vis full CTA i tom-tilstand; diskret énlinje-linje når eier allerede
          har en eller flere klubber (#775). */}
      {clubs.length === 0 ? (
        <Card className="space-y-1.5 bg-surface/60">
          <p className="font-sans text-sm font-medium text-text">
            {t('ctaHeading')}
          </p>
          <p className="font-sans text-sm text-muted">
            {t.rich('ctaBody', {
              email: (chunks) => (
                <a
                  href="mailto:klubb@tornygolf.no"
                  className="tap-extend font-medium text-primary underline underline-offset-2 [--tap-extend:-14px_0]"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </Card>
      ) : (
        <p className="text-sm text-muted">
          {t.rich('ctaDiscrete', {
            email: (chunks) => (
              <a
                href="mailto:klubb@tornygolf.no"
                className="tap-extend font-medium text-primary underline underline-offset-2 [--tap-extend:-14px_0]"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      )}
    </AppShell>
  );
}
