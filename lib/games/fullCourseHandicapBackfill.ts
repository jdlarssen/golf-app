import {
  applyAllowance,
  playingHandicapFromRaw,
  rawCourseHandicap,
} from '@/lib/scoring/courseHandicap';
import { effectiveHcpAllowancePct, effectiveHcpMaxStrokes } from './hcpAllowance';

/**
 * The full course handicap (100 %) for a row frozen before migration 0254
 * (finding F1, owner-ordered audit 20.11). The start froze only the playing
 * handicap, and the index it came from is not stored. Used by
 * `scripts/backfillFullCourseHandicap.ts`.
 *
 * The frozen playing handicap is the fact; an index is a guess. A guess is
 * accepted only when one of the freeze formulas the app has used turns it into
 * exactly the frozen number:
 *   - today's: the effective share of the unrounded course handicap, then the
 *     cap (#2924, #2660, #2210);
 *   - before #2924: the share of the ROUNDED course handicap;
 *   - before #2210: the stored share also on a format with its own percentage;
 *   - older freezes that kept the full number (share 100).
 * When no share or cap could ever have been applied (stored and effective
 * share 100, no cap), the frozen number is the full one and no index is needed.
 * A cap or a low share maps many full numbers to one frozen number, so when
 * candidates reproduce it with different full numbers the row stays
 * unresolved rather than take a guess.
 */

export type IndexSource = 'history_at_start' | 'profile_now' | 'history_other';

export type IndexCandidate = { hcpIndex: number; source: IndexSource };

export type FullCourseHandicapInput = {
  gameMode: string;
  /** `games.hcp_allowance_pct` as stored. */
  storedPct: number;
  /** `games.hcp_max_strokes` as stored. */
  storedMaxStrokes: number | null;
  /** `game_players.course_handicap`: the frozen playing handicap. */
  frozenCourseHandicap: number | null;
  /** The game tee's rating for the player's tee class; null when missing. */
  rating: { slope: number; courseRating: number; par: number } | null;
  /** Index guesses, best first (`indexCandidates`). */
  candidates: IndexCandidate[];
};

export type FullCourseHandicapPlan =
  | {
      status: 'resolved';
      fullCourseHandicap: number;
      source: 'frozen_at_100' | IndexSource;
    }
  | {
      status: 'unresolved';
      /**
       * `no_rating`: the tee has no rating for the player's tee class.
       * `no_match`: no candidate reproduces the frozen number.
       * `ambiguous`: candidates reproduce it with different full numbers
       * (a cap or a low share maps many full numbers to one frozen number).
       */
      reason: 'no_rating' | 'no_match' | 'ambiguous';
    };

/** Null when there is no frozen playing handicap (nothing to recover). */
export function planFullCourseHandicap(
  input: FullCourseHandicapInput,
): FullCourseHandicapPlan | null {
  const { frozenCourseHandicap: frozen } = input;
  if (frozen === null) return null;

  const effectivePct = effectiveHcpAllowancePct(input.gameMode, input.storedPct);
  const effectiveCap = effectiveHcpMaxStrokes(input.gameMode, input.storedMaxStrokes);
  if (
    effectivePct === 100 &&
    input.storedPct === 100 &&
    effectiveCap === null &&
    input.storedMaxStrokes === null
  ) {
    return { status: 'resolved', fullCourseHandicap: frozen, source: 'frozen_at_100' };
  }

  const { rating } = input;
  if (!rating) return { status: 'unresolved', reason: 'no_rating' };

  const caps = [...new Set([effectiveCap, input.storedMaxStrokes])];
  /** Every candidate that reproduces the frozen number at one of `shares`. */
  const matches = (shares: number[]) =>
    input.candidates.flatMap((candidate) => {
      const raw = rawCourseHandicap({ hcpIndex: candidate.hcpIndex, ...rating });
      const full = Math.round(raw);
      const reproduces = shares.some((pct) =>
        caps.some(
          (cap) =>
            playingHandicapFromRaw(raw, pct, cap) === frozen ||
            applyAllowance(full, pct, cap) === frozen,
        ),
      );
      return reproduces ? [{ full, source: candidate.source }] : [];
    });
  const decide = (found: Array<{ full: number; source: IndexSource }>): FullCourseHandicapPlan => {
    if (found.length === 0) return { status: 'unresolved', reason: 'no_match' };
    if (new Set(found.map((m) => m.full)).size > 1) {
      return { status: 'unresolved', reason: 'ambiguous' };
    }
    return { status: 'resolved', fullCourseHandicap: found[0].full, source: found[0].source };
  };

  // The game's own shares first. Only when no candidate reproduces the frozen
  // number there, share 100: some older freezes kept the full number whatever
  // the stored share said (shamble before #2570).
  const own = matches([...new Set([effectivePct, input.storedPct])]);
  if (own.length > 0 || (effectivePct === 100 && input.storedPct === 100)) return decide(own);
  return decide(matches([100]));
}

/**
 * When the round began, for the history lookup: the start, else the planned
 * tee-off, else when the round was made. Rounds started by older code have no
 * `started_at`.
 */
export function roundStart(game: {
  started_at: string | null;
  scheduled_tee_off_at: string | null;
  created_at: string;
}): string {
  return game.started_at ?? game.scheduled_tee_off_at ?? game.created_at;
}

/**
 * The index guesses for one player in one round, best first, each value once:
 * the last `handicap_history` value recorded at or before the start, then the
 * profile's index today, then the other history values, newest first.
 * `handicap_history` exists from migration 0195; older rounds lean on the
 * profile and the frozen-number check.
 */
export function indexCandidates(input: {
  startedAt: string | null;
  history: Array<{ hcp_index: number | string; recorded_at: string }>;
  profileIndex: number | string | null;
}): IndexCandidate[] {
  const history = input.history
    .map((h) => ({ hcpIndex: Number(h.hcp_index), at: Date.parse(h.recorded_at) }))
    .filter((h) => Number.isFinite(h.hcpIndex))
    .sort((a, b) => b.at - a.at); // newest first

  const out: IndexCandidate[] = [];
  const seen = new Set<number>();
  const push = (hcpIndex: number, source: IndexSource) => {
    if (seen.has(hcpIndex)) return;
    seen.add(hcpIndex);
    out.push({ hcpIndex, source });
  };

  const start = input.startedAt ? Date.parse(input.startedAt) : NaN;
  if (Number.isFinite(start)) {
    const atStart = history.find((h) => h.at <= start);
    if (atStart) push(atStart.hcpIndex, 'history_at_start');
  }
  const profile = input.profileIndex === null ? NaN : Number(input.profileIndex);
  if (Number.isFinite(profile)) push(profile, 'profile_now');
  for (const h of history) push(h.hcpIndex, 'history_other');
  return out;
}
