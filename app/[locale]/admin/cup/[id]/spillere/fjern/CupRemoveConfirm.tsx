import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { firstName } from '@/lib/firstName';
import { cupBasePath } from '@/lib/cup/cupPaths';
import { submitRemoveCupParticipant } from '@/lib/cup/planActions';

/**
 * Shared confirm page before an organiser removes a participant from a cup
 * (#2244), rendered by two routes:
 *  - `/admin/cup/[id]/spillere/fjern/[userId]` (variant="admin") — AdminShell.
 *  - `/klubber/[id]/cup/[cupId]/spillere/fjern/[userId]` (variant="club") —
 *    AppShell, so a club admin never leaves club chrome.
 *
 * The route gates (`requireAdminOrClubAdminOfCup`); this component authorizes
 * nothing. It reads with the admin client after that gate, like the Spillere
 * room itself, so the participant's name shows regardless of users-RLS.
 *
 * Removal is draft-only (`removeCupParticipant` answers `not_draft`). A cup that
 * has started shows that message and a way back instead of a button the server
 * is certain to refuse.
 */
export type CupRemoveVariant = 'admin' | 'club';

type UserRel = { name: string | null; nickname: string | null };

/**
 * `?error=` → banner text. A started cup gets the not-draft box instead, so no
 * banner then; other codes map to the Spillere room's own messages, and an
 * unknown code never reaches the page raw.
 */
function errorMessageFor(
  errorCode: string | undefined,
  isDraft: boolean,
  t: Awaited<ReturnType<typeof getTranslations<'cup'>>>,
): string | undefined {
  if (!errorCode || !isDraft) return undefined;
  return t(
    errorCode === 'not_found'
      ? 'participants.errors.not_found'
      : 'participants.errors.plan_save_failed',
  );
}

export async function CupRemoveConfirm({
  tournamentId,
  userId,
  variant,
  errorCode,
}: {
  tournamentId: string;
  userId: string;
  variant: CupRemoveVariant;
  errorCode?: string;
}) {
  const t = await getTranslations('cup');
  const admin = getAdminClient();

  const [cupRes, participantRes] = await Promise.all([
    admin
      .from('tournaments')
      .select('id, name, status, group_id')
      .eq('id', tournamentId)
      .maybeSingle(),
    admin
      .from('tournament_participants')
      .select(
        'user_id, is_captain, users:users!tournament_participants_user_id_fkey(name, nickname)',
      )
      .eq('tournament_id', tournamentId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  if (cupRes.error) throw cupRes.error;
  if (participantRes.error) throw participantRes.error;

  const cup = cupRes.data;
  if (!cup) notFound();
  // Not (or no longer) a participant: nothing to confirm.
  if (!participantRes.data) notFound();

  const rel = participantRes.data.users as UserRel | UserRel[] | null;
  const user = Array.isArray(rel) ? (rel[0] ?? null) : rel;
  const preferred = user?.nickname?.trim() || user?.name?.trim() || '';
  const name = preferred || t('manage.unknownPlayer');
  const first = firstName(preferred) ?? t('participants.remove.fallbackFirstName');
  const isCaptain = participantRes.data.is_captain === true;

  const isDraft = cup.status === 'draft';
  const errorMessage = errorMessageFor(errorCode, isDraft, t);

  const isClub = variant === 'club';
  const Shell = isClub ? AppShell : AdminShell;
  const backHref = `${cupBasePath(tournamentId, isClub ? cup.group_id : null)}/spillere`;

  return (
    <Shell>
      <TopBar backHref={backHref} kicker={t('ledger.kicker')} />
      <BrassRibbon kicker={t('participants.remove.brassRibbon')} />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('participants.remove.heading', { name, cup: cup.name })}
        </h1>
        {isDraft && (
          <>
            <p className="font-sans text-[14px] leading-relaxed text-text">
              {t('participants.remove.body', { firstName: first })}
              {isCaptain && <> {t('participants.remove.captain')}</>}
            </p>
            <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted">
              {t('participants.remove.canReAdd', { firstName: first })}
            </p>
          </>
        )}
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error" testId="cup-remove-error">
            {errorMessage}
          </Banner>
        </div>
      )}

      {!isDraft && (
        <div className="mt-5 rounded-xl border border-border bg-surface px-4 py-3.5">
          <p
            className="font-sans text-[13px] leading-relaxed text-text"
            data-testid="cup-remove-not-draft"
          >
            {t('participants.errors.not_draft')}
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2.5">
        {isDraft && (
          <form action={submitRemoveCupParticipant}>
            <input type="hidden" name="id" value={cup.id} />
            <input type="hidden" name="user_id" value={userId} />
            <SubmitButton
              className="w-full"
              style={{
                background: 'var(--danger-deep)',
                borderColor: 'var(--danger-deep)',
              }}
              pendingLabel={t('participants.remove.pending')}
              data-testid="cup-remove-confirm"
            >
              {t('participants.remove.confirmButton', { firstName: first })}
            </SubmitButton>
          </form>
        )}
        <SmartLink
          href={backHref}
          data-testid="cup-remove-cancel"
          className="flex min-h-[44px] items-center justify-center rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          {isDraft ? t('participants.remove.cancel') : t('participants.remove.back')}
        </SmartLink>
      </div>
    </Shell>
  );
}
