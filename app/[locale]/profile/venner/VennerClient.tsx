'use client';

import { useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SubmitButton as UiSubmitButton } from '@/components/ui/SubmitButton';

/**
 * Kopier-knapp for «legg til meg»-lenken. Bygger absolutt URL klient-side
 * (origin + path) så lenken virker uansett hvilket domene appen kjøres på.
 */
export function CopyLinkButton({
  path,
  copyLabel,
  copiedLabel,
  promptFallback,
}: {
  path: string;
  copyLabel: string;
  copiedLabel: string;
  promptFallback: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url =
      typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard kan være blokkert (eldre Safari/innstilling) — vis lenken
      // i en prompt som fallback så brukeren kan kopiere manuelt.
      window.prompt(promptFallback, url);
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={copy} className="shrink-0">
      {copied ? copiedLabel : copyLabel}
    </Button>
  );
}

/**
 * To-tap bekreftelse rundt en server-action (fjern venn / trekk forespørsel).
 * Første tap viser «Bekreft?»; bekreft sender skjemaet. Bevisst inline (ikke
 * dedikert side) — å fjerne en venn er lav-innsats og reversibelt (#369).
 */
export function ConfirmSubmit({
  action,
  hiddenName,
  hiddenValue,
  idleLabel,
  confirmLabel,
  cancelLabel,
  pendingLabel,
}: {
  action: (formData: FormData) => void;
  hiddenName: string;
  hiddenValue: string;
  idleLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  pendingLabel: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
        className="text-danger-deep"
      >
        {idleLabel}
      </Button>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name={hiddenName} value={hiddenValue} />
      <Button
        type="button"
        variant="ghost"
        onClick={() => setConfirming(false)}
      >
        {cancelLabel}
      </Button>
      <UiSubmitButton variant="danger" pendingLabel={pendingLabel}>
        {confirmLabel}
      </UiSubmitButton>
    </form>
  );
}

/**
 * E-post-felt + Send, knappen disabled til noe er tastet. Speiler
 * InviteFriendForm (#369-tvilling for venner).
 */
export function AddByEmailForm({
  action,
  label,
  placeholder,
  pendingLabel,
  buttonLabel,
}: {
  action: (formData: FormData) => void;
  label: string;
  placeholder: string;
  pendingLabel: string;
  buttonLabel: string;
}) {
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
          id="friend-email"
          name="email"
          type="email"
          label={label}
          labelHidden
          placeholder={placeholder}
          autoComplete="email"
          required
        />
      </div>
      <UiSubmitButton className="shrink-0" disabled={!hasEmail} pendingLabel={pendingLabel}>
        {buttonLabel}
      </UiSubmitButton>
    </form>
  );
}
