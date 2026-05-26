'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import {
  registerForOpenGame,
  requestApproval,
  type ActionError,
  type ActionResult,
} from './actions';

type Mode = 'open' | 'manual_approval';

const ERROR_MESSAGES: Record<ActionError, string> = {
  not_authed: 'Du må logge inn for å melde deg på.',
  profile_incomplete: 'Du må fylle inn profilen din først.',
  game_not_found: 'Fant ikke spillet. Lenken kan være feil.',
  wrong_mode: 'Påmelding er ikke åpen for dette spillet.',
  game_locked: 'Spillet er startet eller avsluttet — påmelding er stengt.',
  already_registered: 'Du er allerede påmeldt dette spillet.',
  already_requested: 'Du har allerede sendt en forespørsel.',
  message_too_long: 'Hilsenen er for lang (maks 200 tegn).',
  team_not_supported_yet:
    'Lag-påmelding kommer i neste versjon. Be arrangøren om å invitere deg direkte i mellomtiden.',
  rate_limited:
    'Du har gjort for mange påmeldinger den siste tida. Prøv igjen senere.',
  db_error: 'Klarte ikke å fullføre handlingen. Prøv igjen om litt.',
};

const MESSAGE_MAX = 200;

export function RegistrationForm({
  mode,
  shortId,
}: {
  mode: Mode;
  shortId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [message, setMessage] = useState('');

  const handleSubmit = (form: HTMLFormElement) => {
    const data = new FormData(form);
    data.set('shortId', shortId);
    startTransition(async () => {
      const action =
        mode === 'open' ? registerForOpenGame : requestApproval;
      const res = await action(data);
      setResult(res);
    });
  };

  // Manual-approval suksess viser kvittering i stedet for form. Open-mode
  // suksess redirecter via server-action, så vi når aldri hit i den grenen.
  if (result?.ok && mode === 'manual_approval') {
    return (
      <Banner tone="success">
        Forespørsel sendt — arrangøren får varsel og bestemmer seg så snart
        de kan. Du får beskjed via varsel og mail.
      </Banner>
    );
  }

  const errorMessage =
    result && !result.ok ? ERROR_MESSAGES[result.error] : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit(e.currentTarget);
      }}
      className="space-y-4"
    >
      {/* Honeypot — skjult fra ekte brukere via aria-hidden + tabIndex.
          Form-filling bots populerer felt med plausible navn (website,
          url, homepage). Server-action short-circuiter til success-shape
          uten DB-write hvis dette har verdi. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      {mode === 'manual_approval' && (
        <label className="block">
          <span className="mb-1.5 block font-sans text-xs font-medium tracking-tight text-muted">
            Valgfri hilsen til arrangøren
          </span>
          <textarea
            name="message"
            rows={3}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="«Hei! Jeg er kompis av Per — håper det er plass.»"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm tracking-tight text-text placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <span className="mt-1 block text-right font-sans text-[11px] tabular-nums text-muted">
            {message.length}/{MESSAGE_MAX}
          </span>
        </label>
      )}

      {errorMessage && <Banner tone="error">{errorMessage}</Banner>}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending
          ? 'Sender…'
          : mode === 'open'
            ? 'Meld meg på'
            : 'Send forespørsel'}
      </Button>
    </form>
  );
}
