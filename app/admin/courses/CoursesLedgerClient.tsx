'use client';

import { useMemo, useState } from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { LedgerHeader } from '@/components/admin/LedgerHeader';
import { formatShortDateNb } from '@/lib/format/date';

const COURSES_LEDGER_GRID = '1fr 64px 14px';

// Buffer mellom created_at og updated_at som regnes som «samme transaksjon»
// — eksisterende rader fra før 0037-migrasjonen fikk updated_at = now() ved
// migrasjons-tidspunktet, så vi vil ikke vise «Endret» feilaktig før admin
// faktisk har gjort en endring.
const SAME_TX_BUFFER_MS = 60_000;

export type CoursesLedgerItem = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  tee_count: number;
  has_ladies_tee: boolean;
  has_juniors_tee: boolean;
  active_game_count: number;
};

export type SortBy = 'created_at' | 'updated_at' | 'active_game_count';

export type Filters = {
  hasLadiesTee: boolean;
  hasJuniorsTee: boolean;
  activeGames: boolean;
};

const SORT_LABELS: Record<SortBy, string> = {
  created_at: 'Nyeste først',
  updated_at: 'Sist endret',
  active_game_count: 'Flest aktive spill',
};

// Avledet kicker-tekst per rad: «Endret DATO» når updated_at har gått fremover
// mer enn buffer-en etter created_at, ellers «Lagt til DATO». Eksportert for
// test-bruk.
export function rowKicker(item: CoursesLedgerItem): string {
  const created = new Date(item.created_at).getTime();
  const updated = new Date(item.updated_at).getTime();
  const wasUpdated = updated - created > SAME_TX_BUFFER_MS;
  return wasUpdated
    ? `Endret ${formatShortDateNb(item.updated_at)}`
    : `Lagt til ${formatShortDateNb(item.created_at)}`;
}

// Pure sort+filter — eksportert for testing uavhengig av React.
export function applySortAndFilter(
  items: CoursesLedgerItem[],
  query: string,
  filters: Filters,
  sortBy: SortBy,
): CoursesLedgerItem[] {
  const trimmed = query.trim().toLowerCase();
  let result = items;

  if (trimmed !== '') {
    result = result.filter((c) => c.name.toLowerCase().includes(trimmed));
  }
  if (filters.hasLadiesTee) {
    result = result.filter((c) => c.has_ladies_tee);
  }
  if (filters.hasJuniorsTee) {
    result = result.filter((c) => c.has_juniors_tee);
  }
  if (filters.activeGames) {
    result = result.filter((c) => c.active_game_count > 0);
  }

  // Sortering muteres ikke på inn-arrayet.
  const sorted = [...result];
  if (sortBy === 'created_at') {
    sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } else if (sortBy === 'updated_at') {
    sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  } else {
    // active_game_count desc, ties brytes med name asc for stabil rekkefølge.
    sorted.sort((a, b) => {
      if (b.active_game_count !== a.active_game_count) {
        return b.active_game_count - a.active_game_count;
      }
      return a.name.localeCompare(b.name, 'nb');
    });
  }
  return sorted;
}

export function CoursesLedgerClient({
  items,
}: {
  items: CoursesLedgerItem[];
}) {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('created_at');
  const [filters, setFilters] = useState<Filters>({
    hasLadiesTee: false,
    hasJuniorsTee: false,
    activeGames: false,
  });

  const visible = useMemo(
    () => applySortAndFilter(items, query, filters, sortBy),
    [items, query, filters, sortBy],
  );

  const hasActiveFilter =
    filters.hasLadiesTee || filters.hasJuniorsTee || filters.activeGames;
  const trimmedQuery = query.trim();

  function toggleFilter(key: keyof Filters) {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }

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

      <div className="mt-3 flex items-center justify-between gap-3">
        <label
          htmlFor="courses-sort"
          className="font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-muted"
        >
          Sortér
        </label>
        <select
          id="courses-sort"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 font-sans text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {(Object.keys(SORT_LABELS) as SortBy[]).map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <FilterChip
          label="Har dame-tee"
          active={filters.hasLadiesTee}
          onClick={() => toggleFilter('hasLadiesTee')}
        />
        <FilterChip
          label="Har junior-tee"
          active={filters.hasJuniorsTee}
          onClick={() => toggleFilter('hasJuniorsTee')}
        />
        <FilterChip
          label="Aktive spill"
          active={filters.activeGames}
          onClick={() => toggleFilter('activeGames')}
        />
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border bg-surface px-5 py-8 text-center font-sans text-[13px] text-muted">
          {trimmedQuery !== '' && hasActiveFilter
            ? `Ingen baner matcher «${trimmedQuery}» og filteret.`
            : trimmedQuery !== ''
              ? `Ingen baner matcher «${trimmedQuery}».`
              : `Ingen baner matcher filteret.`}
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
            {visible.map((course, i) => {
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
                      {rowKicker(course)}
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

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 font-sans text-[12px] font-medium transition-colors ${
        active
          ? 'border-primary bg-primary text-bg'
          : 'border-border bg-surface text-muted hover:text-text hover:border-text/40'
      }`}
    >
      {label}
    </button>
  );
}
