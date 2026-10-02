import type { HTMLAttributes, ReactNode } from 'react';

/**
 * A team or side card on step 4 of the new-game wizard (#2321): «Lag 1»,
 * «Side 1» in Fraunces 16 px / 600 over its slots, 10 px inside, 8 px apart.
 *
 * The title is a `<p>`, not a heading: the section around the cards already
 * carries the «Lag»/«Sider» heading, and a heading per card would give screen
 * readers (and `getByRole('heading', { name: /lag/i })`) one per team.
 */
export function SlotCard({
  title,
  children,
  className = '',
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, 'title'> & { title: ReactNode; children: ReactNode }) {
  return (
    <div
      {...rest}
      className={`flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-surface p-2.5 ${className}`}
    >
      <p className="font-serif text-base font-semibold leading-[normal] text-text">{title}</p>
      {children}
    </div>
  );
}
