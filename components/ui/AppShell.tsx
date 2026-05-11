import { ReactNode } from 'react';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="max-w-md mx-auto px-4 py-6 pb-24">{children}</main>
    </div>
  );
}
