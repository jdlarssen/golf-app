import { ReactNode } from 'react';
import { PerfReady } from '@/components/PerfReady';
import { AppVersionFooter } from '@/components/ui/AppVersionFooter';
import { BottomNav } from '@/components/ui/BottomNav';

export function AppShell({
  children,
  showVersion = true,
  userId,
}: {
  children: ReactNode;
  showVersion?: boolean;
  /**
   * Innlogget spiller → render vedvarende bunn-tab-bar (#355) og legg på
   * ekstra bunn-padding så innholdet ikke scroller under den. Utelatt på
   * offentlige/pre-profil-sider (ingen bar) og admin (egen AdminShell).
   */
  userId?: string | null;
}) {
  const hasNav = userId != null;
  return (
    <div className="min-h-screen bg-bg text-text">
      <main
        className={`max-w-md mx-auto px-5 py-8 ${
          hasNav ? 'pb-[calc(5rem+env(safe-area-inset-bottom,0px))]' : 'pb-24'
        }`}
      >
        {children}
        {showVersion && <AppVersionFooter />}
      </main>
      {hasNav && <BottomNav userId={userId} />}
      <PerfReady />
    </div>
  );
}
