import { ReactNode } from 'react';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-surface border border-border rounded-2xl p-6 sm:p-7 shadow-[0_1px_2px_rgba(26,46,31,0.04),0_2px_8px_rgba(26,46,31,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3)] ${className}`}
    >
      {children}
    </div>
  );
}
