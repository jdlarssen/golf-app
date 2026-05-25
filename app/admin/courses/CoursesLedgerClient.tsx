'use client';

import { useMemo, useState } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { LedgerHeader } from '@/components/admin/LedgerHeader';
import { formatShortDateNb } from '@/lib/format/date';

const COURSES_LEDGER_GRID = '1fr 64px 14px';

export type CoursesLedgerItem = {
  id: string;
  name: string;
  created_at: string;
  tee_count: number;
};

// Klient-side substring-søk på banenavn. Datasettet ligger under 100 baner
// selv ved klubb-skala (jf. epic #49), så server-roundtrip per tastetrykk er
// unødvendig friksjon. Søk-input lever sammen med ledger-en i samme klient-
// komponent slik at filtreringen ikke bryter rad-animasjonen (`reveal-up`-
// stagger).
export function CoursesLedgerClient({
  items,
}: {
  items: CoursesLedgerItem[];
}) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (trimmed === '') return items;
    return items.filter((c) => c.name.toLowerCase().includes(trimmed));
  }, [items, trimmed]);

  return (
    <>
      <div className="mt-5">
        <label htmlFor="courses-search" className="sr-only">
          Søk etter banenavn
        </label>
        <input
          id="courses-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søk etter banenavn…"
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 font-sans text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border bg-surface px-5 py-8 text-center font-sans text-[13px] text-muted">
          Ingen baner matcher «{query.trim()}».
        </p>
      ) : (
        <div className="mt-5">
          <LedgerHeader
            leftLabel="Bane"
            rightLabel="Tees"
            gridTemplateColumns={COURSES_LEDGER_GRID}
          />

          <div
            className="overflow-hidden rounded-b-2xl border bg-surface"
            style={{
              borderColor: 'var(--border)',
              borderTop: 'none',
            }}
          >
            {filtered.map((course, i) => {
              // Cap stagger at row 8 så lange katalog-lister ikke drar siste
              // rad ut til ~halv-sekund — samme mønster som `.lb-row` i
              // leaderboard-en.
              const staggerStep = Math.min(i, 8);
              return (
                <SmartLink
                  key={course.id}
                  href={`/admin/courses/${course.id}/edit`}
                  className="reveal-up grid items-center gap-2.5 px-3.5 py-3.5"
                  style={{
                    gridTemplateColumns: COURSES_LEDGER_GRID,
                    animationDelay: `${60 + staggerStep * 60}ms`,
                    borderTop:
                      i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate font-serif text-base font-medium tracking-[-0.005em] text-text">
                      {course.name}
                    </p>
                    <p className="mt-0.5 truncate font-sans text-[11.5px] tabular-nums text-muted">
                      Lagt til {formatShortDateNb(course.created_at)}
                    </p>
                  </div>
                  <p className="text-right font-serif text-[15px] font-medium tabular-nums tracking-[-0.005em] text-text">
                    {course.tee_count}
                  </p>
                  <span aria-hidden className="text-[14px] text-muted">
                    ›
                  </span>
                </SmartLink>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
