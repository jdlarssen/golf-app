'use client';

import { useFormStatus } from 'react-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
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
}: {
  defaultEmail: string;
  next: string;
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
      <FormBody defaultEmail={defaultEmail} />
    </form>
  );
}

function FormBody({ defaultEmail }: { defaultEmail: string }) {
  const { pending, data } = useFormStatus();

  if (pending) {
    const submittedEmail =
      (data?.get('email') as string | null)?.trim() || defaultEmail;
    return (
      <div className="py-3 text-center space-y-2">
        <p className="font-serif text-base text-text">Sender kode til</p>
        <p className="font-medium text-text break-words">{submittedEmail}</p>
        <div className="flex justify-center pt-1">
          <Spinner />
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
        label="E-post"
        autoComplete="email"
        defaultValue={defaultEmail}
        required
      />
      <Button type="submit" className="w-full mt-2">
        Send meg kode
      </Button>
      <p className="text-xs text-muted mt-6 text-center">
        Vi sender deg en kode på mail.
      </p>
    </>
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
