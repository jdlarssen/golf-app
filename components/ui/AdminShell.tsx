import { ReactNode } from 'react';
import { PerfReady } from '@/components/PerfReady';
import { AppVersionFooter } from '@/components/ui/AppVersionFooter';

/**
 * Warm-linen wrapper for admin "Sekretariatet" surfaces. Sits at the same
 * mobile width as AppShell but uses --admin-bg so admin pages read as a
 * different room than the player-facing chrome.
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
      <main className="max-w-md mx-auto px-5 py-8 pb-24">
        {children}
        {showVersion && <AppVersionFooter />}
      </main>
      <PerfReady />
    </div>
  );
}
