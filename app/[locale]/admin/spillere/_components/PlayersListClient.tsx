'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { SmartLink } from '@/components/ui/SmartLink';
import { GuestBadge } from '@/components/ui/GuestBadge';
import { nameInitials } from '@/lib/names/initials';
import {
  REGISTER_PAGE_SIZE,
  filterRegister,
  registerMatchesSearch,
  type RegisterFilter,
  type RegisterRow,
} from '@/lib/admin/playerRegister';

/** A register row plus the radline the server wrote («HCP 9,4 · 23 runder»). */
export type PlayerRow = RegisterRow & { metaLabel: string };

const FILTERS: RegisterFilter[] = ['alle', 'spilt-i-aar', 'gjester'];

function parseFilter(value: string | null): RegisterFilter {
  return value === 'spilt-i-aar' || value === 'gjester' ? value : 'alle';
}

/**
 * Client-side filtered player list (mirrors CoursesLedgerClient.tsx pattern).
 * Receives every fully-onboarded user, already sorted and labelled by the
 * server wrapper (PlayersList.tsx), and filters in memory — no roundtrip, and
 * no timezone maths here (#2346).
 */
export function PlayersListClient({
  rows,
  initialQuery,
  initialFilter,
  searchAriaLabel,
  searchPlaceholder,
  filterGroupLabel,
  filterLabels,
  showAllLabel,
  emptyNoPlayers,
  emptyNoMatchTemplate,
  emptyFilterLabels,
}: {
  rows: PlayerRow[];
  initialQuery: string;
  initialFilter: RegisterFilter;
  searchAriaLabel: string;
  searchPlaceholder: string;
  filterGroupLabel: string;
  /** «Alle 76», «Spilt i år 41», «Gjester 5» — the counts cover the whole list. */
  filterLabels: Record<RegisterFilter, string>;
  /** «Vis alle 76». */
  showAllLabel: string;
  emptyNoPlayers: string;
  /**
   * ICU-resolved template string with `{query}` placeholder left intact,
   * e.g. "Ingen treff på «{query}»." — interpolated client-side so the
   * live search term is reflected without a server roundtrip.
   */
  emptyNoMatchTemplate: string;
  emptyFilterLabels: Record<Exclude<RegisterFilter, 'alle'>, string>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const focusNextPageRow = useRef(false);

  // Live values: prefer the URL params (updated on change) over the SSR initial.
  const q = searchParams.get('q') ?? initialQuery;
  const filter = searchParams.has('vis') ? parseFilter(searchParams.get('vis')) : initialFilter;

  const filtered = useMemo(
    () => filterRegister(rows, filter).filter((r) => registerMatchesSearch(r, q)),
    [rows, filter, q],
  );

  // «Vis alle» only exists for the plain list; a search or a filter shows every hit.
  const paged = filter === 'alle' && !q.trim();
  const capped = paged && !expanded && filtered.length > REGISTER_PAGE_SIZE;
  const visible = capped ? filtered.slice(0, REGISTER_PAGE_SIZE) : filtered;

  useEffect(() => {
    if (!expanded || !focusNextPageRow.current) return;
    focusNextPageRow.current = false;
    listRef.current?.querySelectorAll<HTMLElement>('a')[REGISTER_PAGE_SIZE]?.focus();
  }, [expanded]);

  function setParam(key: 'q' | 'vis', value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    });
  }

  function setFilter(next: RegisterFilter) {
    setParam('vis', next === 'alle' ? '' : next);
  }

  return (
    <>
      <div className="relative mb-2">
        <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 text-muted">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
        </span>
        <label htmlFor="players-search" className="sr-only">
          {searchAriaLabel}
        </label>
        <input
          id="players-search"
          type="search"
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
          className="h-[46px] w-full rounded-xl border border-border bg-surface pl-9 pr-3 font-sans text-base text-text placeholder:text-muted focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div role="group" aria-label={filterGroupLabel} className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((key) => {
          const selected = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={selected}
              data-testid={`players-filter-${key}`}
              onClick={() => setFilter(key)}
              className={`h-[44px] rounded-full px-3 font-sans text-[13px] font-semibold tabular-nums transition ${
                selected
                  ? 'bg-primary text-white dark:text-bg'
                  : 'border border-border bg-surface text-text hover:bg-row-hover'
              }`}
            >
              {filterLabels[key]}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-5 py-6 text-center text-sm text-muted">
          {q.trim()
            ? emptyNoMatchTemplate.replace('{query}', q)
            : filter === 'alle'
              ? emptyNoPlayers
              : emptyFilterLabels[filter]}
        </div>
      ) : (
        // data-focus-inset: radene er full-bleed, så `overflow-hidden` klipper en
        // outline med positiv offset helt bort (#1402).
        <div
          ref={listRef}
          data-focus-inset
          className="overflow-hidden rounded-2xl border border-border bg-surface"
          style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
        >
          {visible.map((u, i) => (
            <SmartLink
              key={u.id}
              href={`/admin/spillere/${u.id}`}
              className="flex min-h-[56px] items-center gap-3 px-3.5 py-2 transition hover:bg-row-hover"
              style={{
                borderTop: i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
              }}
            >
              <span
                aria-hidden="true"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-sans text-[13px] font-semibold ${
                  u.is_guest
                    ? 'bg-chip-unassigned-disc text-muted'
                    : 'bg-primary-soft text-primary'
                }`}
              >
                {nameInitials(u.name ?? u.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-[15px] font-semibold leading-[normal] text-text">
                  {u.name ?? u.email}
                  {u.is_admin && (
                    <span className="ml-1 font-sans text-[10px] font-semibold uppercase tracking-[0.1em] text-accent-text">
                      Admin
                    </span>
                  )}
                  {u.is_guest && <GuestBadge className="ml-1.5 align-middle" />}
                </p>
                <p className="font-sans text-[12px] leading-[normal] tabular-nums text-muted">{u.metaLabel}</p>
              </div>
              {u.lastPlayedLabel && (
                <span className="shrink-0 font-sans text-[12px] text-muted">
                  {u.lastPlayedLabel}
                </span>
              )}
            </SmartLink>
          ))}
        </div>
      )}

      {capped && (
        <button
          type="button"
          onClick={() => {
            focusNextPageRow.current = true;
            setExpanded(true);
          }}
          className="flex h-[44px] w-full items-center justify-center px-4 font-sans text-[13px] font-semibold tabular-nums text-primary underline"
        >
          {showAllLabel}
        </button>
      )}
    </>
  );
}
