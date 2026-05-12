import { ReactNode } from 'react';
import { PerfReady } from '@/components/PerfReady';
import { AppVersionFooter } from '@/components/ui/AppVersionFooter';

export function AppShell({
  children,
  showVersion = true,
}: {
  children: ReactNode;
  showVersion?: boolean;
}) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <main className="max-w-md mx-auto px-5 py-8 pb-24">
        {children}
        {showVersion && <AppVersionFooter />}
      </main>
      <PerfReady />
    </div>
  );
}
