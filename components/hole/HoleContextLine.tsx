'use client';

import type { CSSProperties, ReactNode, JSX } from 'react';

export interface HoleContextLineProps {
  /**
   * Test-id videreført fra det gamle frittstående banneret slik at
   * eksisterende selektorer (round-robin-badge, wolf-badge,
   * florida-step-aside-reminder, skins-banner) fortsatt treffer. #639.
   */
  testId: string;
  /**
   * Tonet variant for «aktiv» modus-kontekst (Round Robin / Wolf / Skins) —
   * champagne-tonet tekst (`--accent-deep`) + sterkere vekt. Florida
   * step-aside-påminnelsen er en stille regel-note og bruker default (muted).
   * Default false.
   */
  accent?: boolean;
  children: ReactNode;
}

/**
 * Kompakt modus-kontekst-tekst plassert i midt-kolonnen av `HoleHero` (mellom
 * hull-tallet og Par/indeks). Den tucker teksten inn i den ledige høyden ved
 * siden av det store hull-tallet i stedet for å ta en egen full-bredde
 * banner-rad — så 4. spillerkort ikke dyttes under folden på mobil. Liten,
 * sentrert, wrapper innenfor tall-høyden. #639.
 */
export function HoleContextLine({
  testId,
  accent = false,
  children,
}: HoleContextLineProps): JSX.Element {
  const style: CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontSize: 11.5,
    fontWeight: accent ? 600 : 400,
    lineHeight: 1.3,
    color: accent ? 'var(--accent-deep)' : 'var(--text-muted)',
    textAlign: 'center',
  };
  return (
    <div data-testid={testId} style={style}>
      {children}
    </div>
  );
}
