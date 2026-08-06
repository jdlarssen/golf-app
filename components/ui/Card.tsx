import { HTMLAttributes, ReactNode } from 'react';

// #1441 (owner-QA, F3f): forwards the rest of a plain <div>'s attributes
// (notably `data-testid`) — it was silently dropped before, since the props
// type only ever declared `children`/`className`. TypeScript's data-*/aria-*
// exemption let call-sites pass `data-testid` without a type error while it
// quietly never reached the DOM at runtime (found via a failing render test
// for the pending-friend row). Same `...rest`-forwarding shape `Button`
// already uses (components/ui/Button.tsx) — purely additive, every existing
// call-site keeps rendering identically since none relied on the drop.
export function Card({
  children,
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      {...rest}
      className={`bg-surface border border-border rounded-2xl p-6 sm:p-7 shadow-[0_1px_2px_rgba(26,46,31,0.04),0_2px_8px_rgba(26,46,31,0.04)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3)] ${className}`}
    >
      {children}
    </div>
  );
}
