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
  allowSelfRegistration = false,
}: {
  defaultEmail: string;
  next: string;
  /**
   * Server-resolved value of NEXT_PUBLIC_ALLOW_SELF_REGISTRATION. Controls
   * whether the helper sub-text invites new visitors to create an account.
   * Passed in (not read from `process.env` here) so the form stays
   * pure-client and doesn't depend on Next.js inlining behaviour for the
   * `NEXT_PUBLIC_*` envs at build time.
   */
  allowSelfRegistration?: boolean;
}) {
  return (
    <form action={sendCode} className="space-y-4">
      <input type="hidden" name="next" value={next} />
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
      />
    </form>
  );
}

function FormBody({
  defaultEmail,
  allowSelfRegistration,
}: {
  defaultEmail: string;
  allowSelfRegistration: boolean;
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

  return (
    <>
      <Input
        id="email"
        name="email"
        type="email"
        label={t('emailLabel')}
        autoComplete="email"
        defaultValue={defaultEmail}
        required
      />
      {allowSelfRegistration && (
        <p data-testid="self-reg-helper" className="text-sm text-muted -mt-1">
          {t('selfRegHelper')}
        </p>
      )}
      <Button type="submit" className="w-full mt-2">
        {t('submitButton')}
      </Button>
      <p className="text-xs text-muted mt-6 text-center">
        {t('footerNote')}
      </p>
    </>
  );
}
