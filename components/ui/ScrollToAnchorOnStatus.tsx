'use client';

import { useEffect } from 'react';

type Props = {
  /** The `?status=` value read on the server, e.g. from `first(sp.status)`. */
  status: string | undefined;
  /** Only scrolls when `status` equals this value. */
  matchStatus: string;
  /** `id` (without `#`) of the element to scroll into view. */
  anchorId: string;
};

/**
 * #1067: server-action redirects drop URL hash fragments before the
 * client-side router replays them (Next.js explicitly strips `.hash` when
 * building the redirect href for the fetch-action path — see
 * `createHrefFromUrl(redirectLocation, false)` in
 * `next/dist/client/components/router-reducer/reducers/server-action-reducer.js`).
 * So `redirect({ href: '...#leverte-scorekort' })` alone will NOT scroll the
 * browser there — this component is the pre-cleared fallback: it renders
 * nothing but scrolls to `anchorId` on mount whenever the query-string
 * `status` matches, regardless of whether the hash survived the redirect.
 */
export function ScrollToAnchorOnStatus({ status, matchStatus, anchorId }: Props) {
  useEffect(() => {
    if (status !== matchStatus) return;
    document.getElementById(anchorId)?.scrollIntoView({ block: 'start' });
  }, [status, matchStatus, anchorId]);

  return null;
}
