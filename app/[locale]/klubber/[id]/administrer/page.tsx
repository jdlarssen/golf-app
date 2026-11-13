import { first } from '@/lib/url/searchParams';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { after } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatDate } from '@/lib/i18n/format';
import { getServerClient } from '@/lib/supabase/server';
import { getClubDetail } from '@/lib/clubs/getClubDetail';
import { markReadOnVisit } from '@/lib/notifications/markRead';
import { isClubExpired } from '@/lib/clubs/clubStatus';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Input } from '@/components/ui/Input';
import { CopyJoinLinkButton } from '../CopyJoinLinkButton';
import { addMember, decideRequest, cancelInvitation } from '../actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{
  added?: string | string[];
  invited?: string | string[];
  mail?: string | string[];
  cancelled?: string | string[];
  error?: string | string[];
  email?: string | string[];
  decided?: string | string[];
}>;

/**
 * /klubber/[id]/administrer — the club's back room for owner and admin
 * (#2326): pending join requests, pending email invitations, «Legg til
 * medlem» and the club link. Moved here from /klubber/[id], which keeps one
 * door to it. The actions in `../actions.ts` land back here with their result
 * banner (?added= / ?invited= / ?cancelled= / ?error= / ?decided=).
 *
 * A member who is not owner or admin is sent to the club page; a non-member
 * gets 404, as on the club page. The club link and «Legg til medlem» are
 * hidden in an expired club (#50).
 */
export default async function KlubbAdministrerPage({
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

  // #2326: the `club_join_request` varsel opens this page. #2759: it is marked
  // read once nobody waits any longer. Before the membership gate, as on the
  // club page.
  after(() => markReadOnVisit({ userId: user.id, surface: 'clubManage', entityId: id }));

  const detail = await getClubDetail(supabase, id, user.id);
  if (!detail) notFound();

  const { club, myRole, pendingRequests, pendingInvitations } = detail;
  if (myRole !== 'owner' && myRole !== 'admin') redirect({ href: `/klubber/${id}`, locale });

  const frozen = isClubExpired(club.valid_until);

  const addedEmail = first(sp.added);
  const invitedEmail = first(sp.invited);
  const invitedMailFailed = first(sp.mail) === 'failed';
  const cancelledCode = first(sp.cancelled);
  const errorCode = first(sp.error);
  const errorEmail = first(sp.email);
  const decidedCode = first(sp.decided);

  const t = await getTranslations('klubb.room');

  // Build error message for the add-member form.
  function getErrorMessage(): string {
    if (!errorCode) return t('errors.fallback');
    switch (errorCode) {
      case 'not_found':
        return errorEmail
          ? t('errors.not_found', { email: errorEmail })
          : t('errors.not_found_generic');
      case 'already':
        return errorEmail
          ? t('errors.already', { email: errorEmail })
          : t('errors.already_generic');
      case 'full':
        return club.member_cap
          ? t('errors.full', { cap: club.member_cap })
          : t('errors.full_generic');
      default:
        return t(`errors.${errorCode}` as Parameters<typeof t>[0], undefined as never) ?? t('errors.fallback');
    }
  }

  // Build decided banner message.
  function getDecidedMessage(): { tone: 'success' | 'error'; text: string } | null {
    if (!decidedCode) return null;
    switch (decidedCode) {
      case 'approved': return { tone: 'success', text: t('decided.approved') };
      case 'rejected': return { tone: 'success', text: t('decided.rejected') };
      case 'not_auth': return { tone: 'error', text: t('decided.not_auth') };
      case 'already': return { tone: 'error', text: t('decided.already') };
      case 'not_found': return { tone: 'error', text: t('decided.not_found') };
      case 'club_full': return {
        tone: 'error',
        text: club.member_cap
          ? t('decided.club_full', { cap: club.member_cap })
          : t('decided.club_full_generic'),
      };
      case 'club_expired': return { tone: 'error', text: t('decided.club_expired') };
      default: return { tone: 'error', text: t('decided.unknown') };
    }
  }

  const decidedBanner = getDecidedMessage();

  const joinUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://tornygolf.no'}/klubber/bli-med/${club.short_id}`;

  return (
    <AppShell>
      <TopBar backHref={`/klubber/${club.id}`} kicker={club.name} />
      <PageHeader title={t('manageDoor')} />

      {addedEmail && (
        <div className="mb-6">
          <Banner tone="success">{t('addedBanner', { email: addedEmail })}</Banner>
        </div>
      )}

      {invitedEmail && (
        <div className="mb-6">
          <Banner tone={invitedMailFailed ? 'warning' : 'success'}>
            {invitedMailFailed
              ? t('invitedMailFailedBanner', { email: invitedEmail })
              : t('invitedBanner', { email: invitedEmail })}
          </Banner>
        </div>
      )}

      {cancelledCode && (
        <div className="mb-6">
          <Banner tone={cancelledCode === 'ok' ? 'success' : 'error'}>
            {cancelledCode === 'ok'
              ? t('cancelledBanner')
              : t('cancelledErrorBanner')}
          </Banner>
        </div>
      )}

      {errorCode && (
        <div className="mb-6">
          <Banner tone="error">{getErrorMessage()}</Banner>
        </div>
      )}

      {decidedBanner && (
        <div className="mb-6">
          <Banner tone={decidedBanner.tone}>{decidedBanner.text}</Banner>
        </div>
      )}

      {frozen && (
        <div className="mb-6">
          <Banner tone="warning">{t('frozenBanner')}</Banner>
        </div>
      )}

      {/* Pending join requests */}
      {pendingRequests.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-sans text-xs font-semibold text-muted">
            {t('requestsHeading', { count: pendingRequests.length })}
          </h2>
          <div className="space-y-2">
            {pendingRequests.map((req) => (
              <Card key={req.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-sans text-[15px] font-medium text-text">
                      {req.requesterName}
                    </span>
                    <span className="font-sans text-xs text-muted">
                      {formatDate(req.requestedAt, locale, {
                        timeZone: 'Europe/Oslo',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    {req.message && (
                      <span className="mt-1 break-words font-sans text-sm text-muted">
                        {req.message}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={decideRequest}>
                      <input type="hidden" name="requestId" value={req.id} />
                      <input type="hidden" name="groupId" value={club.id} />
                      <input type="hidden" name="approve" value="true" />
                      <SubmitButton
                        className="min-h-[44px] px-4 text-sm"
                        pendingLabel={t('approvePending')}
                      >
                        {t('approveButton')}
                      </SubmitButton>
                    </form>
                    <form action={decideRequest}>
                      <input type="hidden" name="requestId" value={req.id} />
                      <input type="hidden" name="groupId" value={club.id} />
                      <input type="hidden" name="approve" value="false" />
                      <SubmitButton
                        variant="secondary"
                        className="min-h-[44px] px-4 text-sm"
                        pendingLabel={t('rejectPending')}
                      >
                        {t('rejectButton')}
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Pending email invitations (#644) */}
      {pendingInvitations.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-sans text-xs font-semibold text-muted">
            {t('invitationsHeading', { count: pendingInvitations.length })}
          </h2>
          <div className="space-y-2">
            {pendingInvitations.map((inv) => (
              <Card key={inv.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-sans text-[15px] font-medium text-text">
                      {inv.email}
                    </span>
                    <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 font-sans text-xs text-muted">
                      {t('invitationPendingBadge')}
                    </span>
                  </div>
                  <div className="flex shrink-0">
                    <form action={cancelInvitation}>
                      <input type="hidden" name="invitationId" value={inv.id} />
                      <input type="hidden" name="groupId" value={club.id} />
                      <SubmitButton
                        variant="secondary"
                        className="min-h-[44px] px-4 text-sm"
                        pendingLabel={t('cancelInvitePending')}
                      >
                        {t('cancelInviteButton')}
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Admin controls — hidden when the club is frozen (no new members).
          #1135: the add-by-email and share-link cards are merged into one
          invite section, split by a divider, since both do the same job. */}
      {!frozen && (
        <section className="mb-8" data-testid="club-invite-section">
          <h2 className="mb-3 font-sans text-xs font-semibold text-muted">
            {t('inviteHeading')}
          </h2>
          <Card className="space-y-4">
            {/* Add member by email */}
            <div className="space-y-3">
              <h3 className="font-sans text-[13px] font-semibold text-text">
                {t('addMemberHeading')}
              </h3>
              <form action={addMember} className="space-y-4">
                <input type="hidden" name="groupId" value={club.id} />
                <Input
                  id="member-email"
                  name="email"
                  type="email"
                  label={t('emailLabel')}
                  placeholder={t('emailPlaceholder')}
                  defaultValue={errorEmail ?? ''}
                  autoComplete="off"
                  hint={t('emailHint')}
                />
                <SubmitButton className="w-full" pendingLabel={t('addMemberPending')}>
                  {t('addMemberButton')}
                </SubmitButton>
              </form>
            </div>

            {/* Join link */}
            <div className="space-y-2 border-t border-border pt-4">
              <h3 className="font-sans text-[13px] font-semibold text-text">
                {t('joinLinkHeading')}
              </h3>
              <p className="font-sans text-sm text-muted">
                {t('joinLinkDescription')}
              </p>
              <CopyJoinLinkButton joinUrl={joinUrl} />
            </div>
          </Card>
        </section>
      )}

    </AppShell>
  );
}
