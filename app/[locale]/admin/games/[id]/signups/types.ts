/**
 * Server-safe types shared between page.tsx (server component) and
 * PåmeldingerClient.tsx (client component) for the admin pending-requests
 * UI (issue #199). Kept in its own module so the client bundle does not
 * accidentally drag in server-only deps via the page.
 */

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

export type TabKey = RequestStatus;

export type RequestRow = {
  id: string;
  userId: string;
  status: RequestStatus;
  displayName: string;
  /** `users.name` without the nickname, for the initials (#2288). */
  userName: string | null;
  /** `users.hcp_index`, signed (negative = plus handicap). */
  hcpIndex: number | null;
  teamName: string | null;
  isTeamCaptain: boolean;
  teamRequestId: string | null;
  message: string | null;
  rejectionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
};

/** One player on the roster, as the «Med» card shows them (#2288). */
export type RosterEntry = {
  userId: string;
  displayName: string;
  initials: string;
  /** Formatted handicap («18,4»), or null without one. */
  hcp: string | null;
  /** `accepted_at` is null: added by the organiser, not confirmed yet. */
  unconfirmed: boolean;
};

