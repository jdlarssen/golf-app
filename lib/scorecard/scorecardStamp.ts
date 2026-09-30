// The stamp on a delivered scorecard (#2262): when it was signed, by whom, and
// one line about approval.
//
// Nothing new is stored. Delivery writes `submitted_at` (and, since #2200,
// `submitted_by_user_id`); approval writes `approved_at` + `approved_by_user_id`;
// rejecting or reopening a card clears them again. The stamp only reads.
//
// «Markør» is reserved for a flight mate (owner's answer 2026-09-27). An
// organizer or admin who approves from another flight, or from no flight at
// all, gets «Godkjent av arrangøren». The flight part of that rule lives next to
// the approval rule in `flightScope.ts`, so the two cannot disagree.
import { firstName } from '../firstName';
import { isFlightMate, type FlightPlayer } from '../games/flightScope';
import type { GameMode } from '../scoring/modes/types';

export interface StampPlayer extends FlightPlayer {
  submitted_at: string | null;
  submitted_by_user_id: string | null;
  approved_at: string | null;
  approved_by_user_id: string | null;
  name: string | null;
  nickname: string | null;
}

export type SignedBy = { kind: 'self' } | { kind: 'other'; fullName: string | null };

export type StampApproval =
  | { kind: 'marker'; name: string }
  | { kind: 'organizer' }
  | { kind: 'approved' }
  | { kind: 'pending' }
  | { kind: 'none' };

/** Day, month (1–12), hour and minute of the signing, in the zone shown. */
export interface StampDateParts {
  day: number;
  month: number;
  hour: number;
  minute: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * The date in the stamp, as on the design canvas (#2385): «27.09 · 14:32».
 * The caller supplies the parts in the time zone it shows, so the form has one
 * home whichever clock the platform can read.
 */
export function formatStampDate({ day, month, hour, minute }: StampDateParts): string {
  return `${pad2(day)}.${pad2(month)} · ${pad2(hour)}:${pad2(minute)}`;
}

export interface ScorecardStamp {
  signedAt: string;
  signedBy: SignedBy;
  approval: StampApproval;
  locked: boolean;
}

function resolveApproval(
  owner: StampPlayer,
  players: StampPlayer[],
  gameMode: GameMode,
  requirePeerApproval: boolean,
  locked: boolean,
  markerName: 'first' | 'full',
): StampApproval {
  if (owner.approved_at != null) {
    const approverId = owner.approved_by_user_id;
    if (approverId == null) return { kind: 'approved' };
    // «Flightkamerat» reads today's roster (`isSingleFlightGame` counts the
    // players active now), the same way `canApproveScorecardFor` does. A
    // withdrawal after the approval can therefore move a game across the
    // one-flight line; the label follows the rule, not the history.
    if (isFlightMate(players, gameMode, approverId, owner.user_id)) {
      const approver = players.find((p) => p.user_id === approverId);
      const name = !approver
        ? null
        : markerName === 'full'
          ? (approver.name ?? approver.nickname)
          : firstName(approver.nickname ?? approver.name);
      // A flight mate without any name is still not the organizer.
      return name ? { kind: 'marker', name } : { kind: 'approved' };
    }
    return { kind: 'organizer' };
  }
  // A finished game waits for nobody: under «Resultatet er låst» a
  // «Venter på …» line would contradict the line below it.
  if (requirePeerApproval && !locked) return { kind: 'pending' };
  return { kind: 'none' };
}

/**
 * The stamp for `ownerUserId`'s card, or `null` when there is none: the card is
 * not delivered (also after a rejection or reopening), the player has
 * withdrawn, or the owner is not in the roster.
 */
export function resolveScorecardStamp(opts: {
  ownerUserId: string;
  players: StampPlayer[];
  gameMode: GameMode;
  gameStatus: string;
  requirePeerApproval: boolean;
  /**
   * How the marker is named: `first` (the default) is the first name or the
   * nickname; `full` is the full name, as on the app's scorecard canvas (#2385).
   */
  markerName?: 'first' | 'full';
}): ScorecardStamp | null {
  const owner = opts.players.find((p) => p.user_id === opts.ownerUserId);
  if (!owner || owner.submitted_at == null || owner.withdrawn_at != null) return null;

  const deliverer = owner.submitted_by_user_id;
  const signedBy: SignedBy =
    deliverer == null || deliverer === owner.user_id
      ? { kind: 'self' }
      : {
          kind: 'other',
          fullName: opts.players.find((p) => p.user_id === deliverer)?.name ?? null,
        };

  const locked = opts.gameStatus === 'finished';
  return {
    signedAt: owner.submitted_at,
    signedBy,
    approval: resolveApproval(
      owner,
      opts.players,
      opts.gameMode,
      opts.requirePeerApproval,
      locked,
      opts.markerName ?? 'first',
    ),
    locked,
  };
}
