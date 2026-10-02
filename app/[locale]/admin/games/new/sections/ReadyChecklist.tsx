'use client';

import { useTranslations } from 'next-intl';
import { LIST_CARD_CLASS } from '@/components/ui/FormSection';
import type { ReadyRow, ReadyRowStatus, ReadyRowTarget } from './readyChecklistRules';

export type ReadyChecklistItem = ReadyRow & {
  /** «Bane», «Format» … */
  label: string;
  /** What the row says after the label: the choice, or what is missing. */
  value: string;
};

const ICON: Record<ReadyRowStatus, { glyph: string; className: string }> = {
  ok: { glyph: '✓', className: 'bg-primary text-xs text-white dark:text-bg' },
  // Night: --text on --warning is 1.53:1, so the mark takes --bg like the
  // other on-colours (8.73:1).
  warn: { glyph: '!', className: 'bg-warning text-[13px] font-semibold text-text dark:text-bg' },
  block: { glyph: '!', className: 'bg-danger text-[13px] font-semibold text-white dark:text-bg' },
};

const STATUS_WORD: Record<ReadyRowStatus, 'checklist.statusOk' | 'checklist.statusWarn' | 'checklist.statusBlock'> = {
  ok: 'checklist.statusOk',
  warn: 'checklist.statusWarn',
  block: 'checklist.statusBlock',
};

// The row's 52 px include the divider above it (the li is border-box), so the
// rows sit 52 px apart, as on the artboard. The button fills the li.
const ROW_CLASS = 'flex w-full items-center gap-3 px-3.5 py-2.5 text-left';

/**
 * The «Klar?» checklist (#2282): Bane, Format, Tee-off and Spillere, each with
 * a status mark and «Endre». A row with somewhere to go is one button; the
 * whole row is the tap target. The mark is decoration: the status word before
 * the label («I orden:», «Merk:», «Ikke klar:») is what a screen reader says.
 * Only the mark is red on a blocking row; the text keeps the text colour, as
 * on the amber row the artboard draws.
 */
export function ReadyChecklist({
  items,
  onEdit,
}: {
  items: ReadyChecklistItem[];
  onEdit: (target: Exclude<ReadyRowTarget, null>) => void;
}) {
  const t = useTranslations('wizard.ready');
  return (
    <ul data-focus-inset className={`mt-3.5 ${LIST_CARD_CLASS}`}>
      {items.map((item) => {
        const { target } = item;
        const body = (
          <>
            <span
              aria-hidden="true"
              className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full leading-[normal] ${ICON[item.status].className}`}
            >
              {ICON[item.status].glyph}
            </span>
            {/* The plain spaces between the parts are for the accessible name:
                a flex container does not draw them, and without them a screen
                reader runs «I orden:Bane» and «Gul teeEndre» together. */}
            <span className="min-w-0 flex-1 font-sans text-sm leading-[normal] text-text">
              <span className="sr-only">{t(STATUS_WORD[item.status])}</span>{' '}
              <span className="text-muted">{item.label}</span>
              {' · '}
              <span>{item.value}</span>
            </span>{' '}
            {target !== null && (
              <span className="shrink-0 font-sans text-[13px] leading-[normal] font-semibold text-primary">
                {t('checklist.edit')}
              </span>
            )}
          </>
        );
        return (
          <li
            key={item.key}
            data-testid={`ready-row-${item.key}`}
            data-status={item.status}
            className="flex min-h-[52px]"
          >
            {target !== null ? (
              <button type="button" onClick={() => onEdit(target)} className={ROW_CLASS}>
                {body}
              </button>
            ) : (
              <div className={ROW_CLASS}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
