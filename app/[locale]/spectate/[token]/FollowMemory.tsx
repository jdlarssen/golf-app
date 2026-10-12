'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from '@/i18n/navigation';
import { followStorageKey, forgetFollow } from '@/lib/leaderboard/followPlayer';

/**
 * Heiagjengen (#2286): the phone remembers who is followed on one live link.
 * Mounted by `renderLiveBoard` only, on the follow page and on the board that
 * can lead to it — never where there is nothing to follow.
 *
 * - A follow page (`userId`) stores the id, once per id — a `router.refresh()`
 *   does not store it again.
 * - An address whose `?folg=` could not be followed (`hadFolg`, unknown or
 *   withdrawn) forgets the stored id.
 * - The plain link with a stored id goes to that player once, with `replace`.
 *   The path is unprefixed: next-intl adds `/en` itself, so `backHref` (which
 *   already carries the locale) would give `/en/en/…`.
 *
 * Storage that throws (private mode, blocked site data) changes nothing.
 */
export function FollowMemory({
  token,
  userId,
  hadFolg,
}: {
  token: string;
  userId: string | null;
  hadFolg: boolean;
}) {
  const router = useRouter();
  const redirected = useRef(false);

  useEffect(() => {
    if (!userId) return;
    try {
      window.localStorage.setItem(followStorageKey(token), userId);
    } catch {
      // Nothing is remembered; following still works through the address.
    }
  }, [token, userId]);

  useEffect(() => {
    if (userId) return;
    if (hadFolg) {
      forgetFollow(token);
      return;
    }
    if (redirected.current) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(followStorageKey(token));
    } catch {
      return;
    }
    if (!stored) return;
    redirected.current = true;
    router.replace(`/spectate/${token}?folg=${encodeURIComponent(stored)}`);
  }, [token, userId, hadFolg, router]);

  return null;
}
