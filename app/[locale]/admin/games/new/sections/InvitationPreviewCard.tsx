'use client';

import type { KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';

/** The hint under the card; the name field points at it. */
export const GAME_NAME_HINT_ID = 'game-name-hint';

/**
 * The small invitation card on «Klar?» (#2282), drawn as the artboard
 * `Klar-forslag` draws it: the paper with its double forest frame, a little
 * crooked, «INVITASJON», the game name as a field in the middle of the card,
 * then the day and time and a line with course, tee and format.
 *
 * Not `components/games/InvitationCard`: the owner chose the smaller card the
 * artboard draws (owner answer 2, 02.10). The colours are the real card's
 * tokens, so night follows it.
 *
 * The name is always a field, never text that turns into one on a tap (#1999).
 * The field is the game's `name`, as before.
 */
export function InvitationPreviewCard({
  name,
  onNameChange,
  when,
  courseName,
  teeName,
  formatName,
}: {
  name: string;
  onNameChange: (next: string) => void;
  /** From `invitationWhen`: Oslo time. `null` → no date line. */
  when: { weekday: string; date: string; time: string } | null;
  courseName: string | null;
  teeName: string | null;
  formatName: string;
}) {
  const t = useTranslations('wizard.ready');

  // A missing tee drops its part, a missing course drops both.
  const details = [
    ...(courseName ? [courseName, ...(teeName ? [t('card.tee', { name: teeName })] : [])] : []),
    formatName,
  ].join(' · ');

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // The step's Enter guard (ReadyStep) stops the submit; here Enter also
    // closes the keyboard, as «done» on the key promises.
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
  }

  return (
    <>
      <div className="mx-3 mt-3.5 -rotate-1 rounded-[6px] bg-[var(--invitation-paper)] p-1.5 shadow-[0_10px_22px_rgba(26,46,31,0.14)]">
        <div className="rounded-[3px] border border-primary p-[3px]">
          <div className="flex flex-col items-center gap-1.5 rounded-[2px] border border-primary/35 px-3 py-3.5 text-center">
            <p className="font-sans text-[9px] leading-[normal] font-semibold tracking-[0.3em] text-muted uppercase">
              {t('card.kicker')}
            </p>
            <label className="block w-full">
              <span className="sr-only">{t('gameNameLabel')}</span>
              {/* 26 px marked important: on iOS globals.css lifts fields to
                  at least 16 px, and only an important size beats it. */}
              <input
                id="name"
                name="name"
                type="text"
                required
                enterKeyHint="done"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('gameNamePlaceholder')}
                aria-describedby={GAME_NAME_HINT_ID}
                className="h-11 w-full border-0 border-b-[1.5px] border-dashed border-slot-dashed bg-transparent text-center font-serif text-[26px]! leading-[normal] font-medium text-text placeholder:text-muted"
              />
            </label>
            {when && (
              <p className="font-sans text-[13px] leading-[normal] text-text tabular-nums first-letter:uppercase">
                {t('card.when', when)}
              </p>
            )}
            <p className="font-sans text-xs leading-[normal] text-muted">{details}</p>
          </div>
        </div>
      </div>
      <p
        id={GAME_NAME_HINT_ID}
        className="mt-2.5 text-center font-sans text-xs leading-[normal] text-muted"
      >
        {t('nameHint')}
      </p>
    </>
  );
}
