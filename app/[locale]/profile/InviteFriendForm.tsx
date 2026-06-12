'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';

type Props = {
  action: (formData: FormData) => void;
};

export function InviteFriendForm({ action }: Props) {
  const t = useTranslations('profile.inviteForm');
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
          label={t('emailLabel')}
          labelHidden
          placeholder={t('emailPlaceholder')}
          autoComplete="email"
          required
        />
      </div>
      <SubmitButton className="shrink-0" disabled={!hasEmail} pendingLabel={t('sendPending')}>
        {t('sendButton')}
      </SubmitButton>
    </form>
  );
}
