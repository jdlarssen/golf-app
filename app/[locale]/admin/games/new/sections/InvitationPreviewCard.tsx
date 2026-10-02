'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';

/** The hint under the card; the name field points at it. */
export const GAME_NAME_HINT_ID = 'game-name-hint';

/** The name's size on the artboard, and the smallest it shrinks to before it wraps. */
const NAME_MAX_PX = 26;
const NAME_MIN_PX = 18;

/**
 * The size that fits `textWidth` (measured at NAME_MAX_PX) into `available`:
 * 26 px when it fits, smaller in half pixels down to 18 px, never below. At
 * 18 px a name that is still too wide wraps to a second line instead.
 */
export function fitNamePx(textWidth: number, available: number): number {
  if (textWidth <= 0 || available <= 0 || textWidth <= available) return NAME_MAX_PX;
  const scaled = Math.floor(((NAME_MAX_PX * available) / textWidth) * 2) / 2;
  return Math.max(NAME_MIN_PX, Math.min(NAME_MAX_PX, scaled));
}

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
 * It is a one-row textarea so a long name is never clipped: it shrinks from
 * 26 px to 18 px to stay on one centred line, and only below that wraps to a
 * second centred line. Line breaks cannot be typed or pasted; Enter closes the
 * keyboard. The field is the game's `name`, as before.
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
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [namePx, setNamePx] = useState(NAME_MAX_PX);

  // A missing tee drops its part, a missing course drops both.
  const details = [
    ...(courseName ? [courseName, ...(teeName ? [t('card.tee', { name: teeName })] : [])] : []),
    formatName,
  ].join(' · ');

  // Fit the name: measure it at 26 px in a hidden twin, compare with the
  // field's width, then grow the field to its content (one line, or two when
  // even 18 px is too wide). Runs again when the webfont arrives and when the
  // field changes width.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    const measure = measureRef.current;
    if (!field || !measure) return;
    function fit() {
      if (!field || !measure) return;
      const next = fitNamePx(measure.offsetWidth, field.clientWidth);
      setNamePx(next);
      field.style.height = 'auto';
      field.style.height = `${Math.max(44, field.scrollHeight)}px`;
    }
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(field);
    void document.fonts?.ready.then(fit);
    return () => observer?.disconnect();
  }, [name, namePx]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // A name is one line. Enter would also publish through the form's first
    // submit button; here it only closes the keyboard, as «done» promises.
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.currentTarget.blur();
  }

  return (
    <>
      <div className="mx-3 mt-3.5 -rotate-1 rounded-[6px] bg-[var(--invitation-paper)] p-1.5 shadow-[0_10px_22px_rgba(26,46,31,0.14)]">
        <div className="rounded-[3px] border border-primary p-[3px]">
          <div className="flex flex-col items-center gap-1.5 rounded-[2px] border border-primary/35 px-3 py-3.5 text-center">
            <p className="font-sans text-[9px] leading-[normal] font-semibold tracking-[0.3em] text-muted uppercase">
              {t('card.kicker')}
            </p>
            <div className="relative w-full">
              {/* The hidden twin sits outside the label, so it never becomes
                  part of the field's accessible name. */}
              <span
                ref={measureRef}
                aria-hidden="true"
                className="pointer-events-none invisible absolute top-0 left-0 font-serif text-[26px] font-medium whitespace-pre"
              >
                {name || t('gameNamePlaceholder')}
              </span>
              <label className="block w-full">
              <span className="sr-only">{t('gameNameLabel')}</span>
              {/* The size is an inline style: on iOS globals.css lifts fields
                  to at least 16 px, and only an inline (or important) size
                  beats it. The vertical padding keeps one line centred in
                  the artboard's 44 px. */}
              <textarea
                ref={fieldRef}
                id="name"
                name="name"
                required
                rows={1}
                enterKeyHint="done"
                value={name}
                onChange={(e) => onNameChange(e.target.value.replace(/[\r\n]+/g, ' '))}
                onKeyDown={handleKeyDown}
                placeholder={t('gameNamePlaceholder')}
                aria-describedby={GAME_NAME_HINT_ID}
                style={{
                  fontSize: `${namePx}px`,
                  paddingBlock: `${(44 - namePx * 1.2) / 2}px`,
                }}
                className="block min-h-11 w-full resize-none overflow-hidden border-0 border-b-[1.5px] border-dashed border-slot-dashed bg-transparent px-0 text-center font-serif leading-[1.2] font-medium text-text placeholder:text-muted"
              />
              </label>
            </div>
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
