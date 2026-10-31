'use client';

import { useEffect, useId, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { useModalFocus } from '@/hooks/useModalFocus';

/**
 * A bottom sheet (#2457): slides up over the page with a title, a close mark
 * and a «Ferdig» button. The innstillinger rows on the wizard's step 5 each
 * open one with only that row's fields.
 *
 * Four things close it: ✕, a tap on the backdrop, Esc and «Ferdig». A closed
 * sheet is not mounted, so the caller must keep the values somewhere else (the
 * wizard's FormDataInputs does, #1011). Focus goes into the sheet on open, is
 * held there, and returns to the button that opened it (`useModalFocus`).
 *
 * `position: fixed` lands wrong when an ancestor has a `transform` (#2251);
 * keep the sheet out from under one.
 */
export function BottomSheet({
  open,
  title,
  onClose,
  doneLabel,
  closeLabel,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** The button at the bottom: «Ferdig». */
  doneLabel: string;
  /** `aria-label` of the ✕: «Lukk». */
  closeLabel: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const { containerRef } = useModalFocus<HTMLDivElement>(open);

  // Esc. Lives here and not in the hook: the hook takes no callbacks, so a new
  // `onClose` closure never pulls focus out of the open sheet.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="bottom-sheet-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/[0.32]"
      onClick={onClose}
      data-testid="bottom-sheet-backdrop"
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className="bottom-sheet flex max-h-[88vh] w-full max-w-xl flex-col gap-3 rounded-t-[22px] bg-bg px-4 pt-2.5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] shadow-[0_-8px_24px_rgba(0,0,0,0.2)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <span aria-hidden className="h-[5px] w-10 shrink-0 self-center rounded-full bg-border" />
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="min-w-0 font-serif text-[22px] leading-[normal] font-semibold text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="tap-extend flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-lg text-muted hover:bg-surface-2 [--tap-extend:-5px]"
          >
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain">{children}</div>

        <Button type="button" size="large" onClick={onClose} className="w-full shrink-0">
          {doneLabel}
        </Button>
      </div>
    </div>
  );
}
