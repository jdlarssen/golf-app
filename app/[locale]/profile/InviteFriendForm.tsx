'use client';

import { useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  action: (formData: FormData) => void;
};

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
      <SubmitButton className="shrink-0" disabled={!hasEmail} pendingLabel="Sender …">
        Send
      </SubmitButton>
    </form>
  );
}
