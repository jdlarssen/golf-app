import { first } from '@/lib/url/searchParams';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getClubDetail } from '@/lib/clubs/getClubDetail';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { SmartLink } from '@/components/ui/SmartLink';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ role_changed?: string | string[] }>;

/**
 * /klubber/[id]/medlemmer — the club's whole member list (#2326), moved here
 * from /klubber/[id], which shows the first five. Every member may open it.
 * The owner gets «Endre rolle» (/rolle/[userId]); owner and admin get
 * «Fjern» (/fjern/[userId]); both confirm pages land back here, the role
 * change with ?role_changed=.
 *
 * Members sorted owner → admin → member, then by name (`getClubDetail`).
 */
export default async function KlubbMedlemmerPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = await getLocale();

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });

  const detail = await getClubDetail(supabase, id, user.id);
  if (!detail) notFound();

  const { club, members, myRole } = detail;
  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const roleChanged = first(sp.role_changed);

  const [t, tRoles] = await Promise.all([
    getTranslations('klubb.room'),
    getTranslations('klubb.roles'),
  ]);

  return (
    <AppShell>
      <TopBar backHref={`/klubber/${club.id}`} kicker={club.name} />
      <PageHeader title={t('membersPageTitle')} />

      {roleChanged && (
        <div className="mb-6">
          <Banner tone="success">{t('roleChangedBanner')}</Banner>
        </div>
      )}

      <section className="mb-8" data-testid="club-members-all">
        <h2 className="mb-3 font-sans text-xs font-semibold text-muted">
          {club.member_cap != null
            ? t('membersHeadingWithCap', { count: members.length, cap: club.member_cap })
            : t('membersHeading', { count: members.length })}
        </h2>
        <div className="space-y-2">
          {members.map((member) => (
            <Card key={member.userId} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-sans text-[15px] font-medium text-text">
                  {member.name}
                  {member.userId === user.id && (
                    <span className="ml-1.5 text-muted font-normal">{t('youSuffix')}</span>
                  )}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-border px-2.5 py-0.5 font-sans text-xs text-muted">
                    {tRoles(member.role)}
                  </span>
                  {myRole === 'owner' && member.userId !== user.id && (
                    <SmartLink
                      href={`/klubber/${club.id}/rolle/${member.userId}`}
                      className="min-h-[44px] min-w-11 flex items-center justify-center font-sans text-xs text-primary hover:underline"
                    >
                      {t('changeRoleLink')}
                    </SmartLink>
                  )}
                  {isAdmin && member.userId !== user.id && (
                    <SmartLink
                      href={`/klubber/${club.id}/fjern/${member.userId}`}
                      className="min-h-[44px] min-w-11 flex items-center justify-center font-sans text-xs text-danger hover:underline"
                    >
                      {t('removeLink')}
                    </SmartLink>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
