import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
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

  const [{ clubs }, t, tRoles] = await Promise.all([
    getMyClubs(supabase, user!.id),
    getTranslations('klubb.list'),
    getTranslations('klubb.roles'),
  ]);

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

      {/* Admin-gated opprettelse (#50): kontakt-vei i stedet for opprett-dør. */}
      <Card className="space-y-1.5 bg-surface/60">
        <p className="font-sans text-sm font-medium text-text">
          {t('ctaHeading')}
        </p>
        <p className="font-sans text-sm text-muted">
          {t.rich('ctaBody', {
            email: (chunks) => (
              <a
                href="mailto:klubb@tornygolf.no"
                className="font-medium text-primary underline underline-offset-2"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </Card>
    </AppShell>
  );
}
