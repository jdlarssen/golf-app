'use client';

import { useState, type ReactNode } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import type { TeeColor } from '@/lib/courses/teeColors';

/** One complete rating set on a tee, with every string ready from the server. */
export type TeeRatingView = {
  key: string;
  label: string;
  /** «141 slope · 72,9 CR», the numbers already in Fraunces. */
  value: ReactNode;
  /** «Par 73» when this gender's par differs from the course's, else null. */
  par: string | null;
};

export type TeeView = {
  id: string;
  name: string;
  color: TeeColor | null;
  /** The status line under the course name while this tee is selected. */
  status: string;
  ratings: TeeRatingView[];
};

// Static map, so a new key in TEE_COLORS fails tsc until it has a dot.
const TEE_DOT: Record<TeeColor, string> = {
  white: 'bg-tee-white',
  yellow: 'bg-tee-yellow',
  red: 'bg-tee-red',
  blue: 'bg-tee-blue',
  orange: 'bg-tee-orange',
};

const RATING_COLUMNS = ['grid-cols-1', 'grid-cols-2', 'grid-cols-3'] as const;

// The chip's own additions to the `compact` pill: the dot's gap, one line.
const CHIP_EXTRA = 'whitespace-nowrap gap-2';

function TeeDot({ color, selected }: { color: TeeColor | null; selected: boolean }) {
  if (!color) return null;
  return (
    <span
      aria-hidden="true"
      data-tee-dot
      className={`size-3 shrink-0 rounded-full ${TEE_DOT[color]} ${
        selected ? 'shadow-[inset_0_0_0_1px_rgb(0_0_0/0.2)]' : ''
      }`}
    />
  );
}

/**
 * The tee half of the course card's green top (#2277): the status line, the
 * tee chips and the rating cells of the selected tee. The server hands over
 * finished values, so switching tees is the only thing that happens here. One
 * tee gets a static pill instead of a radiogroup.
 */
export function TeePanel({ legend, tees }: { legend: string; tees: TeeView[] }) {
  const [selectedId, setSelectedId] = useState(tees[0]?.id ?? null);
  const ids = tees.map((t) => t.id);
  const rovingProps = useRovingFocus(ids, selectedId, setSelectedId);
  const selected = tees.find((t) => t.id === selectedId) ?? tees[0];
  if (!selected) return null;

  return (
    <>
      <p aria-live="polite" className="mt-0.5 text-[13px] text-on-strong/85">
        {selected.status}
      </p>

      {tees.length === 1 ? (
        <div className="mt-[14px] flex">
          <span className={`${buttonClasses('onStrong', 'compact')} ${CHIP_EXTRA}`}>
            <TeeDot color={selected.color} selected />
            {selected.name}
          </span>
        </div>
      ) : (
        <div role="radiogroup" aria-label={legend} className="mt-[14px] flex flex-wrap gap-2">
          {tees.map((tee, index) => {
            const isSelected = tee.id === selected.id;
            return (
              <button
                key={tee.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                {...rovingProps(index)}
                onClick={() => setSelectedId(tee.id)}
                className={`${buttonClasses(
                  isSelected ? 'onStrong' : 'onStrongOutline',
                  'compact',
                )} ${CHIP_EXTRA}`}
              >
                <TeeDot color={tee.color} selected={isSelected} />
                {tee.name}
              </button>
            );
          })}
        </div>
      )}

      <dl
        aria-live="polite"
        className={`mt-3 grid border-t border-on-strong/25 pt-2.5 ${
          RATING_COLUMNS[selected.ratings.length - 1] ?? RATING_COLUMNS[2]
        }`}
      >
        {selected.ratings.map((rating, index) => (
          <div key={rating.key} className={index > 0 ? 'border-l border-on-strong/25 pl-3' : ''}>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-on-strong/80">
              {rating.label}
            </dt>
            <dd className="mt-0.5 text-[14px]">{rating.value}</dd>
            {rating.par && <dd className="text-[13px] text-on-strong/85">{rating.par}</dd>}
          </div>
        ))}
      </dl>
    </>
  );
}
