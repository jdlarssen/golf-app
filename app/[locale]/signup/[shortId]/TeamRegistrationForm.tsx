'use client';

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button, LinkButton } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { GetTheApp } from '@/components/app/GetTheApp';
import { GuestBadge } from '@/components/ui/GuestBadge';
import type { TeamCandidate } from '@/lib/users/getTeamCandidates';
import { TEAM_NAME_MAX } from '@/lib/games/registration';
import { validateTeamName, type TeamNameValidationError } from './teamFormValidation';
import {
  submitTeamRegistration,
  type TeamRegistrationResult,
  type TeamRegistrationError,
} from './teamActions';
import { playerNameWithNicknameAfter } from '@/lib/names/playerName';

const MAX_SUGGESTIONS = 6;

type SlotState = {
  /** What the captain types to find a friend. */
  query: string;
  /**
   * The friend picked for this seat. Carries the id and the masked address
   * only (#2207); the server gets the id.
   */
  selected: { id: string; name: string; maskedEmail: string } | null;
};

/** #2840: a seat left without a friend. */
type SlotEmptyError = { code: 'slotFriendEmpty' };

function candidateLabel(c: TeamCandidate): string {
  const base = c.name?.trim() || c.maskedEmail;
  return playerNameWithNicknameAfter(base, c.nickname);
}

/** Translate a validation error code to a user-visible string. */
function useErrorTranslator() {
  const t = useTranslations('signup');
  return {
    teamNameError: (err: TeamNameValidationError): string => {
      if (err.code === 'teamNameEmpty') return t('errors.teamNameEmpty');
      if (err.code === 'teamNameTooShort') return t('errors.teamNameTooShort', { min: err.min });
      return t('errors.teamNameTooLong', { max: err.max });
    },
    slotError: (err: SlotEmptyError): string => t(`errors.${err.code}`),
  };
}

/**
 * The captain's team form (#362). #2840: every teammate is one of the captain's
 * friends — each seat is a search in `candidates` (the friends, from
 * `getTeamFriendCandidates`), and the server checks the friendship again.
 */
export function TeamRegistrationForm({
  shortId,
  teamSize,
  candidates = [],
}: {
  shortId: string;
  /** Players per team (captain + teammates). Seats = teamSize − 1. */
  teamSize: number;
  /** The captain's friends. Empty = the no-friends note instead of the seats. */
  candidates?: TeamCandidate[];
}) {
  const t = useTranslations('signup');
  const { teamNameError: translateTeamNameError, slotError: translateSlotError } = useErrorTranslator();

  const [isPending, startTransition] = useTransition();
  const [teamName, setTeamName] = useState('');
  const [teamNameError, setTeamNameError] = useState<TeamNameValidationError | null>(null);
  const [slots, setSlots] = useState<SlotState[]>(() =>
    Array.from({ length: Math.max(teamSize - 1, 0) }, () => ({ query: '', selected: null })),
  );
  /** Seats without a friend, set on a submit attempt. */
  const [slotErrors, setSlotErrors] = useState<Record<number, SlotEmptyError>>({});
  /** Which seat has its suggestion list open (null = none). */
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [result, setResult] = useState<TeamRegistrationResult | null>(null);
  const [website, setWebsite] = useState('');

  const teamNameRef = useRef<HTMLInputElement>(null);
  const slotRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Inline errors get ids so each field can point at its message
  // (aria-describedby) and a screen reader reads it with the field.
  const errorIdBase = useId();
  const teamNameErrorId = `${errorIdBase}-team-name-error`;
  const slotErrorId = (idx: number) => `${errorIdBase}-slot-${idx}-error`;

  // The receipt replaces the form (and the button that had focus): move focus
  // to it so a screen reader reads it instead of losing its place. The success
  // Banner inside is already a status region, so the wrapper gets no role.
  const receiptRef = useRef<HTMLDivElement>(null);
  const showReceipt = result?.ok === true;
  useEffect(() => {
    if (showReceipt) receiptRef.current?.focus();
  }, [showReceipt]);

  const slotCount = teamSize - 1;

  const labelById = useMemo(
    () => new Map(candidates.map((c) => [c.id, candidateLabel(c)])),
    [candidates],
  );

  const updateSlot = (idx: number, patch: Partial<SlotState>) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const clearSlotError = (idx: number) => {
    setSlotErrors((prev) => {
      if (!(idx in prev)) return prev;
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

  // A friend picked for one seat is not offered for another, so the same
  // friend can never fill two seats.
  const suggestionsFor = (idx: number): TeamCandidate[] => {
    const slot = slots[idx];
    const q = slot.query.trim().toLowerCase();
    if (q.length === 0 || slot.selected) return [];
    const taken = new Set(
      slots.flatMap((s, i) => (i !== idx && s.selected ? [s.selected.id] : [])),
    );
    return candidates
      .filter((c) => {
        if (taken.has(c.id)) return false;
        const hay = `${c.name ?? ''} ${c.nickname ?? ''} ${c.maskedEmail}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, MAX_SUGGESTIONS);
  };

  const handleSubmit = () => {
    setResult(null);

    // Validate on the client first and jump to the first bad field, instead of
    // sending input we know the server rejects.
    const nameErr = validateTeamName(teamName);
    const emptyErrs: Record<number, SlotEmptyError> = {};
    slots.forEach((s, i) => {
      if (!s.selected) emptyErrs[i] = { code: 'slotFriendEmpty' };
    });

    setTeamNameError(nameErr);
    setSlotErrors(emptyErrs);

    if (nameErr) {
      teamNameRef.current?.focus();
      return;
    }
    const firstBadSlot = slots.findIndex((_, i) => emptyErrs[i]);
    if (firstBadSlot !== -1) {
      slotRefs.current[firstBadSlot]?.focus();
      return;
    }

    const memberIds = slots.flatMap((s) => (s.selected ? [s.selected.id] : []));
    startTransition(async () => {
      const res = await submitTeamRegistration({
        shortId,
        teamName: teamName.trim(),
        memberIds,
        website,
      });
      setResult(res);
    });
  };

  // #2840: only friends can be on the team, so without friends there is no
  // team to fill.
  if (candidates.length === 0) {
    return (
      <div className="space-y-3" data-testid="team-no-friends">
        <Banner tone="info">{t('teamNoFriends')}</Banner>
        <LinkButton href="/profile/venner" full variant="secondary">
          {t('teamNoFriendsLink')}
        </LinkButton>
      </div>
    );
  }

  // Success: an inline receipt (instead of a redirect) so the captain sees
  // which teammates went in and which did not.
  if (result?.ok) {
    const knownAdded = result.slotResults.filter((r) => r.ok);
    const failed = result.slotResults.filter((r) => !r.ok);
    return (
      <div ref={receiptRef} tabIndex={-1} className="space-y-4">
        <Banner tone="success" testId="team-registration-success">
          {t('teamSuccessBanner', { teamName: teamName.trim() })}
        </Banner>
        {knownAdded.length > 0 && (
          <p className="font-sans text-sm text-text">
            {t('teamSuccessKnown', { count: knownAdded.length })}
          </p>
        )}
        {failed.length > 0 && (
          <Banner tone="warning">
            {t('teamSuccessFailedBanner')}
            <ul className="mt-1 list-inside list-disc">
              {failed.map((f, i) => (
                <li key={`${i}-${f.userId}`}>
                  {labelById.get(f.userId) ?? t('teamDashMemberLabel')} —{' '}
                  {!f.ok
                    ? t(`slotFailReason.${f.reason}` as Parameters<typeof t>[0])
                    : ''}
                </li>
              ))}
            </ul>
            {t('teamSuccessFailedFix')}
          </Banner>
        )}
        {/* #2562: «Hent appen» under kvitteringen; ingenting før appen er ute. */}
        <GetTheApp />
        <a
          href={`/signup/${shortId}/team`}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-primary px-[18px] py-2.5 font-medium text-white hover:bg-primary-hover dark:text-bg"
        >
          {t('goToTeamDashboard')}
        </a>
      </div>
    );
  }

  const serverErrorCode =
    result && !result.ok ? (result.error as TeamRegistrationError) : null;
  const errorMessage = serverErrorCode
    ? t(`errors.${serverErrorCode}` as Parameters<typeof t>[0])
    : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="space-y-5"
      aria-label={t('teamFormAriaLabel')}
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

      {/* The error sits outside the <label>: inside it, it became part of the
          field's name and was read twice with aria-describedby. */}
      <div>
        <label className="block">
          <span className="mb-1.5 block font-sans text-xs font-medium text-muted">
            {t('teamNameLabel')}
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
            maxLength={TEAM_NAME_MAX}
            required
            placeholder={t('teamNamePlaceholder')}
            aria-invalid={teamNameError ? true : undefined}
            aria-describedby={teamNameError ? teamNameErrorId : undefined}
            className={`w-full rounded-xl border bg-surface px-4 py-3 text-sm text-text placeholder:text-muted focus:ring-2 ${
              teamNameError
                ? 'border-danger focus:border-danger focus:ring-danger/20'
                : 'border-border focus:border-primary focus:ring-primary/20'
            }`}
          />
        </label>
        {teamNameError && (
          <span id={teamNameErrorId} className="mt-1 block font-sans text-xs text-danger">
            {translateTeamNameError(teamNameError)}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <p className="font-sans text-sm font-medium text-text">
          {t('slotsHeading', { count: slotCount })}
        </p>
        {slots.map((slot, idx) => {
          const slotError = slotErrors[idx] ?? null;
          const suggestions = suggestionsFor(idx);
          const showList = openSlot === idx && suggestions.length > 0;
          return (
            <div
              key={idx}
              className="space-y-2 rounded-xl border border-border bg-surface/40 p-3"
            >
              {slot.selected ? (
                // The picked friend as a chip with the masked address — the raw
                // address is never in a visible field.
                <div className="flex items-center justify-between gap-2 rounded-xl border border-primary bg-primary-soft px-3.5 py-3">
                  <span className="min-w-0 font-sans text-sm text-text">
                    <span className="font-medium">{slot.selected.name}</span>{' '}
                    <span className="text-muted">
                      {slot.selected.maskedEmail}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => updateSlot(idx, { selected: null, query: '' })}
                    aria-label={t('slotRemoveAriaLabel', { name: slot.selected.name })}
                    className="tap-extend shrink-0 text-base leading-none text-muted hover:text-text [--tap-extend:-14px_-18px]"
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
                    type="text"
                    value={slot.query}
                    onChange={(e) => {
                      updateSlot(idx, { query: e.target.value });
                      clearSlotError(idx);
                    }}
                    onFocus={() => setOpenSlot(idx)}
                    onBlur={() => setOpenSlot((cur) => (cur === idx ? null : cur))}
                    placeholder={t('slotLookupPlaceholder')}
                    autoComplete="off"
                    aria-label={t('slotAriaLabel', { n: idx + 1 })}
                    aria-invalid={slotError ? true : undefined}
                    aria-describedby={slotError ? slotErrorId(idx) : undefined}
                    className={`w-full rounded-xl border bg-surface px-3.5 py-3 text-sm text-text placeholder:text-muted focus:ring-2 ${
                      slotError
                        ? 'border-danger focus:border-danger focus:ring-danger/20'
                        : 'border-border focus:border-primary focus:ring-primary/20'
                    }`}
                  />
                  {showList && (
                    // data-focus-inset: forslagene er full-bleed, så
                    // `overflow-hidden` klipper en outline med positiv offset
                    // helt bort (#1402).
                    <ul
                      data-focus-inset
                      className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
                    >
                      {suggestions.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            // onMouseDown (not onClick) so the pick happens
                            // BEFORE the input's blur closes the list.
                            onMouseDown={(e) => {
                              e.preventDefault();
                              updateSlot(idx, {
                                query: '',
                                selected: {
                                  id: c.id,
                                  name: candidateLabel(c),
                                  maskedEmail: c.maskedEmail,
                                },
                              });
                              setOpenSlot(null);
                              clearSlotError(idx);
                            }}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-primary-soft"
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-sans text-sm text-text">
                                {candidateLabel(c)}
                              </span>
                              {c.isGuest && <GuestBadge className="shrink-0" />}
                            </span>
                            <span className="shrink-0 font-sans text-xs text-muted">
                              {c.maskedEmail}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {slotError && (
                <span id={slotErrorId(idx)} className="block font-sans text-xs text-danger">
                  {translateSlotError(slotError)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {errorMessage && (
        <div data-testid="signup-error" data-error-code={serverErrorCode ?? undefined}>
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <Button
        type="submit"
        pending={isPending}
        pendingLabel={t('teamSubmitPending')}
        className="w-full"
      >
        {t('teamSubmitButton')}
      </Button>
    </form>
  );
}
