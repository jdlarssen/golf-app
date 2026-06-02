'use client';

import { useState, type FormEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

type Props = {
  action: (formData: FormData) => void;
};

/**
 * Send button sized to sit inline next to the email field: disabled until an
 * email is typed, and switches to 'Sender …' while the action is in flight so
 * a second tap can't fire a duplicate submission.
 */
function SendButton({ canSubmit }: { canSubmit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="shrink-0" disabled={pending || !canSubmit}>
      {pending ? 'Sender …' : 'Send'}
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
    <form
      action={action}
      onChange={handleChange}
      className="flex items-stretch gap-2"
    >
      <div className="flex-1">
        <Input
          id="email"
          name="email"
          type="email"
          label="E-post"
          labelHidden
          placeholder="venn@epost.no"
          autoComplete="email"
          required
        />
      </div>
      <SendButton canSubmit={hasEmail} />
    </form>
  );
}
