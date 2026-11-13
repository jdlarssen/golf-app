'use client';

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { GetTheApp } from '@/components/app/GetTheApp';
import type { TeamPickerFriend } from '@/lib/games/teamFriendPicker';
import { TEAM_NAME_MAX } from '@/lib/games/registration';
import { validateTeamName, type TeamNameValidationError } from './teamFormValidation';
import {
  submitTeamRegistration,
  type TeamRegistrationResult,
  type TeamRegistrationError,
} from './teamActions';
import {
  AddFriendSheet,
  Disc,
  FriendList,
  FriendSearchBar,
  LineupSlot,
} from './TeamFriendPicker';

/** Translate a team name error code to the words under the field. */
function useTeamNameError() {
  const t = useTranslations('signup');
  return (err: TeamNameValidationError): string => {
    if (err.code === 'teamNameEmpty') return t('errors.teamNameEmpty');
    if (err.code === 'teamNameTooShort') return t('errors.teamNameTooShort', { min: err.min });
    return t('errors.teamNameTooLong', { max: err.max });
  };
}

function PenIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-muted"
    >
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    </svg>
  );
}

/**
 * The captain's team form (#362), as the drawing v3.1 draws it on the web
 * (#2840 del 5): the team name is the heading, with a suggestion filled in and
 * a click to edit; under it the lineup (you with the «K» and a dashed disc per
 * free seat), the search with «Legg til venn» beside it, one list of friends,
 * and the button at the bottom that counts down: «Velg 2 til», then «Meld på
 * <lagnavn>». Only friends can be on the team; the server checks it again.
 */
export function TeamRegistrationForm({
  shortId,
  teamSize,
  friends,
  friendLinkPath,
  suggestedName,
  ownInitials,
  meta,
}: {
  shortId: string;
  /** Players per team (captain + teammates). Seats = teamSize − 1. */
  teamSize: number;
  /** The captain's friends (`loadTeamFriendPicker`). Empty = the no-friends note. */
  friends: TeamPickerFriend[];
  /** The captain's own friend link for «Kopier lenken din»; null when unread. */
  friendLinkPath: string | null;
  /** «Martins lag» (`suggestTeamName`). */
  suggestedName: string;
  /** Your initials on the captain's disc. */
  ownInitials: string;
  /** «Ons 19. nov kl. 17:30 · Byneset North · 8 av 12 plasser»; null = no line. */
  meta: string | null;
}) {
  const t = useTranslations('signup');
  const tp = useTranslations('signup.friendPicker');
  const translateNameError = useTeamNameError();

  const [isPending, startTransition] = useTransition();
  const [teamName, setTeamName] = useState(suggestedName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(suggestedName);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [result, setResult] = useState<TeamRegistrationResult | null>(null);
  const [website, setWebsite] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameButtonRef = useRef<HTMLButtonElement>(null);
  const nameErrorId = `${useId()}-team-name-error`;

  // The receipt replaces the form (and the button that had focus): move focus
  // to it so a screen reader reads it instead of losing its place.
  const receiptRef = useRef<HTMLDivElement>(null);
  const showReceipt = result?.ok === true;
  useEffect(() => {
    if (showReceipt) receiptRef.current?.focus();
  }, [showReceipt]);

  const slotCount = Math.max(teamSize - 1, 0);
  const remaining = slotCount - selected.length;
  const byId = useMemo(() => new Map(friends.map((f) => [f.id, f])), [friends]);
  const draftError = editing ? validateTeamName(draft) : null;

  const toggle = (friend: TeamPickerFriend) => {
    setSelected((prev) => {
      if (prev.includes(friend.id)) return prev.filter((id) => id !== friend.id);
      if (prev.length >= slotCount || friend.unavailable) return prev;
      return [...prev, friend.id];
    });
  };

  const startEditing = () => {
    setDraft(teamName);
    setEditing(true);
    requestAnimationFrame(() => nameInputRef.current?.focus());
  };

  /** «Ferdig»: keeps a valid name; an invalid one stays in the field. */
  const finishEditing = (): boolean => {
    if (validateTeamName(draft)) {
      nameInputRef.current?.focus();
      return false;
    }
    setTeamName(draft.trim());
    setEditing(false);
    requestAnimationFrame(() => nameButtonRef.current?.focus());
    return true;
  };

  const handleSubmit = () => {
    setResult(null);
    if (editing && !finishEditing()) return;
    const name = (editing ? draft : teamName).trim();
    // The button is off until every seat is filled; this is the same rule.
    if (validateTeamName(name) || remaining > 0) return;

    startTransition(async () => {
      const res = await submitTeamRegistration({
        shortId,
        teamName: name,
        memberIds: selected,
        website,
      });
      setResult(res);
    });
  };

  // Success: an inline receipt (instead of a redirect) so the captain sees
  // which teammates went in and which did not.
  if (result?.ok) {
    const knownAdded = result.slotResults.filter((r) => r.ok);
    const failed = result.slotResults.filter((r) => !r.ok);
    return (
      <div ref={receiptRef} tabIndex={-1} className="space-y-4">
        <Banner tone="success" testId="team-registration-success">
          {t('teamSuccessBanner', { teamName })}
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
                  {byId.get(f.userId)?.label ?? t('teamDashMemberLabel')} —{' '}
                  {!f.ok ? t(`slotFailReason.${f.reason}` as Parameters<typeof t>[0]) : ''}
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

  const serverErrorCode = result && !result.ok ? (result.error as TeamRegistrationError) : null;
  const errorMessage = serverErrorCode
    ? t(`errors.${serverErrorCode}` as Parameters<typeof t>[0])
    : null;
  const seats = Array.from({ length: slotCount }, (_, i) => byId.get(selected[i] ?? '') ?? null);

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="space-y-4"
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

        <div>
          {editing ? (
            <div className="flex min-h-14 items-center gap-2 rounded-[14px] bg-surface-2 py-1 pr-1.5 pl-3.5">
              <input
                ref={nameInputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    finishEditing();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditing(false);
                    requestAnimationFrame(() => nameButtonRef.current?.focus());
                  }
                }}
                maxLength={TEAM_NAME_MAX}
                aria-label={t('teamNameLabel')}
                aria-invalid={draftError ? true : undefined}
                aria-describedby={draftError ? nameErrorId : undefined}
                className="min-w-0 flex-1 bg-transparent font-serif text-2xl font-medium text-text"
              />
              <span className="shrink-0 text-[13px] text-muted tabular-nums" aria-hidden>
                {t('teamForm.counter', { length: draft.trim().length, max: TEAM_NAME_MAX })}
              </span>
              <Button
                type="button"
                size="chip"
                onClick={finishEditing}
                disabled={draftError !== null}
                className="shrink-0"
              >
                {t('teamForm.done')}
              </Button>
            </div>
          ) : (
            <h2 className="font-serif text-[28px] leading-tight font-medium text-text">
              <button
                ref={nameButtonRef}
                type="button"
                onClick={startEditing}
                aria-label={t('teamForm.editName', { teamName })}
                data-testid="team-name-heading"
                className="flex min-h-11 max-w-full items-center gap-2 text-left"
              >
                <span className="min-w-0 break-words">{teamName}</span>
                <PenIcon />
              </button>
            </h2>
          )}
          {draftError && (
            <p id={nameErrorId} className="mt-1.5 text-[13px] text-danger">
              {translateNameError(draftError)}
            </p>
          )}
          {meta && <p className="mt-0.5 text-[13px] text-muted tabular-nums">{meta}</p>}
        </div>

        <ul
          aria-label={tp('lineupLabel')}
          className="grid gap-2 pt-2"
          style={{ gridTemplateColumns: `repeat(${teamSize}, minmax(0, 1fr))` }}
        >
          <li>
            <LineupSlot
              disc={<Disc initials={ownInitials} tone="me" size="lg" captain />}
              label={tp('you')}
            />
          </li>
          {seats.map((friend, i) => (
            <li key={friend?.id ?? `free-${i}`}>
              {friend ? (
                <button
                  type="button"
                  onClick={() => toggle(friend)}
                  aria-label={tp('removeFromTeam', { name: friend.shortName })}
                  className="w-full"
                >
                  <LineupSlot
                    disc={<Disc initials={friend.initials} size="lg" />}
                    label={friend.shortName}
                  />
                </button>
              ) : (
                <LineupSlot disc={<Disc tone="empty" size="lg" />} label={tp('free')} muted />
              )}
            </li>
          ))}
        </ul>

        {friends.length === 0 ? (
          <div className="space-y-3.5" data-testid="team-no-friends">
            <p className="text-[15px] text-muted">{t('teamNoFriends')}</p>
            <Button
              type="button"
              variant="outline"
              size="large"
              onClick={() => setSheetOpen(true)}
              className="w-full"
              data-testid="add-first-friend"
            >
              + {tp('addFirstFriend')}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <FriendSearchBar query={query} onQuery={setQuery} onAddFriend={() => setSheetOpen(true)} />
            <FriendList
              friends={friends}
              query={query}
              isSelected={(id) => selected.includes(id)}
              reasonFor={(f) => (f.unavailable ? tp('unavailable') : null)}
              blocked={() => remaining <= 0}
              onToggle={toggle}
            />
          </div>
        )}

        {errorMessage && (
          <div data-testid="signup-error" data-error-code={serverErrorCode ?? undefined}>
            <Banner tone="error">{errorMessage}</Banner>
          </div>
        )}

        {/* Docked at the bottom of the window, above the bottom nav. */}
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-20 -mx-6 border-t border-border bg-surface px-6 pt-3 pb-1 sm:-mx-7 sm:px-7">
          <Button
            type="submit"
            size="large"
            pending={isPending}
            pendingLabel={t('teamSubmitPending')}
            disabled={remaining > 0}
            className="w-full"
            data-testid="team-submit"
          >
            {remaining > 0
              ? t('teamForm.pickMore', { count: remaining })
              : t('teamForm.submit', { teamName: (editing ? draft : teamName).trim() })}
          </Button>
        </div>
      </form>
      <AddFriendSheet open={sheetOpen} onClose={() => setSheetOpen(false)} linkPath={friendLinkPath} />
    </>
  );
}
