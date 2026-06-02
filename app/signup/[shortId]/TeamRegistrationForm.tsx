'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { maskEmail } from '@/lib/users/maskEmail';
import type { TeamCandidate } from '@/lib/users/getTeamCandidates';
import {
  validateTeamName,
  validateSlotEmail,
  findSlotConflicts,
} from './teamFormValidation';
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
  rate_limited:
    'Du har gjort for mange påmeldinger den siste tida. Prøv igjen senere.',
  db_error: 'Klarte ikke å fullføre handlingen. Prøv igjen om litt.',
};

const MAX_SUGGESTIONS = 6;

type SlotState = {
  /** Toggle som styrer om feltet er en kjent bruker eller fri-tekst-e-post. */
  mode: 'lookup' | 'email';
  /** E-posten som submittes — typet fri-tekst eller valgt fra autocomplete. */
  value: string;
  /** Satt når kapteinen har valgt en co-player fra autocomplete-lista. */
  selected: { name: string; email: string } | null;
};

function candidateLabel(c: TeamCandidate): string {
  const base = c.name?.trim() || c.email;
  return c.nickname ? `${base} «${c.nickname}»` : base;
}

export function TeamRegistrationForm({
  shortId,
  teamSize,
  captainEmail = null,
  candidates = [],
}: {
  shortId: string;
  /** Antall spillere per lag (kaptein + medspillere). Slots-rader = teamSize − 1. */
  teamSize: number;
  /** Kapteinens egen e-post — brukt til inline «du er allerede med»-sjekk. */
  captainEmail?: string | null;
  /** Co-players kapteinen kan velge i autocomplete (#362). Tom = ingen treff. */
  candidates?: TeamCandidate[];
}) {
  const [isPending, startTransition] = useTransition();
  const [teamName, setTeamName] = useState('');
  const [teamNameError, setTeamNameError] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotState[]>(() =>
    Array.from({ length: Math.max(teamSize - 1, 0) }, () => ({
      mode: 'lookup' as const,
      value: '',
      selected: null,
    })),
  );
  /** Format-feil per slot, satt on-blur og ved submit-forsøk. */
  const [slotErrors, setSlotErrors] = useState<Record<number, string>>({});
  /** Hvilken slot har åpen autocomplete-liste (null = ingen). */
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [result, setResult] = useState<TeamRegistrationResult | null>(null);
  const [website, setWebsite] = useState('');

  const teamNameRef = useRef<HTMLInputElement>(null);
  const slotRefs = useRef<(HTMLInputElement | null)[]>([]);

  const slotCount = teamSize - 1;

  // Cross-felt-konflikter (duplikat / kaptein-egen-e-post) regnes live fra
  // alle slot-verdier, så de oppdateres mens kapteinen skriver.
  const conflicts = useMemo(
    () => findSlotConflicts(slots.map((s) => s.value), captainEmail),
    [slots, captainEmail],
  );

  const errorFor = (idx: number): string | null =>
    slotErrors[idx] ?? conflicts[idx] ?? null;

  const updateSlot = (idx: number, patch: Partial<SlotState>) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const suggestionsFor = (slot: SlotState): TeamCandidate[] => {
    const q = slot.value.trim().toLowerCase();
    if (q.length === 0 || slot.selected) return [];
    return candidates
      .filter((c) => {
        const hay = `${c.name ?? ''} ${c.nickname ?? ''} ${c.email}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, MAX_SUGGESTIONS);
  };

  const handleSubmit = () => {
    setResult(null);

    // Full validering klientside — blokkerer submit ved feil og hopper til
    // første ugyldige felt, i stedet for å sende serveren en input vi vet
    // er ugyldig (som ville gitt en misvisende feilmelding).
    const nameErr = validateTeamName(teamName);
    const formatErrs: Record<number, string> = {};
    slots.forEach((s, i) => {
      if (s.selected) return; // valgt co-player er gyldig per definisjon
      const err = validateSlotEmail(s.value);
      if (err) formatErrs[i] = err;
    });
    const liveConflicts = findSlotConflicts(
      slots.map((s) => s.value),
      captainEmail,
    );

    setTeamNameError(nameErr);
    setSlotErrors(formatErrs);

    if (nameErr) {
      teamNameRef.current?.focus();
      return;
    }
    const firstBadSlot = slots.findIndex(
      (_, i) => formatErrs[i] || liveConflicts[i],
    );
    if (firstBadSlot !== -1) {
      slotRefs.current[firstBadSlot]?.focus();
      return;
    }

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
          href={`/signup/${shortId}/team`}
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
      noValidate
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
          ref={teamNameRef}
          type="text"
          value={teamName}
          onChange={(e) => {
            setTeamName(e.target.value);
            if (teamNameError) setTeamNameError(validateTeamName(e.target.value));
          }}
          onBlur={() => setTeamNameError(validateTeamName(teamName))}
          maxLength={40}
          required
          placeholder="«Birdie-jegerne»"
          aria-invalid={teamNameError ? true : undefined}
          className={`w-full rounded-xl border bg-surface px-4 py-3 text-sm tracking-tight text-text placeholder:text-muted focus:outline-none focus:ring-2 ${
            teamNameError
              ? 'border-danger focus:border-danger focus:ring-danger/20'
              : 'border-border focus:border-primary focus:ring-primary/20'
          }`}
        />
        {teamNameError && (
          <span className="mt-1 block font-sans text-xs text-danger">
            {teamNameError}
          </span>
        )}
      </label>

      <div className="space-y-3">
        <p className="font-sans text-xs uppercase tracking-[0.12em] text-muted">
          Medspillere ({slotCount} {slotCount === 1 ? 'plass' : 'plasser'})
        </p>
        {slots.map((slot, idx) => {
          const slotError = errorFor(idx);
          const suggestions = suggestionsFor(slot);
          const showList =
            slot.mode === 'lookup' && openSlot === idx && suggestions.length > 0;
          return (
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
                    onChange={() =>
                      updateSlot(idx, { mode: 'lookup', selected: null })
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  Eksisterende spiller
                </label>
                <label className="flex items-center gap-1.5 font-sans text-xs text-text">
                  <input
                    type="radio"
                    name={`slot-${idx}-mode`}
                    checked={slot.mode === 'email'}
                    onChange={() =>
                      updateSlot(idx, { mode: 'email', selected: null })
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  Inviter via e-post
                </label>
              </div>

              {slot.mode === 'lookup' && slot.selected ? (
                // Valgt co-player vises som chip med maskert e-post — vi
                // dumper ikke rå-adressen i et synlig felt.
                <div className="flex items-center justify-between gap-2 rounded-lg border border-primary bg-primary-soft px-3 py-2">
                  <span className="min-w-0 font-sans text-sm text-text">
                    <span className="font-medium">{slot.selected.name}</span>{' '}
                    <span className="text-muted">
                      {maskEmail(slot.selected.email)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateSlot(idx, { selected: null, value: '' })
                    }
                    aria-label={`Fjern ${slot.selected.name}`}
                    className="shrink-0 text-base leading-none text-muted hover:text-text"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    ref={(el) => {
                      slotRefs.current[idx] = el;
                    }}
                    type={slot.mode === 'email' ? 'email' : 'text'}
                    value={slot.value}
                    onChange={(e) => {
                      updateSlot(idx, { value: e.target.value, selected: null });
                      if (slotErrors[idx]) {
                        setSlotErrors((prev) => {
                          const next = { ...prev };
                          delete next[idx];
                          return next;
                        });
                      }
                    }}
                    onFocus={() => setOpenSlot(idx)}
                    onBlur={() => {
                      setOpenSlot((cur) => (cur === idx ? null : cur));
                      const err = validateSlotEmail(slot.value);
                      setSlotErrors((prev) => {
                        const next = { ...prev };
                        if (err) next[idx] = err;
                        else delete next[idx];
                        return next;
                      });
                    }}
                    placeholder={
                      slot.mode === 'lookup'
                        ? 'Søk på navn eller e-post'
                        : 'E-post — sender invitasjon'
                    }
                    required
                    autoComplete="off"
                    aria-label={`Medspiller ${idx + 1}`}
                    aria-invalid={slotError ? true : undefined}
                    className={`w-full rounded-lg border bg-surface px-3 py-2 text-sm tracking-tight text-text placeholder:text-muted focus:outline-none focus:ring-2 ${
                      slotError
                        ? 'border-danger focus:border-danger focus:ring-danger/20'
                        : 'border-border focus:border-primary focus:ring-primary/20'
                    }`}
                  />
                  {showList && (
                    <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
                      {suggestions.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            // onMouseDown (ikke onClick) så valget skjer FØR
                            // input-blur lukker lista.
                            onMouseDown={(e) => {
                              e.preventDefault();
                              updateSlot(idx, {
                                value: c.email,
                                selected: {
                                  name: candidateLabel(c),
                                  email: c.email,
                                },
                              });
                              setOpenSlot(null);
                              setSlotErrors((prev) => {
                                const next = { ...prev };
                                delete next[idx];
                                return next;
                              });
                            }}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-primary-soft"
                          >
                            <span className="min-w-0 truncate font-sans text-sm text-text">
                              {candidateLabel(c)}
                            </span>
                            <span className="shrink-0 font-sans text-xs text-muted">
                              {maskEmail(c.email)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {slotError && (
                <span className="block font-sans text-xs text-danger">
                  {slotError}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {errorMessage && <Banner tone="error">{errorMessage}</Banner>}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Sender…' : 'Meld på laget'}
      </Button>
    </form>
  );
}
