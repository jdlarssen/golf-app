'use client';

import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { sendCode } from '../actions';

/**
 * Step 1 of the login flow. Captures the email and asks the server to send
 * an OTP code. While the server action is in flight, the form swaps to a
 * "Sender kode til ..."-state so users get immediate visual feedback —
 * Supabase + Resend round-trip can take 1–2 seconds and a silent button
 * is confusing on mobile.
 */
export function SendCodeForm({
  defaultEmail,
  next,
  invite = '',
  allowSelfRegistration = false,
  variant = 'default',
  hint,
}: {
  defaultEmail: string;
  next: string;
  /**
   * Invitasjons-token fra `?invite=` (#1169) — always-mounted hidden input
   * så sendCode kan videreføre den til verify-steget og kontekstkortet blir
   * stående. Tom streng → feltet sendes tomt og ignoreres server-side.
   */
  invite?: string;
  /**
   * Server-resolved value of NEXT_PUBLIC_ALLOW_SELF_REGISTRATION. Controls
   * whether the helper sub-text invites new visitors to create an account.
   * Passed in (not read from `process.env` here) so the form stays
   * pure-client and doesn't depend on Next.js inlining behaviour for the
   * `NEXT_PUBLIC_*` envs at build time.
   */
  allowSelfRegistration?: boolean;
  /**
   * `invite`: the form inside «Bli med på runden» on `/login?invite=…`
   * (#2266) — the artboard's 52 px field and button, a placeholder, and
   * `hint` under the button instead of the self-registration helper.
   */
  variant?: 'default' | 'invite';
  /** Shown under the button in the `invite` variant. */
  hint?: string;
}) {
  return (
    <form
      action={sendCode}
      className={variant === 'invite' ? 'flex flex-col gap-2.5' : 'space-y-4'}
    >
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="invite" value={invite} />
      {/*
        Honeypot: hidden from real users (display:none + aria-hidden +
        tabIndex=-1), not autofillable (autoComplete=off). Server-side
        silent-rejects when this field comes back populated — see actions.ts.
        Field name `website` chosen because bots tend to fill anything
        relevant-looking; we use the same field name on the admin invite
        form for consistency.
      */}
      <div aria-hidden="true" style={{ display: 'none' }}>
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      <FormBody
        defaultEmail={defaultEmail}
        allowSelfRegistration={allowSelfRegistration}
        variant={variant}
        hint={hint}
      />
    </form>
  );
}

function FormBody({
  defaultEmail,
  allowSelfRegistration,
  variant,
  hint,
}: {
  defaultEmail: string;
  allowSelfRegistration: boolean;
  variant: 'default' | 'invite';
  hint?: string;
}) {
  const { pending, data } = useFormStatus();
  const t = useTranslations('auth.sendCode');

  if (pending) {
    const submittedEmail =
      (data?.get('email') as string | null)?.trim() || defaultEmail;
    return (
      <div className="py-3 text-center space-y-2">
        <p className="font-serif text-base text-text">{t('pending')}</p>
        <p className="font-medium text-text break-words">{submittedEmail}</p>
        <div className="flex justify-center pt-1">
          <Spinner className="border-muted border-t-primary" />
        </div>
      </div>
    );
  }

  const invite = variant === 'invite';
  return (
    <>
      <Input
        id="email"
        name="email"
        type="email"
        label={t('emailLabel')}
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus
        defaultValue={defaultEmail}
        required
        {...(invite && {
          placeholder: t('emailPlaceholder'),
          labelClassName:
            'block text-[13px] font-semibold leading-[normal] text-text mb-1.5',
          inputClassName:
            'h-[52px] !border-[var(--invitation-field-border)]',
        })}
      />
      {allowSelfRegistration && !invite && (
        <p data-testid="self-reg-helper" className="text-sm text-muted -mt-1">
          {t('selfRegHelper')}
        </p>
      )}
      {invite ? (
        // `!`: Tailwind writes tracking-normal and shadow-none before the
        // Button base's tracking-tight and shadow-sm.
        <Button
          type="submit"
          className="w-full h-[52px] !font-semibold !tracking-normal !shadow-none"
        >
          {t('submitButton')}
        </Button>
      ) : (
        <Button type="submit" className="w-full mt-2">
          {t('submitButton')}
        </Button>
      )}
      {invite && hint && (
        <p
          data-testid="invite-send-hint"
          className="text-center text-[12px] leading-[normal] text-muted"
        >
          {hint}
        </p>
      )}
    </>
  );
}
