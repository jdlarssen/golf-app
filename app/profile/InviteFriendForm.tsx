'use client';

import { useState, type FormEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

type Props = {
  action: (formData: FormData) => void;
};

/**
 * Send button: disabled until an email has been typed, and switches to
 * 'Sender …' while the action is in flight so the user sees something
 * happening and a second tap can't fire a duplicate submission.
 */
function SendButton({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending || !canSubmit}>
      {pending ? 'Sender …' : 'Send invitasjon'}
    </Button>
  );
}

export function InviteFriendForm({ action }: Props) {
  const [hasEmail, setHasEmail] = useState(false);

  function handleChange(e: FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    setHasEmail(String(fd.get('email') ?? '').trim().length > 0);
  }

  return (
    <form action={action} onChange={handleChange} className="space-y-3">
      <Input
        id="email"
        name="email"
        type="email"
        label="E-post"
        autoComplete="email"
        required
      />
      <SendButton canSubmit={hasEmail} />
      <p className="text-xs text-muted text-center">
        Vi sender vennen en mail med en lenke. De kan lage konto med ett klikk.
      </p>
    </form>
  );
}
