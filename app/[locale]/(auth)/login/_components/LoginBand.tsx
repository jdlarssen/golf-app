import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/** The invitation on the code step, ready to show (#2349). */
export type LoginBandInvite = {
  /** «ML»; `null` when the inviter has no name, and then no circle. */
  initials: string | null;
  /** «Marte har invitert deg» / «Du er invitert». */
  title: string;
  /** «Lørdagsrunden · lør. 4. okt kl. 09:20». */
  line: string;
};

/**
 * The forest band at the top of the login (#2349, artboard
 * «Innlogging-forslag»): the wordmark as text, as the invitation page draws it
 * (#2266). Pure presentation.
 *
 * - Step 1: the wordmark is the page's `h1` (e2e looks for the heading
 *   «Tørny»), with the language switch beside it and the tagline under.
 * - The code step: the wordmark is a `p` (the step's `h1` is «Skriv inn koden
 *   fra mailen»), and an invitation from `?invite=` stands in a light box.
 *
 * Edge to edge on a phone; from 28rem, where the column stops filling the
 * screen, it becomes a rounded card — the front page's green top (#2261) does
 * the same.
 */
export function LoginBand({
  wordmarkAs,
  aside,
  tagline,
  invite,
}: {
  wordmarkAs: 'h1' | 'p';
  aside?: ReactNode;
  tagline?: ReactNode;
  invite?: LoginBandInvite | null;
}) {
  const t = useTranslations('common');
  const Wordmark = wordmarkAs;

  return (
    <header
      data-focus-surface="strong"
      data-testid="login-band"
      className="flex flex-col gap-2.5 bg-surface-strong px-5 pt-[22px] pb-5 text-on-strong min-[28rem]:mt-6 min-[28rem]:rounded-[28px]"
    >
      <div className="flex items-center justify-between gap-3">
        <Wordmark className="m-0 font-serif text-[22px] leading-[normal] font-semibold">
          {t('appName')}
        </Wordmark>
        {aside}
      </div>
      {tagline && <p className="text-[14px] leading-[20px] text-on-strong/85">{tagline}</p>}
      {invite && (
        <div
          data-testid="login-band-invite"
          className="flex items-center gap-3 rounded-[14px] bg-on-strong/10 p-3"
        >
          {invite.initials && (
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-on-strong text-[14px] leading-[normal] font-semibold text-surface-strong"
            >
              {invite.initials}
            </span>
          )}
          <div className="min-w-0 text-[14px] leading-[1.4]">
            <p className="font-semibold">{invite.title}</p>
            <p className="text-on-strong/85">{invite.line}</p>
          </div>
        </div>
      )}
    </header>
  );
}
