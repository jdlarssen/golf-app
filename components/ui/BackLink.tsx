import type { ReactNode } from 'react';
import { SmartLink } from './SmartLink';

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <SmartLink
      href={href}
      className="text-sm text-muted hover:text-text transition-colors"
    >
      {children}
    </SmartLink>
  );
}
