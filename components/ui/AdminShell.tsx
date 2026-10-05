import { ReactNode } from 'react';
import { PerfReady } from '@/components/PerfReady';
import { AppVersionFooter } from '@/components/ui/AppVersionFooter';

const TONE = { admin: 'bg-admin-bg', app: 'bg-bg', none: '' } as const;

/**
 * Warm-linen wrapper for the Klubbhuset / admin room. Sits at the same mobile
 * width as AppShell but uses --admin-bg so the room reads as distinct from the
 * player-facing chrome. Bottom padding clears the persistent bottom-nav, which
 * now shows here too (#392) — same `calc(5rem + safe-area)` as AppShell.
 *
 * `tone="app"` puts the page on the app's background instead: the player's
 * room is drawn that way (#2493, owner's answer 05.10). `tone="none"` leaves
 * the colour to a wrapper (the route skeleton, `admin/LoadingTone`).
 */
export function AdminShell({
  children,
  showVersion = true,
  tone = 'admin',
}: {
  children: ReactNode;
  showVersion?: boolean;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className={`min-h-screen ${TONE[tone]} text-text`}>
      <main className="max-w-md mx-auto px-5 py-8 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
        {children}
        {showVersion && <AppVersionFooter />}
      </main>
      <PerfReady />
    </div>
  );
}
