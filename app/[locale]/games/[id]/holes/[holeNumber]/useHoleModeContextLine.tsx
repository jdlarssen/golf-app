'use client';

// #639: modus-kontekst-linja (Wolf / Skins / Round Robin / Florida) er
// gjensidig utelukkende per modus. Den rutes inn i midt-kolonnen av HoleHero
// (mellom hull-tallet og Par/indeks) i stedet for å ta en egen full-bredde
// banner-rad som dyttet 4. spillerkort under folden på mobil.
//
// Dette er en HOOK, ikke en komponent: `HoleHero` gater slot-en på truthiness
// (`{contextLine && <div …>}`), så «ingen linje» MÅ være `null` og ikke et
// element som rendrer tomt — ellers får hullet en tom wrapper-div (#1716).

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { HoleContextLine } from '@/components/hole/HoleContextLine';
import type { RoundRobinConstellationPlayer } from '@/lib/scoring/modes/roundRobin';
import { RoundRobinBadge } from './RoundRobinBadge';

export function useHoleModeContextLine(args: {
  currentHole: number;
  myUserId: string;
  isWolf: boolean;
  wolfBadgeText: string | null;
  /** #2314: merket «CATCH-UP» foran badgen. */
  wolfCatchUp?: boolean;
  /** #2314: avstanden på et catch-up-hull, for de andre i flighten. */
  wolfCatchUpLine?: string | null;
  /** #2314: gangen for de andre i flighten, til valget er lagret. */
  wolfFlowLine?: string | null;
  isSkins: boolean;
  skinsAtStake: number | undefined;
  skinsCarriedIn: number | undefined;
  isRoundRobin: boolean;
  roundRobinPlayers: RoundRobinConstellationPlayer[] | undefined;
  isFlorida: boolean;
}): ReactNode {
  const {
    currentHole,
    myUserId,
    isWolf,
    wolfBadgeText,
    wolfCatchUp = false,
    wolfCatchUpLine = null,
    wolfFlowLine = null,
    isSkins,
    skinsAtStake,
    skinsCarriedIn,
    isRoundRobin,
    roundRobinPlayers,
    isFlorida,
  } = args;
  const t = useTranslations('holes');

  if (isWolf && wolfBadgeText) {
    return (
      <HoleContextLine testId="wolf-badge" accent>
        {wolfCatchUp && (
          <span data-testid="wolf-catch-up" style={{ letterSpacing: '0.12em' }}>
            {`${t('wolf.catchUpTag')} · `}
          </span>
        )}
        {wolfBadgeText}
        {[wolfCatchUpLine, wolfFlowLine].map((line) =>
          line ? (
            <span
              key={line}
              style={{
                display: 'block',
                marginTop: 1,
                fontWeight: 400,
                color: 'var(--text-muted)',
              }}
            >
              {line}
            </span>
          ) : null,
        )}
      </HoleContextLine>
    );
  }
  if (isSkins && skinsAtStake != null) {
    return (
      <HoleContextLine testId="skins-banner" accent>
        {t('banners.skinsBanner', { count: skinsAtStake })}
        {skinsCarriedIn != null && skinsCarriedIn > 0 && (
          <span
            style={{
              display: 'block',
              marginTop: 1,
              fontWeight: 400,
              color: 'var(--text-muted)',
            }}
          >
            {t('banners.skinsCarried')}
          </span>
        )}
      </HoleContextLine>
    );
  }
  if (isRoundRobin && roundRobinPlayers) {
    return (
      <RoundRobinBadge
        holeNumber={currentHole}
        players={roundRobinPlayers}
        myUserId={myUserId}
      />
    );
  }
  if (isFlorida) {
    // Florida Scramble (#283): step-aside-påminnelse — kun for florida,
    // ikke for texas eller ambrose. Honor-system; ingen tracking.
    return (
      <HoleContextLine testId="florida-step-aside-reminder">
        {t('banners.floridaStepAside')}
      </HoleContextLine>
    );
  }
  return null;
}
