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
  // Bunn-padding klarerer den vedvarende bunn-nav-en (#355, rendret globalt i
  // app/layout.tsx) + iPhone home-indicator. På de få nav-løse AppShell-sidene
  // (offentlige/pre-profil) er ekstra bunn-luft harmløst.
  return (
    <div className="min-h-screen bg-bg text-text">
      <main className="max-w-md mx-auto px-5 py-8 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
        {children}
        {showVersion && <AppVersionFooter />}
      </main>
      <PerfReady />
    </div>
  );
}
