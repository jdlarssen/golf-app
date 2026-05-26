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
  teamName: string | null;
  isTeamCaptain: boolean;
  teamRequestId: string | null;
  message: string | null;
  rejectionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
};
