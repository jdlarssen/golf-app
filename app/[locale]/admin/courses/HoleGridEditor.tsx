'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { nextPar, splitNines } from '@/lib/courses/courseCard';
import { strokeIndexCellState } from '@/lib/courses/coursePayload';
import { formatListLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import type { HoleData } from './CourseForm';

type Gender = 'mens' | 'ladies' | 'juniors';
type IndexedHole = HoleData & { index: number };

// The card lists the missing numbers up to this many; past it, only the count.
const MAX_LISTED_MISSING = 6;

// The visible index box is 29 × 33 px with a 1.5 px dashed border, as the
// artboard draws it. The field itself is 16 px text (iOS zooms into anything
// smaller), so it is drawn at 4/3 size and scaled by 0.75. It sits absolutely
// in the middle of the cell: its layout box is wider than the narrowest column.
const INDEX_FIELD =
  'absolute left-1/2 top-1/2 h-11 w-[38.67px] -translate-x-1/2 -translate-y-1/2 scale-75 rounded-[10.67px] border-2 bg-transparent p-0 text-center font-sans text-[16px] leading-[normal] transition-colors motion-reduce:transition-none';

const INDEX_STATE = {
  filled: 'border-transparent font-normal text-text',
  empty: 'border-dashed border-warning font-semibold text-warning-text placeholder:text-warning-text',
  invalid: 'border-dashed border-warning font-semibold text-warning-text placeholder:text-warning-text',
  duplicate: 'border-danger font-semibold text-danger placeholder:text-danger',
} as const;

const ROW_LABEL =
  'py-0 pr-0 pl-1 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-muted';

/**
 * «Fyll ut banekortet» (issue 2278): the 18 holes as the club's scorecard, out and
 * in nines in one card. A tap on a par cycles 3 → 4 → 5 → 3; the index row is
 * small number fields that show what is missing or doubled. The values and
 * the save rule stay in CourseForm; this only draws them.
 */
export function HoleGridEditor({
  holes,
  showLadies,
  showJuniors,
  parTotal,
  onPar,
  onSi,
  gaps,
}: {
  holes: HoleData[];
  showLadies: boolean;
  showJuniors: boolean;
  parTotal: number;
  onPar: (index: number, gender: Gender, par: 3 | 4 | 5) => void;
  onSi: (index: number, value: string) => void;
  gaps: { missing: number[]; duplicates: number[]; invalid: number[] };
}) {
  const t = useTranslations('courseForm.form');
  const locale = useLocale() as AppLocale;
  // The par cell tapped last keeps the dark look until another par cell is
  // tapped or an index field takes focus.
  const [lastTapped, setLastTapped] = useState<{ gender: Gender; index: number } | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const { out, in: back } = splitNines<IndexedHole>(holes.map((h, index) => ({ ...h, index })));
  const parRows: Gender[] = ['mens'];
  if (showLadies) parRows.push('ladies');
  if (showJuniors) parRows.push('juniors');

  const genderLabel = (gender: 'ladies' | 'juniors') =>
    gender === 'ladies' ? t('genderParLadies') : t('genderParJuniors');

  function tapPar(hole: IndexedHole, gender: Gender) {
    const par = nextPar(hole[`par_${gender}`]);
    onPar(hole.index, gender, par);
    setLastTapped({ gender, index: hole.index });
    setAnnouncement(
      gender === 'mens'
        ? t('parAnnounce', { number: hole.hole_number, par })
        : t('parAnnounceWithGender', { number: hole.hole_number, genderLabel: genderLabel(gender), par }),
    );
  }

  const noneTyped = holes.every((h) => h.stroke_index.trim() === '');
  const { missing } = gaps;
  let status: { text: string; tone: 'hint' | 'warning' } | null = null;
  if (noneTyped) {
    status = { text: t('holesHint'), tone: 'hint' };
  } else if (missing.length > MAX_LISTED_MISSING) {
    status = { text: t('siMissingCountRule', { count: missing.length }), tone: 'warning' };
  } else if (missing.length > 0) {
    status = {
      text: t('siMissingList', { numbers: formatListLocale(missing.map(String), locale) }),
      tone: 'warning',
    };
  }

  function half(nine: IndexedHole[]) {
    if (nine.length === 0) return null;
    const from = nine[0].hole_number;
    const to = nine[nine.length - 1].hole_number;
    return (
      <table className="w-full table-fixed border-collapse text-[12px]">
        <caption className="sr-only">{t('gridCaption', { from, to })}</caption>
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.1em] text-muted">
            <th scope="col" className="w-[54px] py-0 pr-0 pl-1 text-left font-normal">
              {t('gridHole')}
            </th>
            {nine.map((h) => (
              <th key={h.hole_number} scope="col" className="p-0 text-center font-normal">
                {h.hole_number}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parRows.map((gender) => (
            <tr key={gender} className="h-10">
              <th scope="row" className={ROW_LABEL}>
                {gender === 'mens'
                  ? t('gridPar')
                  : gender === 'ladies'
                    ? t('gridParLadies')
                    : t('gridParJuniors')}
              </th>
              {nine.map((h) => {
                const value = h[`par_${gender}`];
                const last = lastTapped?.gender === gender && lastTapped.index === h.index;
                return (
                  <td key={h.hole_number} className="p-0 text-center">
                    <button
                      type="button"
                      aria-label={
                        gender === 'mens'
                          ? t('parCellAria', { number: h.hole_number, par: value })
                          : t('parCellAriaWithGender', {
                              number: h.hole_number,
                              genderLabel: genderLabel(gender),
                              par: value,
                            })
                      }
                      onClick={() => tapPar(h, gender)}
                      className="group flex h-10 w-full items-center justify-center focus-visible:outline-none"
                    >
                      <span
                        className={`inline-flex h-[34px] w-[26px] items-center justify-center rounded-lg font-serif text-[16px] font-semibold transition-colors motion-reduce:transition-none group-focus-visible:bg-primary group-focus-visible:text-white group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surface dark:group-focus-visible:text-bg ${
                          last
                            ? 'bg-primary text-white ring-2 ring-primary ring-offset-2 ring-offset-surface dark:text-bg'
                            : 'bg-par-cell text-text'
                        }`}
                      >
                        {value}
                      </span>
                    </button>
                    <input type="hidden" name={`hole_${h.hole_number}_par_${gender}`} value={value} />
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="h-10">
            <th scope="row" className={ROW_LABEL}>
              {t('gridIndex')}
            </th>
            {nine.map((h) => {
              const state = strokeIndexCellState(h.stroke_index, gaps.duplicates);
              return (
                <td key={h.hole_number} className="p-0">
                  <label className="relative block h-10">
                    <span className="sr-only">{t('indexCellLabel', { number: h.hole_number })}</span>
                    <input
                      name={`hole_${h.hole_number}_si`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      autoComplete="off"
                      placeholder="?"
                      required
                      value={h.stroke_index}
                      aria-invalid={state === 'duplicate' || undefined}
                      onChange={(e) => onSi(h.index, e.target.value)}
                      onFocus={() => setLastTapped(null)}
                      className={`${INDEX_FIELD} ${INDEX_STATE[state]}`}
                    />
                  </label>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface px-2 py-2.5 leading-[normal]">
      <div className="flex justify-between px-1 text-[12px] text-muted">
        <span>{t('parTapHint')}</span>
        <span className="font-semibold text-text">{t('parTotalShort', { total: parTotal })}</span>
      </div>
      {half(out)}
      <div className="mx-1 h-px bg-row-divider-warm" />
      {half(back)}
      {status && (
        <p
          className={`px-1 text-[12px] ${
            status.tone === 'warning' ? 'font-semibold text-warning-text' : 'text-muted'
          }`}
        >
          {status.text}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
