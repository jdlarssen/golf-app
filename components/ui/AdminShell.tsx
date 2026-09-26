import { ReactNode } from 'react';
import { PerfReady } from '@/components/PerfReady';
import { AppVersionFooter } from '@/components/ui/AppVersionFooter';

/**
 * Warm-linen wrapper for the Klubbhuset / admin room. Sits at the same mobile
 * width as AppShell but uses --admin-bg so the room reads as distinct from the
 * player-facing chrome. Bottom padding clears the persistent bottom-nav, which
 * now shows here too (#392) — same `calc(5rem + safe-area)` as AppShell.
 */
export function AdminShell({
  children,
  showVersion = true,
}: {
  children: ReactNode;
  showVersion?: boolean;
}) {
  return (
    <div className="min-h-screen bg-admin-bg text-text">
      <main className="max-w-md mx-auto px-5 py-8 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
        {children}
        {showVersion && <AppVersionFooter />}
      </main>
      <PerfReady />
    </div>
  );
}
