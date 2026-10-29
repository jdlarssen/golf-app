import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { formatListLocale } from '@/lib/i18n/format';
import { invitationWhen } from '@/lib/games/invitationCard';
import { firstNamesLine } from '@/lib/games/signupInbox';
import { CANCEL_MESSAGE_MAX } from '@/lib/games/gameCancellation';
import { deleteGame } from './actions';

const ERROR_CODES = ['delete_failed', 'message_too_long'] as const;
type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * «Avlys runden?» (#2481, artboard `Nyttspill-forslag-avlys`): the delete page
 * of a scheduled round with players to tell. Both delete routes render it, the
 * organiser's in `AppShell` and admin's in the Sekretariat frame; each route
 * gates first and passes its own top bar as `header`.
 *
 * Who hears it, how many, and a field for an optional greeting, then «Avlys og
 * si fra» in a tray at the foot of the screen, as the artboard draws it (the
 * bottom nav hides, `data-hides-bottom-nav`). The textarea and the button share
 * one form posting to `deleteGame`, which reads the recipients again itself.
 * Still a page of its own, never a popup (destructive-flow rule).
 *
 * «Flytt runden» on the artboard waits for #2480.
 */
export async function CancelRoundConfirm({
  header,
  gameId,
  teeOffAt,
  courseName,
  recipientNames,
  errorCode,
  keepHref,
  trayClassName = 'bg-bg',
}: {
  /** The route's top bar, inside the full-height column. */
  header: ReactNode;
  gameId: string;
  teeOffAt: string | null;
  courseName: string | null;
  /** `users.name` per recipient, in the page's order; `null` for no name. */
  recipientNames: readonly (string | null)[];
  errorCode: string | undefined;
  /** «Behold runden»: back to where the page was opened from. */
  keepHref: string;
  /** The tray's fill: the shell's own background. */
  trayClassName?: string;
}) {
  const t = await getTranslations('game.cancel');
  const locale = (await getLocale()) as AppLocale;

  const when = invitationWhen(teeOffAt, locale);
  const whenLine = [
    when ? `${when.weekday.charAt(0).toUpperCase()}${when.weekday.slice(1)} ${when.date}` : null,
    when?.time ?? null,
    courseName,
  ]
    .filter(Boolean)
    .join(' · ');

  const names = firstNamesLine(
    recipientNames.map((n) => n ?? t('unnamedPlayer')),
    3,
  );
  const namesLine = formatListLocale(
    names.rest > 0 ? [...names.firstNames, t('more', { count: names.rest })] : names.firstNames,
    locale,
  );

  const error = ERROR_CODES.includes(errorCode as ErrorCode)
    ? t(`errors.${errorCode as ErrorCode}`, { max: CANCEL_MESSAGE_MAX })
    : null;

  return (
    <form
      action={deleteGame}
      data-hides-bottom-nav
      data-testid="cancel-round"
      // The column fills the screen below the shell's top padding (the top
      // bar inside it pulls itself up into that padding), so the tray stands
      // at the foot of the screen even when the page is short.
      className="flex min-h-[calc(100dvh-2rem)] flex-col"
    >
      {header}
      <input type="hidden" name="gameId" value={gameId} />

      <h1 className="font-serif text-[26px] font-medium leading-[1.15]">{t('heading')}</h1>
      {whenLine && <p className="mt-1.5 text-xs leading-[1.45] text-muted">{whenLine}</p>}

      <p className="mt-[18px] mb-2 font-sans text-[10px] font-semibold uppercase leading-[normal] tracking-[0.2em] text-muted">
        {t('sectionLabel')}
      </p>
      <div className="-mx-1 overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex min-h-[60px] items-center gap-3 border-b border-row-divider-warm px-3.5 py-2.5">
          <span className="min-w-0 grow">
            <span className="block text-[15px] font-semibold leading-[normal]" data-testid="cancel-round-names">
              {namesLine}
            </span>
            <span className="mt-0.5 block text-xs leading-[normal] text-muted">{t('notifiedVia')}</span>
          </span>
          <span className="shrink-0 text-[13px] leading-[normal] text-muted tabular-nums">
            {t('playerCount', { count: recipientNames.length })}
          </span>
        </div>
        <div className="flex flex-col gap-1.5 px-3.5 py-3">
          <label htmlFor="cancel-message" className="text-[13px] font-semibold leading-[normal]">
            {t('messageLabel')}
          </label>
          <textarea
            id="cancel-message"
            name="message"
            maxLength={CANCEL_MESSAGE_MAX}
            rows={3}
            placeholder={t('messagePlaceholder')}
            className="min-h-[76px] rounded-xl border border-field-border bg-surface px-3 py-2.5 text-[15px] leading-[1.4] text-text placeholder:text-muted"
          />
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-[1.45] text-muted">{t('permanentNote')}</p>

      {/* The tray follows the foot of the screen: `-mx-5` reaches the screen
          edges past the shell's 20 px, and the negative bottom margin cancels
          the shell's bottom padding (kept for a bottom nav that is hidden
          here). `data-sticky-tray` gives a focused field room above it. */}
      <div
        data-sticky-tray
        className={`sticky bottom-0 z-20 -mx-5 mt-auto -mb-[calc(5rem+env(safe-area-inset-bottom,0px))] flex flex-col gap-1.5 border-t border-border px-4 pt-3 pb-[calc(22px+env(safe-area-inset-bottom,0px))] ${trayClassName}`}
      >
        {error && <Banner tone="error">{error}</Banner>}
        <SubmitButton
          variant="danger"
          size="large"
          className="w-full"
          pendingLabel={t('submitPending')}
          data-testid="cancel-round-submit"
        >
          {t('submit')}
        </SubmitButton>
        <SmartLink
          href={keepHref}
          className="flex h-11 items-center justify-center rounded-full text-sm font-semibold leading-[normal] text-primary"
        >
          {t('keep')}
        </SmartLink>
      </div>
    </form>
  );
}
