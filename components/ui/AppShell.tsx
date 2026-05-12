import { ReactNode } from 'react';
import { PerfReady } from '@/components/PerfReady';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <main className="max-w-md mx-auto px-5 py-8 pb-24">{children}</main>
      <PerfReady />
    </div>
  );
}
