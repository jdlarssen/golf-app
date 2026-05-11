import Link from 'next/link';
import type { ReactNode } from 'react';

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-sm text-muted hover:text-text transition-colors"
    >
      {children}
    </Link>
  );
}
