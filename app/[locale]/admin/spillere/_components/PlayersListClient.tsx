'use client';

import { useMemo, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { SmartLink } from '@/components/ui/SmartLink';
import { GuestBadge } from '@/components/ui/GuestBadge';
import { formatHcpDisplay } from '@/lib/handicap/sign';
import type { AppLocale } from '@/i18n/routing';

export type PlayerRow = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
  hcp_index: number;
  is_admin: boolean;
  is_guest: boolean;
  created_at: string;
};

/**
 * Client-side filtered player list (mirrors CoursesLedgerClient.tsx pattern).
 * Receives all fully-onboarded users from the server wrapper (PlayersList.tsx)
 * and filters in memory on every keystroke — no roundtrip needed since the
 * list is already fully fetched server-side.
 */
export function PlayersListClient({
  users,
  initialQuery,
  locale,
  searchAriaLabel,
  searchPlaceholder,
  emptyNoPlayers,
  emptyNoMatchTemplate,
}: {
  users: PlayerRow[];
  initialQuery: string;
  locale: AppLocale;
  searchAriaLabel: string;
  searchPlaceholder: string;
  emptyNoPlayers: string;
  /**
   * ICU-resolved template string with `{query}` placeholder left intact,
   * e.g. "Ingen treff på «{query}»." — interpolated client-side so the
   * live search term is reflected without a server roundtrip.
   */
  emptyNoMatchTemplate: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Live value: prefer URL param (updated on onChange) over SSR initial.
  const q = searchParams.get('q') ?? initialQuery;

  const filtered = useMemo(() => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) return users;
    return users.filter(
      (u) =>
        (u.name?.toLowerCase() ?? '').includes(trimmed) ||
        (u.nickname?.toLowerCase() ?? '').includes(trimmed) ||
        u.email.toLowerCase().includes(trimmed),
    );
  }, [users, q]);

  function setQuery(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) {
      next.set('q', value);
    } else {
      next.delete('q');
    }
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    });
  }

  return (
    <>
      <div className="mb-2">
        <label htmlFor="players-search" className="sr-only">
          {searchAriaLabel}
        </label>
        <input
          id="players-search"
          type="search"
          value={q}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 font-sans text-sm text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-6 text-center text-sm text-muted">
          {q.trim()
            ? emptyNoMatchTemplate.replace('{query}', q)
            : emptyNoPlayers}
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-xl border border-border bg-surface"
          style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
        >
          {filtered.map((u, i) => (
            <SmartLink
              key={u.id}
              href={`/admin/spillere/${u.id}`}
              className="reveal-up flex items-center justify-between gap-3 px-3.5 py-3 transition hover:bg-row-hover"
              style={{
                animationDelay: `${60 + i * 50}ms`,
                borderTop:
                  i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
              }}
            >
              <div className="min-w-0">
                <p className="truncate font-serif text-[15px] font-medium tracking-[-0.005em] text-text">
                  {u.name ?? u.email}
                  {u.nickname && (
                    <span className="ml-1.5 font-sans text-[11.5px] text-muted">
                      ({u.nickname})
                    </span>
                  )}
                  {u.is_guest && <GuestBadge className="ml-1.5 align-middle" />}
                </p>
                <p className="mt-0.5 truncate font-sans text-[11.5px] text-muted">
                  {u.email}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-sans text-[12px] tabular-nums text-text">
                  {formatHcpDisplay(u.hcp_index, locale)}
                </p>
                {u.is_admin && (
                  <p
                    className="mt-0.5 font-sans text-[9.5px] font-semibold uppercase"
                    style={{ letterSpacing: '0.16em', color: 'var(--score-over1-fg)' }}
                  >
                    Admin
                  </p>
                )}
              </div>
            </SmartLink>
          ))}
        </div>
      )}
    </>
  );
}
