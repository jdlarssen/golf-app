'use client';

/**
 * The tray at the bottom of step 4 (#2321, artboard `Spillere-forslag`): the
 * selected players as initials, the count towards the target («3 av 4 · én
 * til») and the button onwards. Fixed to the bottom edge while the grid
 * scrolls; the wizard has no bottom nav on its routes, so nothing sits under it.
 *
 * The avatars are decoration (`aria-hidden`): with 8 px overlap a 30 px circle
 * cannot get a 44 px tap target, and the card in the grid is the control that
 * removes a player. The counter is a polite live region.
 *
 * `PlayerTraySpacer` goes at the end of the flow so the last content can
 * scroll clear of the tray: together with AppShell's 5 rem bottom padding it is
 * at least as tall as the tray with its hint.
 */

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { nameInitials } from '@/lib/names/initials';
import { trayCount } from '@/lib/wizard/playerTarget';
import type { PlayerOption } from '../GameForm';

/** Avatars shown before the rest collapse into «+N». */
const TRAY_AVATARS = 7;

const AVATAR =
  'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full leading-[normal]';
/** The 2 px surface ring that separates overlapping initials; the empty seat has none. */
const RING = 'shadow-[0_0_0_2px_var(--surface)]';

export function PlayerTray({
  selected,
  target,
  buttonLabel,
  canAdvance,
  disabledHint,
  onNext,
}: {
  /** The selected players, in the order they were picked. */
  selected: readonly PlayerOption[];
  target: number | null;
  buttonLabel: string;
  canAdvance: boolean;
  disabledHint: string | null;
  onNext: () => void;
}) {
  const t = useTranslations('wizard.sections.players');
  const count = trayCount({ selected: selected.length, target });
  const shown = selected.slice(0, TRAY_AVATARS);
  const more = selected.length - shown.length;

  return (
    <div
      data-testid="player-tray"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md flex-col gap-2.5 rounded-t-[20px] border-t border-border bg-surface px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-8px_24px_rgba(26,46,31,0.08)]"
    >
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="flex">
          {shown.map((p, i) => (
            <span
              key={p.id}
              className={`${AVATAR} ${RING} bg-surface-strong font-sans text-[10px] font-semibold text-bg-tint ${i > 0 ? '-ml-2' : ''}`}
            >
              {nameInitials(p.pending ? null : p.name)}
            </span>
          ))}
          {more > 0 && (
            <span
              className={`${AVATAR} ${RING} bg-hole-completed-bg font-sans text-[10px] font-semibold text-muted ${shown.length > 0 ? '-ml-2' : ''}`}
            >
              {t('tray.more', { count: more })}
            </span>
          )}
          {count.kind === 'missing' && (
            <span
              className={`${AVATAR} box-border border-[1.5px] border-dashed border-slot-dashed bg-surface ${shown.length > 0 ? '-ml-2' : ''}`}
            />
          )}
        </span>
        <span aria-live="polite" className="flex-1 font-sans text-sm leading-[normal] text-text">
          {count.kind === 'noTarget' ? (
            count.selected === 1 ? (
              t('counterSingular', { count: count.selected })
            ) : (
              t('counterPlural', { count: count.selected })
            )
          ) : (
            <>
              <span className="font-serif text-lg font-semibold leading-[normal] tabular-nums">
                {t('tray.count', { selected: count.selected, target: count.target })}
              </span>
              {count.kind === 'missing' && <> · {t('tray.missing', { missing: count.missing })}</>}
              {count.kind === 'over' && <> · {t('tray.over', { over: count.over })}</>}
            </>
          )}
        </span>
      </div>
      <Button
        type="button"
        size="large"
        data-testid="wizard-next"
        onClick={onNext}
        disabled={!canAdvance}
        className="w-full"
      >
        {buttonLabel}
      </Button>
      {!canAdvance && disabledHint && (
        <p className="text-center font-sans text-xs leading-[normal] text-muted">{disabledHint}</p>
      )}
    </div>
  );
}

/** Room at the end of the flow so the last content scrolls clear of the tray. */
export function PlayerTraySpacer() {
  return <div aria-hidden="true" className="h-[88px]" />;
}
