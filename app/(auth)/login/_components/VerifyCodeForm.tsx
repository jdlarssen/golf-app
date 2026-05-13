'use client';

import { useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { verifyCode } from '../actions';

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
  resendHref,
}: {
  email: string;
  next: string;
  resendHref: string;
}) {
  return (
    <form action={verifyCode} className="space-y-4">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <FormBody email={email} resendHref={resendHref} />
    </form>
  );
}

function FormBody({
  email,
  resendHref,
}: {
  email: string;
  resendHref: string;
}) {
  const { pending } = useFormStatus();

  if (pending) {
    return (
      <div className="py-3 text-center space-y-2">
        <p className="font-serif text-base text-text">Logger inn …</p>
        <div className="flex justify-center pt-1">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-muted">
        Skriv inn koden vi sendte til{' '}
        <strong className="text-foreground">{email}</strong>.
      </p>
      <CodeInput />
      <Button type="submit" className="w-full mt-2">
        Logg inn
      </Button>
      <p className="text-xs text-muted mt-6 text-center">
        Fikk du ikke koden?{' '}
        <a href={resendHref} className="underline">
          Send ny kode
        </a>
      </p>
    </>
  );
}

function CodeInput() {
  const { pending } = useFormStatus();
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
      label="Kode"
      required
      autoFocus
      onChange={onChange}
      disabled={pending}
    />
  );
}

function Spinner() {
  return (
    <span
      aria-label="Laster"
      role="status"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary"
    />
  );
}
