'use client';

import { useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { sendCode, verifyCode } from '../actions';

// Supabase's default OTP length is 8 digits (per v0.4.1 fix). When the
// input reaches this length — typically via iOS Safari's auto-fill from
// Mail.app suggestion, or paste — we auto-submit the form so users don't
// have to tap "Logg inn" manually. The double-tap pattern was causing
// "code expired" errors when iOS auto-fill + manual tap consumed the OTP
// twice.
const OTP_LENGTH = 8;

export function VerifyCodeForm({
  email,
  next,
}: {
  email: string;
  next: string;
  /** @deprecated No longer used — resend is now an inline form action. */
  resendHref?: string;
}) {
  return (
    // Resend-knappen er i et separat <form> UNDER verify-skjemaet for å unngå
    // nøstede <form>-elementer (ugyldig HTML) og kollisjon med verifyCode-
    // action og «token required»-validering.
    <div className="space-y-4">
      <form action={verifyCode} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <FormBody email={email} />
      </form>
      <form action={sendCode} className="text-center">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <ResendFooter />
      </form>
    </div>
  );
}

function FormBody({ email }: { email: string }) {
  const { pending } = useFormStatus();
  const t = useTranslations('auth.verifyCode');

  if (pending) {
    return (
      <div className="py-3 text-center space-y-2">
        <p className="font-serif text-base text-text">{t('pending')}</p>
        <div className="flex justify-center pt-1">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-muted">
        {t('instructionPrefix')}{' '}
        <strong className="text-foreground">{email}</strong>
        {t('instructionSuffix')}
      </p>
      <p className="text-xs text-muted -mt-1">
        {t('spamHint')}
      </p>
      <CodeInput />
      <Button type="submit" className="w-full mt-2">
        {t('submitButton')}
      </Button>
    </>
  );
}

function ResendFooter() {
  const { pending } = useFormStatus();
  const t = useTranslations('auth.verifyCode');
  return (
    <p className="text-xs text-muted mt-2">
      {t('resendPrompt')}{' '}
      <button
        type="submit"
        disabled={pending}
        className="underline text-xs text-muted disabled:opacity-50"
      >
        {t('resendLink')}
      </button>
    </p>
  );
}

function CodeInput() {
  const { pending } = useFormStatus();
  const t = useTranslations('auth.verifyCode');
  // Belt-and-suspenders guard against double-submit: useFormStatus.pending
  // flips asynchronously after requestSubmit, so there's a brief window
  // where pending is still false but we've already triggered the action.
  // iOS Safari also occasionally fires its own auto-submit after auto-fill;
  // this ref blocks any further requestSubmit calls from this component
  // until the page navigates away.
  const submittedRef = useRef(false);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (pending || submittedRef.current) return;
    // Strip non-digits in case iOS auto-fill pastes a code with spaces
    // (the mail template formats it as "1234 5678" — Safari has been
    // observed to occasionally include the space).
    const digitsOnly = e.target.value.replace(/\D/g, '');
    if (digitsOnly !== e.target.value) {
      e.target.value = digitsOnly;
    }
    if (digitsOnly.length === OTP_LENGTH && e.target.form) {
      submittedRef.current = true;
      e.target.form.requestSubmit();
    }
  }

  return (
    <Input
      id="token"
      name="token"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6,8}"
      maxLength={OTP_LENGTH}
      label={t('codeLabel')}
      required
      autoFocus
      onChange={onChange}
      disabled={pending}
    />
  );
}

function Spinner() {
  const t = useTranslations('auth.verifyCode');
  return (
    <span
      aria-label={t('spinnerLabel')}
      role="status"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary"
    />
  );
}
