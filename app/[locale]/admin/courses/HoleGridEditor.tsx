'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { indexStatusLine, nextPar, splitNines } from '@/lib/courses/courseCard';
import { strokeIndexCellState } from '@/lib/courses/coursePayload';
import { formatListLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import type { HoleData } from './CourseForm';

type Gender = 'mens' | 'ladies' | 'juniors';
type IndexedHole = HoleData & { index: number };

// The card is the compact one the owner chose on 05.10 («C, den kompakte»):
// a 34 px column of small labels, 34 px rows and wider cells than the 27.09
// artboard's.
//
// The index box is a 26 × 24 content box with a 1.5 px border, drawn the way
// the artboard draws its box, so each browser rounds the border alike. The
// field on top has no border: it is 16 px text (iOS zooms into anything
// smaller) drawn at 4/3 size and scaled by 0.75, absolutely in the middle of
// the cell, since its layout box is wider than the narrowest column. Scaled
// text lands half a pixel off, so without focus the value (or «?») shows as
// plain 12 px text (INDEX_VALUE) and the field's own text and placeholder are
// transparent; with focus, the field shows its own.
const INDEX_FRAME =
  'box-content h-6 w-[26px] rounded-md border-[1.5px] transition-colors motion-reduce:transition-none';
// The field's corners and size follow the box (× 0.75), so the focus ring
// sits on it; no colour transition, or the text would fade in on focus.
const INDEX_FIELD =
  'absolute left-1/2 top-1/2 h-9 w-[38.67px] -translate-x-1/2 -translate-y-1/2 scale-75 rounded-[8px] border-0 bg-transparent p-0 text-center font-sans text-[16px] leading-[normal] tabular-nums';

const INDEX_VALUE =
  'pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] tabular-nums peer-focus:invisible';

const INDEX_STATE = {
  filled: { frame: 'border-transparent', text: 'font-normal text-text' },
  empty: {
    frame: 'border-dashed border-warning',
    text: 'font-semibold text-warning-text placeholder:text-warning-text',
  },
  invalid: {
    frame: 'border-dashed border-warning',
    text: 'font-semibold text-warning-text placeholder:text-warning-text',
  },
  duplicate: {
    frame: 'border-solid border-danger',
    text: 'font-semibold text-danger placeholder:text-danger',
  },
} as const;

// Inter has no «→»: the artboard draws it from the system font, and so does
// this (the rest of the line stays Inter).
function systemArrows(text: string) {
  return text.split('→').flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <span key={i} className="font-[system-ui]">
            →
          </span>,
          part,
        ],
  );
}

const ROW_LABEL = 'py-0 pr-0 pl-1 text-left text-[9px] font-semibold text-muted';

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

  const line = indexStatusLine(
    holes.map((h) => h.stroke_index),
    gaps.missing,
  );
  const status =
    line === null
      ? null
      : line.kind === 'hint'
        ? { text: t('holesHint'), tone: 'hint' as const }
        : line.kind === 'count'
          ? { text: t('siMissingCountRule', { count: line.count }), tone: 'warning' as const }
          : {
              text: t('siMissingList', {
                count: line.numbers.length,
                numbers: formatListLocale(line.numbers.map(String), locale),
              }),
              tone: 'warning' as const,
            };

  function half(nine: IndexedHole[]) {
    if (nine.length === 0) return null;
    const from = nine[0].hole_number;
    const to = nine[nine.length - 1].hole_number;
    return (
      <table className="w-full table-fixed border-collapse text-[12px]">
        <caption className="sr-only">{t('gridCaption', { from, to })}</caption>
        <thead>
          <tr className="text-[10px] text-muted">
            <th scope="col" className={`w-[34px] ${ROW_LABEL}`}>
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
            <tr key={gender} className="h-[34px]">
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
                      className="group flex h-[34px] w-full items-center justify-center focus-visible:outline-none"
                    >
                      <span
                        className={`inline-flex h-7 w-[26px] items-center justify-center rounded-md font-serif text-[15px] font-semibold tabular-nums transition-colors motion-reduce:transition-none group-focus-visible:bg-primary group-focus-visible:text-white group-focus-visible:ring-2 group-focus-visible:ring-primary group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surface dark:group-focus-visible:text-bg ${
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
          <tr className="h-[34px]">
            <th scope="row" className={ROW_LABEL}>
              {t('gridIndex')}
            </th>
            {nine.map((h) => {
              const state = strokeIndexCellState(h.stroke_index, gaps.duplicates);
              return (
                <td key={h.hole_number} className="p-0">
                  <label className="relative flex h-[34px] items-center justify-center">
                    <span className="sr-only">{t('indexCellLabel', { number: h.hole_number })}</span>
                    <span
                      aria-hidden
                      className={`${INDEX_FRAME} ${INDEX_STATE[state].frame}`}
                    />
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
                      aria-invalid={state === 'duplicate' || state === 'invalid' || undefined}
                      // Spaces never reach the field: the rule trims them, and
                      // `pattern` would not, so the two read alike.
                      onChange={(e) => onSi(h.index, e.target.value.replace(/\s/g, ''))}
                      onFocus={() => setLastTapped(null)}
                      className={`peer ${INDEX_FIELD} ${INDEX_STATE[state].text} not-focus:text-transparent not-focus:placeholder:text-transparent`}
                    />
                    <span aria-hidden className={`${INDEX_VALUE} ${INDEX_STATE[state].text}`}>
                      {h.stroke_index === '' ? '?' : h.stroke_index}
                    </span>
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
    <div className="flex flex-col gap-1.5 rounded-[14px] border border-border bg-surface px-2 py-2.5 leading-[normal]">
      <div className="flex justify-between px-1 text-[12px] text-muted">
        <span>{systemArrows(t('parTapHint'))}</span>
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
