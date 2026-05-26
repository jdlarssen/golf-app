'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import {
  submitTeamRegistration,
  type TeamRegistrationResult,
  type TeamRegistrationError,
  type TeamSlotInput,
} from './teamActions';

const ERROR_MESSAGES: Record<TeamRegistrationError, string> = {
  not_authed: 'Du må logge inn for å melde deg på.',
  profile_incomplete: 'Du må fylle inn profilen din først.',
  game_not_found: 'Fant ikke spillet. Lenken kan være feil.',
  wrong_type: 'Dette spillet tar ikke imot lag-påmelding.',
  wrong_mode: 'Påmelding er ikke åpen for dette spillet.',
  game_locked: 'Spillet er startet eller avsluttet — påmelding er stengt.',
  mode_does_not_support_teams:
    'Spillmodusen støtter ikke lag. Velg solo-påmelding i stedet.',
  team_name_invalid: 'Lag-navnet må være 3–40 tegn.',
  slots_count_wrong: 'Feil antall medspillere. Fyll inn alle plassene.',
  duplicate_emails: 'Du har lagt inn samme e-post på flere plasser.',
  self_in_slots: 'Du kan ikke legge til deg selv som medspiller.',
  already_registered: 'Du er allerede påmeldt dette spillet.',
  db_error: 'Klarte ikke å fullføre handlingen. Prøv igjen om litt.',
};

type SlotState = {
  /** Toggle som styrer om feltet er en kjent bruker eller fri-tekst-e-post. */
  mode: 'lookup' | 'email';
  value: string;
};

export function TeamRegistrationForm({
  shortId,
  teamSize,
}: {
  shortId: string;
  /** Antall spillere per lag (kaptein + medspillere). Slots-rader = teamSize − 1. */
  teamSize: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [teamName, setTeamName] = useState('');
  const [slots, setSlots] = useState<SlotState[]>(() =>
    Array.from({ length: Math.max(teamSize - 1, 0) }, () => ({
      mode: 'lookup' as const,
      value: '',
    })),
  );
  const [result, setResult] = useState<TeamRegistrationResult | null>(null);
  const [website, setWebsite] = useState('');

  const slotCount = teamSize - 1;

  const updateSlot = (idx: number, patch: Partial<SlotState>) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    );
  };

  const handleSubmit = () => {
    setResult(null);
    const payloadSlots: TeamSlotInput[] = slots.map((s) => ({
      mode: s.mode,
      value: s.value.trim().toLowerCase(),
    }));
    startTransition(async () => {
      const res = await submitTeamRegistration({
        shortId,
        teamName: teamName.trim(),
        slots: payloadSlots,
        website,
      });
      setResult(res);
    });
  };

  // Suksess-state. Vi rendrer en oppsummering inline (i stedet for å
  // redirecte) så kaptein ser hvilke medspillere som ble lagt til OK
  // og hvilke som feilet — det er nyttig data for å re-prøve enkelt-
  // slots eller for å plukke opp ukjente e-poster manuelt.
  if (result?.ok) {
    const knownAdded = result.slotResults.filter(
      (r) => r.ok && r.outcome === 'known_added',
    );
    const invited = result.slotResults.filter(
      (r) => r.ok && r.outcome === 'unknown_invited',
    );
    const failed = result.slotResults.filter((r) => !r.ok);
    return (
      <div className="space-y-4">
        <Banner tone="success">
          Laget er opprettet. Du er kaptein for «{teamName.trim()}».
        </Banner>
        {knownAdded.length > 0 && (
          <p className="font-sans text-sm text-text">
            <strong>{knownAdded.length}</strong> medspiller
            {knownAdded.length === 1 ? '' : 'e'} er lagt til og får varsel.
          </p>
        )}
        {invited.length > 0 && (
          <p className="font-sans text-sm text-text">
            <strong>{invited.length}</strong> ukjent
            {invited.length === 1 ? '' : 'e'} fikk e-post-invitasjon.
          </p>
        )}
        {failed.length > 0 && (
          <Banner tone="warning">
            Disse plassene kom ikke gjennom:
            <ul className="mt-1 list-inside list-disc">
              {failed.map((f) => (
                <li key={f.email}>
                  {f.email} — {!f.ok ? f.reason : ''}
                </li>
              ))}
            </ul>
            Du kan fikse dem fra lag-oversikten.
          </Banner>
        )}
        <a
          href={`/påmelding/${shortId}/team`}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-primary px-[18px] py-2.5 font-medium tracking-tight text-white hover:bg-primary-hover dark:text-bg"
        >
          Gå til lag-oversikten
        </a>
      </div>
    );
  }

  const errorMessage =
    result && !result.ok ? ERROR_MESSAGES[result.error] : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="space-y-5"
      aria-label="Lag-påmeldings-skjema"
    >
      {/* Honeypot — usynlig for ekte brukere. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      <label className="block">
        <span className="mb-1.5 block font-sans text-xs font-medium tracking-tight text-muted">
          Lag-navn (3–40 tegn)
        </span>
        <input
          type="text"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          minLength={3}
          maxLength={40}
          required
          placeholder="«Birdie-jegerne»"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm tracking-tight text-text placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </label>

      <div className="space-y-3">
        <p className="font-sans text-xs uppercase tracking-[0.12em] text-muted">
          Medspillere ({slotCount} {slotCount === 1 ? 'plass' : 'plasser'})
        </p>
        {slots.map((slot, idx) => (
          <div
            key={idx}
            className="space-y-2 rounded-xl border border-border bg-surface/40 p-3"
          >
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 font-sans text-xs text-text">
                <input
                  type="radio"
                  name={`slot-${idx}-mode`}
                  checked={slot.mode === 'lookup'}
                  onChange={() => updateSlot(idx, { mode: 'lookup' })}
                  className="h-4 w-4 accent-primary"
                />
                Eksisterende spiller
              </label>
              <label className="flex items-center gap-1.5 font-sans text-xs text-text">
                <input
                  type="radio"
                  name={`slot-${idx}-mode`}
                  checked={slot.mode === 'email'}
                  onChange={() => updateSlot(idx, { mode: 'email' })}
                  className="h-4 w-4 accent-primary"
                />
                Inviter via e-post
              </label>
            </div>
            <input
              type="email"
              value={slot.value}
              onChange={(e) => updateSlot(idx, { value: e.target.value })}
              placeholder={
                slot.mode === 'lookup'
                  ? 'E-post til medspiller i Tørny'
                  : 'E-post — sender invitasjon'
              }
              required
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm tracking-tight text-text placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              aria-label={`Medspiller ${idx + 1}`}
            />
          </div>
        ))}
      </div>

      {errorMessage && <Banner tone="error">{errorMessage}</Banner>}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Sender…' : 'Meld på laget'}
      </Button>
    </form>
  );
}
