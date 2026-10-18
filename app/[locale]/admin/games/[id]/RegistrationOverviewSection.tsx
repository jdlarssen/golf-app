import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { SmartLink } from '@/components/ui/SmartLink';
import { CopyShareLinkButton } from './CopyShareLinkButton';
import type { GameStatus } from '@/lib/games/status';
import { isPubliclyViewable, signupShareUrl } from '@/lib/games/publicSignupVisibility';

type Props = {
  gameId: string;
  registrationMode: 'invite_only' | 'manual_approval' | 'open';
  gameStatus: GameStatus;
  shortId: string;
  /** #2570: the share link hides once the organiser has closed signups. */
  signupsClosedAt: string | null;
  selfRegisteredCount: number;
};

/**
 * Server-component for «Påmelding»-seksjonen på admin/games/[id] (#199).
 * Telles pending-requests via en lett count-query. Vises for alle modi:
 * invite_only tar nå imot «be om å bli med»-forespørsler (#368), så
 * arrangøren trenger en stående vei til dem her — ikke bare via varsel.
 *
 * `selfRegisteredCount` regnes ut hos caller (vi har allerede game_players-
 * raden ut fra players-fetchen i page.tsx — ingen ny round-trip her).
 *
 * #2288: «Steng påmeldingen» lives on the signups page only (one door per
 * room, #344); this card links there.
 */
export async function RegistrationOverviewSection({
  gameId,
  registrationMode,
  gameStatus,
  shortId,
  signupsClosedAt,
  selfRegisteredCount,
}: Props) {
  const supabase = await getServerClient();
  const t = await getTranslations('admin.game.registration');

  // Pending-telleren gjelder request-modiene (manual_approval + invite_only).
  // For open viser vi i stedet "antall selv-påmeldte spillere" som caller
  // har regnet ut.
  // #2293: null = the count failed. «Venter» is then hidden rather than
  // claiming 0 are waiting (same rule as the «Styr spillere» link, #2440).
  let pendingCount: number | null = 0;
  if (
    registrationMode === 'manual_approval' ||
    registrationMode === 'invite_only'
  ) {
    const { count, error } = await supabase
      .from('game_registration_requests')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', gameId)
      .eq('status', 'pending');
    if (error) {
      console.error('[RegistrationOverviewSection] count failed', error);
      pendingCount = null;
    } else {
      pendingCount = count ?? 0;
    }
  }

  const shareUrl = signupShareUrl(shortId);
  // #2570: the same rule as the poster and the public page: a link to a
  // closed, private or unpublished signup leads nowhere.
  const showShareLink = isPubliclyViewable({
    status: gameStatus,
    registration_mode: registrationMode,
    signups_closed_at: signupsClosedAt,
  });
  const modeLabel =
    registrationMode === 'open'
      ? t('modeFreeSignup')
      : registrationMode === 'invite_only'
        ? t('modeInviteOnly')
        : t('modeManualApproval');

  return (
    <section className="mt-1.5">
      <MiniRibbon>{t('sectionLabel')}</MiniRibbon>
      <div
        className="overflow-hidden rounded-xl border border-border bg-surface"
        style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
      >
        <div className="space-y-3 px-3.5 pb-3.5 pt-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                {t('modusLabel')}
              </p>
              <p className="mt-0.5 font-serif text-[15px] text-text">
                {modeLabel}
              </p>
            </div>
            {registrationMode !== 'open' ? (
              pendingCount !== null && (
                <div className="text-right" data-testid="pending-block">
                  <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    {t('waitingLabel')}
                  </p>
                  <p
                    className="mt-0.5 font-serif text-[20px] font-medium tabular-nums text-text"
                    data-testid="pending-count"
                  >
                    {pendingCount}
                  </p>
                </div>
              )
            ) : (
              <div className="text-right">
                <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {t('enrolledLabel')}
                </p>
                <p className="mt-0.5 font-serif text-[20px] font-medium tabular-nums text-text">
                  {selfRegisteredCount}
                </p>
              </div>
            )}
          </div>

          {/* invite_only er privat — ikke nudge arrangøren til å kringkaste
              lenken. Forespørsel-veien (#368) tjener folk som alt har den.
              #2445: only on a scheduled game; on a draft both links 404 for
              everyone else. #2570: and not after «Steng påmeldingen»
              (isPubliclyViewable, shared with «Styr spillere»). */}
          {showShareLink && (
            <>
              <CopyShareLinkButton shareUrl={shareUrl} />
              <SmartLink
                href={`/signup/${shortId}/plakat`}
                className="block min-h-[44px] rounded-full border border-border bg-surface px-4 py-3 text-center text-sm font-medium tracking-tight text-text transition-colors hover:bg-primary-soft"
                data-testid="poster-link"
              >
                {t('posterLink')}
              </SmartLink>
            </>
          )}

          <SmartLink
            href={`/admin/games/${gameId}/signups`}
            className="block min-h-[44px] rounded-full border border-border bg-surface px-4 py-3 text-center text-sm font-medium tracking-tight text-text transition-colors hover:bg-primary-soft"
          >
            {t('viewAllSignups')}
          </SmartLink>
        </div>
      </div>
    </section>
  );
}
