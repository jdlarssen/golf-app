import type { LeaderboardMode } from '@/lib/leaderboard';

/**
 * Back-navigation context for the leaderboard universe (#1517).
 *
 * The back-arrows in the leaderboard are hierarchical links driven by
 * `?from=`, not `history.back()` — a deliberate choice from #117 because
 * referrer/history heuristics are unreliable in the iOS PWA shell. That only
 * works when EVERY leaderboard-internal link carries the context onward:
 * before this module existed, the drilldown links and the Netto/Brutto toggle
 * rebuilt their URLs from scratch, dropped `from`, and the next back-arrow
 * fell through to `/games/{id}` instead of the cup/history page the user came
 * from.
 *
 * One home for the rule: parse the context once per request
 * (`parseLeaderboardNavContext`), then build every internal URL through
 * `leaderboardHref` / `drilldownHref`.
 */
export type LeaderboardNavContext = {
  /** Validated `?from=` back-target, or null when absent/rejected. */
  from: string | null;
  /** `?return=hole` marker — the hole-screen is the only return-source today. */
  returnTo: 'hole' | null;
  /** Hole number from `?return=hole&n=N`, validated to 1–18. */
  holeNumber: number | null;
};

/** No back-context — the leaderboard falls back to its default back-target. */
export const EMPTY_NAV_CONTEXT: LeaderboardNavContext = {
  from: null,
  returnTo: null,
  holeNumber: null,
};

/** A Next.js search-param value, which may arrive repeated. */
type RawSearchParam = string | string[] | undefined;

function firstValue(raw: RawSearchParam): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * Validates the `?from=` query-param that entry-points use to override the
 * default back-target on the leaderboard page (issue #117). Only accepts
 * relative paths under a known Tørny route prefix — anything else is treated
 * as untrusted input and rejected so we don't open up a redirect-style hole.
 *
 * Returns the validated path or `null` when the param is missing or invalid;
 * callers fall back to the existing back-target heuristic in that case.
 */
export function validateFromParam(raw: RawSearchParam): string | null {
  const value = firstValue(raw);
  if (!value || typeof value !== 'string') return null;
  if (value.length > 200) return null;
  if (!value.startsWith('/')) return null;
  // Reject protocol-relative URLs ("//evil.com") — they bypass the
  // startsWith('/') check but resolve to a different origin.
  if (value.startsWith('//')) return null;
  // Reject anything that smells like an absolute URL.
  if (value.includes('://')) return null;
  // Allowlist of known Tørny route prefixes. Root ('/') is allowed as a
  // literal match so a home-page entry-point can use ?from=/.
  const allowedPrefixes = ['/profile/', '/admin/', '/games/', '/cup/', '/klubber/', '/'];
  if (
    !allowedPrefixes.some((p) => (p === '/' ? value === '/' : value.startsWith(p)))
  ) {
    return null;
  }
  return value;
}

/**
 * Reads the back-navigation context off a request's search params. Invalid
 * input degrades to `null` fields rather than throwing — a stale bookmark
 * should land on the leaderboard with the default back-target, never on an
 * error page.
 */
export function parseLeaderboardNavContext(sp: {
  from?: RawSearchParam;
  return?: RawSearchParam;
  n?: RawSearchParam;
}): LeaderboardNavContext {
  const from = validateFromParam(sp.from);

  const returnRaw = firstValue(sp.return);
  const nRaw = firstValue(sp.n);
  const n = nRaw != null ? Number(nRaw) : null;
  const holeIsValid =
    returnRaw === 'hole' &&
    n !== null &&
    Number.isInteger(n) &&
    n >= 1 &&
    n <= 18;

  return {
    from,
    returnTo: holeIsValid ? 'hole' : null,
    holeNumber: holeIsValid ? n : null,
  };
}

/**
 * Builds a leaderboard-internal URL, always carrying the back-context onward.
 * `URLSearchParams` owns the encoding so a `from` value containing `&` or `#`
 * can never inject extra params into the link.
 */
function buildHref(
  path: string,
  own: { team?: number | null; mode?: LeaderboardMode },
  context: LeaderboardNavContext | null | undefined,
): string {
  const params = new URLSearchParams();
  // `team` before `mode` mirrors the URL shape these links had before #1517.
  if (own.team != null) params.set('team', String(own.team));
  if (own.mode) params.set('mode', own.mode);
  if (context?.from) params.set('from', context.from);
  if (context?.returnTo === 'hole' && context.holeNumber != null) {
    params.set('return', 'hole');
    params.set('n', String(context.holeNumber));
  }
  const query = params.toString();
  return query === '' ? path : `${path}?${query}`;
}

/** URL for the leaderboard root, with back-context preserved. */
export function leaderboardHref(opts: {
  gameId: string;
  mode?: LeaderboardMode;
  context?: LeaderboardNavContext | null;
}): string {
  return buildHref(
    `/games/${opts.gameId}/leaderboard`,
    { mode: opts.mode },
    opts.context,
  );
}

/** URL for the «Hull for hull»-drilldown, with back-context preserved. */
export function drilldownHref(opts: {
  gameId: string;
  team?: number | null;
  mode?: LeaderboardMode;
  context?: LeaderboardNavContext | null;
}): string {
  return buildHref(
    `/games/${opts.gameId}/leaderboard/holes`,
    { team: opts.team, mode: opts.mode },
    opts.context,
  );
}
