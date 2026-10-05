'use client';

import type { ReactNode } from 'react';
import { usePathname } from '@/i18n/navigation';

/**
 * The page colour behind /admin's route skeleton (#2493, owner's answer
 * 05.10). The player's room is drawn on the app's background (`bg`); the
 * Sekretariat and every page under /admin keep Klubbhuset's linen
 * (`admin-bg`). The skeleton picks the colour its page will have, so nobody
 * sees it change when the page arrives: the role comes from the server
 * (`loading.tsx`), the page from the path, since this one skeleton stands in
 * for every page under /admin without its own.
 */
export function LoadingTone({ isPlayer, children }: { isPlayer: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const tone = isPlayer && pathname === '/admin' ? 'app' : 'admin';
  return (
    <div
      data-testid="klubbhus-loading"
      data-tone={tone}
      className={tone === 'app' ? 'bg-bg' : 'bg-admin-bg'}
    >
      {children}
    </div>
  );
}
