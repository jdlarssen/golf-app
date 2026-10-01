import { ReactNode } from 'react';
import { PerfReady } from '@/components/PerfReady';
import { AppVersionFooter } from '@/components/ui/AppVersionFooter';

export function AppShell({
  children,
  showVersion = true,
  flush = false,
  bgClassName = 'bg-bg',
}: {
  children: ReactNode;
  showVersion?: boolean;
  /**
   * The page background. The invitation login (#2266) stands on linen
   * (`--invitation-page-bg`); every other page keeps `bg-bg`.
   */
  bgClassName?: string;
  /**
   * No side or top padding: the page lays out its own edges (the inbox board,
   * #2263, whose cards sit 16 px from the screen edge). The bottom padding
   * stays so nothing ends up behind the bottom nav.
   */
  flush?: boolean;
}) {
  // Bunn-padding klarerer den vedvarende bunn-nav-en (#355, rendret globalt i
  // app/layout.tsx) + iPhone home-indicator. På de få nav-løse AppShell-sidene
  // (offentlige/pre-profil) er ekstra bunn-luft harmløst.
  return (
    <div className={`min-h-screen ${bgClassName} text-text`}>
      <main
        className={
          flush
            ? 'max-w-md mx-auto pb-[calc(5rem+env(safe-area-inset-bottom,0px))]'
            : 'max-w-md mx-auto px-5 py-8 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]'
        }
      >
        {children}
        {showVersion && <AppVersionFooter />}
      </main>
      <PerfReady />
    </div>
  );
}
