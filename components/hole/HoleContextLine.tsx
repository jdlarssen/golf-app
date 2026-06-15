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
   * champagne-tonet bakgrunn + sterkere tekst. Florida step-aside-påminnelsen
   * er en stille regel-note og bruker default (utonet, muted). Default false.
   */
  accent?: boolean;
  children: ReactNode;
}

/**
 * Kompakt kontekst-underrad i hull-header-zonen. Rendres flush under
 * `HoleHero` (samme `borderBottom`) slik at modus-kontekst-teksten leser som
 * en del av header-stacken i stedet for et frittstående full-bredde kort med
 * eget margin/-radius. Det gjenvinner den dedikerte banner-raden så 4.
 * spillerkort ikke dyttes under folden på mobil. #639.
 */
export function HoleContextLine({
  testId,
  accent = false,
  children,
}: HoleContextLineProps): JSX.Element {
  const style: CSSProperties = {
    padding: '7px 18px',
    borderBottom: '1px solid var(--border)',
    background: accent ? 'var(--primary-soft)' : 'transparent',
    fontFamily: 'var(--font-sans)',
    fontSize: 12,
    fontWeight: accent ? 600 : 400,
    lineHeight: 1.35,
    color: accent ? 'var(--text)' : 'var(--text-muted)',
    textAlign: 'center',
  };
  return (
    <div data-testid={testId} style={style}>
      {children}
    </div>
  );
}
