'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Kicker } from '@/components/ui/Kicker';
import { CHIP_SHAPE, chipButtonClasses } from '@/components/ui/Button';
import { TEE_BOUNDS } from '@/lib/courses/coursePayload';
import {
  TEE_CHIP_ORDER,
  addCustomTee,
  customNameProblem,
  removeCustomTee,
  toggleColorTee,
  type TeeBoxData,
  type TeeRows,
} from '@/lib/courses/teeChips';
import { TEE_DOT_CLASS, type TeeColor } from '@/lib/courses/teeColors';
import { getTeeLengthWarning } from '@/lib/courses/teeLengthWarning';
import { MAX_TEE_BOXES } from './constants';

type Gender = 'mens' | 'ladies' | 'juniors';

const CHIP_LABEL_KEY = {
  white: 'teeChipWhite',
  yellow: 'teeChipYellow',
  blue: 'teeChipBlue',
  red: 'teeChipRed',
  orange: 'teeChipOrange',
} as const satisfies Record<TeeColor, string>;

// The artboard's pill (#2486): 44 px, 14 px / 600, a 14 px dot 8 px from the
// label. Pressed swaps the 1 px hairline for a 2 px forest frame on the soft
// green; the width grows by the 2 px, as on the artboard.
const CHIP_IDLE = `${chipButtonClasses('secondary')} gap-2`;
const CHIP_PRESSED = `${CHIP_SHAPE} gap-2 border-2 border-primary bg-primary-soft text-text transition-[background-color,opacity] duration-100`;

// The artboard draws each field as a 44 px content box with a 1 px border, so
// it renders 46 px; the slope field takes 1 share of the column, CR 1.2.
const FIELD =
  'h-[46px] min-w-0 rounded-lg border border-field-border bg-surface p-0 text-center text-[14px] leading-[normal] tabular-nums text-text [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

// The dashed «add» buttons under the table: the course card's toggle look, at
// the 44 px tap target.
const DASHED_TOGGLE =
  'block min-h-11 w-full rounded-lg border border-dashed border-border/80 px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:border-border hover:text-text';

// The name column starts at the artboard's 52 px and grows with the longest
// name («Oransje», «Men's III») up to 96 px, but never so far that a slope
// field gets narrower than 32 px; longer names are cut off.
const NAME_MIN = 52;
const NAME_MAX = 96;
const DOT_AND_GAP = 18;
const COLUMN_GAP = 8;
// A gender column at its narrowest: a 32 px slope field, the 4 px gap and a
// CR field 1.2 times as wide.
const GENDER_COLUMN_MIN = 32 * 2.2 + 4;

function TeeDot({ color, size }: { color: TeeColor | null; size: 12 | 14 }) {
  if (!color) return null;
  return (
    <span
      aria-hidden="true"
      data-tee-dot
      className={`${size === 14 ? 'size-[14px]' : 'size-3'} shrink-0 rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.25)] ${TEE_DOT_CLASS[color]}`}
    />
  );
}

/**
 * A gender column's header. Where the column is too narrow for one line, it
 * breaks after the «·»: «Herre ·» over «slope / CR».
 */
function ColumnLabel({ text }: { text: string }) {
  const [who, what] = text.split(' · ');
  if (what === undefined) return text;
  return (
    <>
      <span className="whitespace-nowrap">{who} ·</span>{' '}
      <span className="whitespace-nowrap">{what}</span>
    </>
  );
}

/** A tee's dot and name in the name column, cut off with the full name in `title`. */
function TeeName({ tee }: { tee: TeeBoxData }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={tee.name}>
      <TeeDot color={tee.color} size={12} />
      <span data-tee-name={tee.color ? 'dot' : 'plain'} className="truncate">
        {tee.name}
      </span>
    </span>
  );
}

/**
 * The tee half of the course form (#2486): chips for the tees the course has,
 * and the scorecard's slope table under them, one row per tee. CourseForm owns
 * the rows; the fields keep the names the server action reads (`tee_${i}_…`),
 * with the row's place as `i`.
 */
export function TeeTableEditor({
  tees,
  nine,
  onTees,
  juniorsOpen,
  onJuniorsOpen,
  lengthOpen,
  onLengthOpen,
}: {
  tees: TeeRows;
  /** A 9-hole course (#2484): the ratings and length are still for 18 holes. */
  nine: boolean;
  onTees: (next: TeeRows) => void;
  juniorsOpen: boolean;
  onJuniorsOpen: (open: boolean) => void;
  lengthOpen: boolean;
  onLengthOpen: () => void;
}) {
  const t = useTranslations('courseForm.form');
  const { rows } = tees;
  const full = rows.length >= MAX_TEE_BOXES;
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherName, setOtherName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const genderCount = juniorsOpen ? 3 : 2;

  // The name column's width follows the widest name, within the room the
  // gender columns leave. It is set as a custom property, so the table and the
  // length card share it without a re-render. scrollWidth is rounded to whole
  // pixels, hence the extra pixel.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      let widest = 0;
      root.querySelectorAll<HTMLElement>('[data-tee-name]').forEach((el) => {
        widest = Math.max(widest, el.scrollWidth + 1 + (el.dataset.teeName === 'dot' ? DOT_AND_GAP : 0));
      });
      const table = root.querySelector('table');
      const room = table
        ? table.clientWidth - COLUMN_GAP * (genderCount + 2) - genderCount * GENDER_COLUMN_MIN
        : NAME_MAX;
      const width = Math.max(NAME_MIN, Math.min(NAME_MAX, Math.ceil(widest), Math.floor(room)));
      root.style.setProperty('--tee-name-w', `${width}px`);
    };
    measure();
    document.fonts?.ready.then(measure);
    const table = root.querySelector('table');
    if (!table || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  }, [rows, genderCount]);

  const genders: Gender[] = (['mens', 'ladies', 'juniors'] as const).slice(0, genderCount);
  const genderColumn = { mens: t('teeColMens'), ladies: t('teeColLadies'), juniors: t('teeColJuniors') };
  const genderWord = {
    mens: t('teeGenderMens'),
    ladies: t('teeGenderLadies'),
    juniors: t('teeGenderJuniors'),
  };

  const duplicate = customNameProblem(otherName, rows) === 'duplicate';

  function update(index: number, patch: Partial<TeeBoxData>) {
    onTees({ ...tees, rows: rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  }

  function addOther() {
    const next = addCustomTee(tees, otherName);
    if ('problem' in next) return;
    onTees(next);
    setOtherName('');
    setOtherOpen(false);
  }

  function onOtherKey(event: KeyboardEvent<HTMLInputElement>) {
    // Enter adds the tee; it must never submit the course.
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addOther();
  }

  const customRows = rows.filter((r) => r.color === null);

  return (
    <div ref={rootRef} className="-mx-1 leading-[normal] [--tee-name-w:52px]">
      <Kicker as="h2" className="px-1 pt-[18px] pb-2 leading-[normal]">
        {t('teeChipsKicker')}
      </Kicker>
      <div className="flex flex-wrap gap-2">
        {TEE_CHIP_ORDER.map((color) => {
          const pressed = rows.some((r) => r.color === color);
          return (
            <button
              key={color}
              type="button"
              data-testid={`tee-chip-${color}`}
              aria-pressed={pressed}
              disabled={!pressed && full}
              onClick={() => onTees(toggleColorTee(tees, color))}
              className={pressed ? CHIP_PRESSED : CHIP_IDLE}
            >
              <TeeDot color={color} size={14} />
              {t(CHIP_LABEL_KEY[color])}
            </button>
          );
        })}
        {customRows.map((tee) => (
          <button
            key={`custom-${tee.name}`}
            type="button"
            data-testid="tee-chip-custom"
            aria-pressed
            onClick={() => onTees(removeCustomTee(tees, tee.name))}
            className={CHIP_PRESSED}
          >
            {tee.name}
          </button>
        ))}
        <button
          type="button"
          data-testid="tee-chip-other"
          aria-expanded={otherOpen}
          disabled={full}
          onClick={() => setOtherOpen((open) => !open)}
          className={CHIP_IDLE}
        >
          {t('teeChipOther')}
        </button>
      </div>

      {otherOpen && !full && (
        <div className="mt-2">
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t('teeCustomNameLabel')}</span>
              <input
                type="text"
                data-testid="tee-custom-name"
                autoFocus
                autoComplete="off"
                value={otherName}
                placeholder={t('teeCustomNamePlaceholder')}
                aria-invalid={duplicate || undefined}
                aria-describedby={duplicate ? 'tee-custom-name-problem' : undefined}
                onChange={(e) => setOtherName(e.target.value)}
                onKeyDown={onOtherKey}
                className="h-11 w-full rounded-xl border border-field-border bg-surface px-3.5 text-[14px] text-text placeholder:text-muted/70"
              />
            </label>
            <button type="button" data-testid="tee-custom-add" onClick={addOther} className={CHIP_IDLE}>
              {t('teeCustomNameAdd')}
            </button>
          </div>
          {duplicate && (
            <p id="tee-custom-name-problem" className="mt-1.5 px-1 text-xs text-warning-text">
              {t('teeCustomNameDuplicate', { name: otherName.trim() })}
            </p>
          )}
        </div>
      )}

      {full && (
        <p className="mt-2 px-1 text-xs text-muted">{t('teeMaxReached', { max: MAX_TEE_BOXES })}</p>
      )}

      {rows.length > 0 && (
        <>
          <Kicker as="h2" className="px-1 pt-[18px] pb-2 leading-[normal]">
            {t('teeTableKicker')}
          </Kicker>
          {nine && <p className="px-1 pb-2 text-[12px] leading-[1.45] text-muted">{t('teeNineHint')}</p>}
          <div className="rounded-2xl border border-border bg-surface p-3">
            {/* The artboard's grid gaps: 8 px across as border spacing, with
                the spacing at the edges taken back by the negative margin;
                10 px down as padding on the body cells, since Chrome counts
                vertical spacing twice between thead and tbody. */}
            <table
              data-testid="tee-table"
              className="-mx-2 w-[calc(100%+16px)] table-fixed border-separate border-spacing-x-2 border-spacing-y-0">
              <caption className="sr-only">{t('teeTableCaption')}</caption>
              <colgroup>
                <col className="w-[var(--tee-name-w)]" />
                {genders.map((g) => (
                  <col key={g} />
                ))}
              </colgroup>
              <thead>
                <tr className="text-[11px] font-semibold text-muted">
                  <td className="p-0" />
                  {genders.map((g) => (
                    <th key={g} scope="col" className="p-0 text-left align-bottom font-semibold">
                      <ColumnLabel text={genderColumn[g]} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((tee, i) => (
                  <tr key={tee.color ?? `custom-${tee.name}`}>
                    <th scope="row" className="p-0 pt-2.5 text-left text-[14px] font-semibold text-text">
                      <TeeName tee={tee} />
                      {tee.id && <input type="hidden" name={`tee_${i}_id`} value={tee.id} />}
                      <input type="hidden" name={`tee_${i}_name`} value={tee.name} />
                      {tee.color && <input type="hidden" name={`tee_${i}_color`} value={tee.color} />}
                    </th>
                    {genders.map((g) => (
                      <td key={g} className="p-0 pt-2.5">
                        <span className="flex gap-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            name={`tee_${i}_slope_${g}`}
                            min={TEE_BOUNDS.slope.min}
                            max={TEE_BOUNDS.slope.max}
                            step={1}
                            aria-label={t('teeCellAria', {
                              name: tee.name,
                              gender: genderWord[g],
                              field: t('teeFieldSlope'),
                            })}
                            value={tee[`slope_${g}`]}
                            onChange={(e) => update(i, { [`slope_${g}`]: e.target.value })}
                            className={`${FIELD} flex-1`}
                          />
                          <input
                            type="number"
                            inputMode="decimal"
                            name={`tee_${i}_cr_${g}`}
                            min={TEE_BOUNDS.cr.min}
                            max={TEE_BOUNDS.cr.max}
                            step={0.1}
                            aria-label={t('teeCellAria', {
                              name: tee.name,
                              gender: genderWord[g],
                              field: t('teeFieldCr'),
                            })}
                            value={tee[`course_rating_${g}`]}
                            onChange={(e) => update(i, { [`course_rating_${g}`]: e.target.value })}
                            className={`${FIELD} flex-[1.2]`}
                          />
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-1 pt-2.5 text-[12px] leading-[1.45] text-muted">{t('teeEmptyHint')}</p>

          <div className="mt-3 space-y-3">
            <button
              type="button"
              data-testid="tee-juniors-toggle"
              onClick={() => onJuniorsOpen(!juniorsOpen)}
              className={DASHED_TOGGLE}
            >
              {juniorsOpen ? t('removeJuniorsColumn') : t('addJuniorsColumn')}
            </button>

            {lengthOpen ? (
              <div className="rounded-2xl border border-border bg-surface p-3">
                <Kicker className="pb-2 leading-[normal]">{t('teeLengthKicker')}</Kicker>
                <div className="space-y-2.5">
                  {rows.map((tee, i) => {
                    const warning = getTeeLengthWarning(tee);
                    return (
                      <div key={tee.color ?? `custom-${tee.name}`}>
                        <div className="flex items-center gap-2">
                          <span className="w-[var(--tee-name-w)] shrink-0 text-[14px] font-semibold">
                            <TeeName tee={tee} />
                          </span>
                          <input
                            type="number"
                            inputMode="numeric"
                            name={`tee_${i}_length_meters`}
                            min={TEE_BOUNDS.length.min}
                            max={TEE_BOUNDS.length.max}
                            step={1}
                            aria-label={t('teeLengthAria', { name: tee.name })}
                            aria-describedby={warning ? `tee-${i}-length-warning` : undefined}
                            value={tee.length_meters}
                            onChange={(e) => update(i, { length_meters: e.target.value })}
                            className={`${FIELD} flex-1`}
                          />
                        </div>
                        {warning && (
                          <p
                            id={`tee-${i}-length-warning`}
                            className="mt-1.5 text-xs text-warning-text"
                          >
                            {warning}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <button
                type="button"
                data-testid="tee-length-toggle"
                onClick={onLengthOpen}
                className={DASHED_TOGGLE}
              >
                {t('addLengthCard')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
