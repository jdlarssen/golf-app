import { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  action,
  actionBelow = false,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  /**
   * Legg handlingen under tittelen i stedet for ved siden av. Hjem bruker det
   * når datoen er tittelen (#2728): «Lørdag 31. oktober» og profilknappen får
   * ikke plass på én rad på en telefon.
   */
  actionBelow?: boolean;
}) {
  return (
    <header
      className={
        actionBelow
          ? 'mb-8 flex flex-col items-start gap-3'
          : 'mb-8 flex items-start justify-between gap-4'
      }
    >
      <div className="min-w-0">
        <h1 className="font-serif text-3xl font-medium tracking-tight text-text leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted mt-1.5">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
