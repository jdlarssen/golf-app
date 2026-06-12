'use client';

import { useMemo, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { LedgerHeader } from '@/components/admin/LedgerHeader';
import { formatShortDateLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';

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
  last_played_at: string | null;
};

export type SortBy =
  | 'created_at'
  | 'updated_at'
  | 'last_played'
  | 'active_game_count';

export type Filters = {
  hasLadiesTee: boolean;
  hasJuniorsTee: boolean;
  activeGames: boolean;
  playedRecently: boolean;
};

const SORT_VALUES = new Set<SortBy>([
  'created_at',
  'updated_at',
  'last_played',
  'active_game_count',
]);

// Vindu for «Spilt siste 30 dager»-filter. 30 dager = «aktiv i sesongen»
// for norske golf-forhold. 90 dager dekker for mye av off-sesongen.
const RECENT_PLAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Pure helper — leser sort/filter/søk fra URL-params, fallback til defaults.
// Eksportert for testing uavhengig av Next.js navigation-hooks.
export function readStateFromParams(params: URLSearchParams): {
  query: string;
  sortBy: SortBy;
  filters: Filters;
} {
  const rawSort = params.get('sort');
  const sortBy: SortBy =
    rawSort && SORT_VALUES.has(rawSort as SortBy)
      ? (rawSort as SortBy)
      : 'created_at';
  return {
    query: params.get('q') ?? '',
    sortBy,
    filters: {
      hasLadiesTee: params.get('ladies') === '1',
      hasJuniorsTee: params.get('juniors') === '1',
      activeGames: params.get('active') === '1',
      playedRecently: params.get('recent') === '1',
    },
  };
}

// Avledet kicker-tekst per rad. Prioritet:
//   1. «Sist spilt DATO» når banen har blitt brukt i et spill
//   2. «Endret DATO» når updated_at har gått fremover mer enn buffer-en
//   3. «Lagt til DATO» (default)
// Eksportert for test-bruk.
export function rowKicker(
  item: CoursesLedgerItem,
  t: ReturnType<typeof useTranslations<'admin.courses'>>,
  locale: AppLocale,
): string {
  if (item.last_played_at !== null) {
    return t('kickerLastPlayed', { date: formatShortDateLocale(item.last_played_at, locale) });
  }
  const created = new Date(item.created_at).getTime();
  const updated = new Date(item.updated_at).getTime();
  const wasUpdated = updated - created > SAME_TX_BUFFER_MS;
  return wasUpdated
    ? t('kickerUpdated', { date: formatShortDateLocale(item.updated_at, locale) })
    : t('kickerAdded', { date: formatShortDateLocale(item.created_at, locale) });
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
  if (filters.playedRecently) {
    const cutoffMs = Date.now() - RECENT_PLAY_WINDOW_MS;
    result = result.filter(
      (c) =>
        c.last_played_at !== null &&
        new Date(c.last_played_at).getTime() >= cutoffMs,
    );
  }

  // Sortering muteres ikke på inn-arrayet.
  const sorted = [...result];
  if (sortBy === 'created_at') {
    sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } else if (sortBy === 'updated_at') {
    sorted.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  } else if (sortBy === 'last_played') {
    // last_played_at desc; null (aldri spilt) plasseres sist, ties brytes
    // med navn asc for stabil rekkefølge.
    sorted.sort((a, b) => {
      if (a.last_played_at === null && b.last_played_at === null) {
        return a.name.localeCompare(b.name, 'nb');
      }
      if (a.last_played_at === null) return 1;
      if (b.last_played_at === null) return -1;
      return b.last_played_at.localeCompare(a.last_played_at);
    });
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
  const t = useTranslations('admin.courses');
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const { query, sortBy, filters } = readStateFromParams(
    new URLSearchParams(searchParams.toString()),
  );

  const visible = useMemo(
    () => applySortAndFilter(items, query, filters, sortBy),
    [items, query, filters, sortBy],
  );

  const hasActiveFilter =
    filters.hasLadiesTee ||
    filters.hasJuniorsTee ||
    filters.activeGames ||
    filters.playedRecently;
  const trimmedQuery = query.trim();

  // URL-state writer: oppdaterer kun de keys som er i `patch`. Verdier som er
  // `null` eller tom streng fjernes (holder URL kort — defaults skrives ikke).
  // `router.replace` istedenfor push så filter-endringer ikke spammer browser-
  // historikken. `startTransition` gjør tastetrykk lavprioritet.
  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    const qs = next.toString();
    const href = qs ? `?${qs}` : '?';
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  function setQuery(value: string) {
    updateParams({ q: value || null });
  }

  function setSortBy(value: SortBy) {
    updateParams({ sort: value === 'created_at' ? null : value });
  }

  function toggleFilter(key: keyof Filters) {
    const paramKey: Record<keyof Filters, string> = {
      hasLadiesTee: 'ladies',
      hasJuniorsTee: 'juniors',
      activeGames: 'active',
      playedRecently: 'recent',
    };
    updateParams({ [paramKey[key]]: filters[key] ? null : '1' });
  }

  const SORT_OPTIONS: { key: SortBy; label: string }[] = [
    { key: 'created_at', label: t('sortNewest') },
    { key: 'updated_at', label: t('sortUpdated') },
    { key: 'last_played', label: t('sortLastPlayed') },
    { key: 'active_game_count', label: t('sortMostActive') },
  ];

  return (
    <>
      <div className="mt-5">
        <label htmlFor="courses-search" className="sr-only">
          {t('searchAriaLabel')}
        </label>
        <input
          id="courses-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 font-sans text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <label
          htmlFor="courses-sort"
          className="font-sans text-[11px] font-medium uppercase tracking-[0.12em] text-muted"
        >
          {t('sortLabel')}
        </label>
        <select
          id="courses-sort"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 font-sans text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {SORT_OPTIONS.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <FilterChip
          label={t('filterLadiesTee')}
          active={filters.hasLadiesTee}
          onClick={() => toggleFilter('hasLadiesTee')}
        />
        <FilterChip
          label={t('filterJuniorsTee')}
          active={filters.hasJuniorsTee}
          onClick={() => toggleFilter('hasJuniorsTee')}
        />
        <FilterChip
          label={t('filterActiveGames')}
          active={filters.activeGames}
          onClick={() => toggleFilter('activeGames')}
        />
        <FilterChip
          label={t('filterPlayedRecently')}
          active={filters.playedRecently}
          onClick={() => toggleFilter('playedRecently')}
        />
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-border bg-surface px-5 py-8 text-center font-sans text-[13px] text-muted">
          {trimmedQuery !== '' && hasActiveFilter
            ? t('emptyFilterAndQuery', { query: trimmedQuery })
            : trimmedQuery !== ''
              ? t('emptyQuery', { query: trimmedQuery })
              : t('emptyFilter')}
        </p>
      ) : (
        <div className="mt-5">
          <LedgerHeader
            leftLabel={t('colCourse')}
            rightLabel={t('colTees')}
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
                      {rowKicker(course, t, locale)}
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
