'use client';

import { type ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from './Button';

/**
 * Submit-knapp for <form action={…}>-flyter. Leser form-context (useFormStatus)
 * og mater Button.pending, så knappen bytter til pendingLabel + spinner og blir
 * disabled mens server-action-en kjører. Må rendres inni <form>.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} pending={pending} pendingLabel={pendingLabel}>
      {children}
    </Button>
  );
}
