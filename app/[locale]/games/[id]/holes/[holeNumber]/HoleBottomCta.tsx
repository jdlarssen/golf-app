'use client';

// Bunn-CTA-en på hull-flaten (#1716 — ren flytting ut av `HoleClient`):
// primærknappen («Neste hull» / «Lever scorekort» / broen) og den sekundære
// søsken-lenka under den.

import type { CSSProperties, JSX } from 'react';
import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { BottomActionBar } from '@/components/hole/BottomActionBar';
import type { HoleSegment } from '@/lib/scoring';
import type { SegmentSiblingLink } from './holeClientProps';

// #1441 (owner-QA finding B): subtle secondary link below the primary CTA —
// never competing with the submit flow's primary-colored button above it.
const segmentBridgeLinkStyle: CSSProperties = {
  display: 'block',
  textAlign: 'center',
  marginTop: -6,
  marginBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
  fontFamily: 'var(--font-sans)',
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--primary)',
  textDecoration: 'none',
};

export function HoleBottomCta({
  gameId,
  holeSegment,
  isStableford,
  isTexas,
  roundComplete,
  myScoreEntered,
  isLastHole,
  nextHole,
  disabled,
  broBridge,
  segmentSibling,
}: {
  gameId: string;
  holeSegment: HoleSegment;
  isStableford: boolean;
  isTexas: boolean;
  roundComplete: boolean;
  myScoreEntered: boolean;
  isLastHole: boolean;
  /** Hull-nummeret «Neste hull · N» peker på. */
  nextHole: number;
  /** Spillet er ikke aktivt, eller kortet er allerede levert. */
  disabled: boolean;
  broBridge: SegmentSiblingLink | null;
  segmentSibling: SegmentSiblingLink | null;
}): JSX.Element {
  const t = useTranslations('holes');
  const tModes = useTranslations('modes');

  // Stableford = solo-modus, så det er kun «ditt» scorekort, ikke et lag-kort.
  // Texas = ett delt lag-scorekort — «lagets». Best-ball-kopien
  // («Lever scorekort») holder vi som default for å unngå unødvendig
  // copy-endring der.
  const submitLabel = isStableford
    ? t('entry.submitScorecardSolo')
    : isTexas
      ? t('entry.submitScorecardTeam')
      : t('entry.submitScorecard');

  // #1466 §2 (broModus): on a front9 host whose back9 sibling is undelivered,
  // the whole round is delivered once — on the back9 host. So every «Lever
  // scorekort» here (roundComplete on any hole + isLastHole on hole 9) becomes
  // the bridge to hole 10 instead. Without covering both branches, «Lever
  // scorekort» would still show on holes 1–8 (roundComplete surfaces the CTA
  // everywhere) and contradict the one-delivery model. The secondary bridge
  // link below is suppressed in broModus to avoid a duplicate on hole 9.
  const submitOrBridgeLabel = broBridge
    ? t('entry.continueToSibling', {
        hole: broBridge.holeNumber,
        format: tModes(broBridge.gameMode as Parameters<typeof tModes>[0]),
      })
    : submitLabel;
  const submitOrBridgeHref = broBridge
    ? `/games/${broBridge.gameId}/holes/${broBridge.holeNumber}`
    : `/games/${gameId}/submit`;

  function resolveBottomAction(): { label: string; href: string | undefined } {
    const label = roundComplete
      ? submitOrBridgeLabel
      : !myScoreEntered
        ? t('entry.enterYourScore')
        : isLastHole
          ? submitOrBridgeLabel
          : t('entry.nextHole', { next: nextHole });

    const href = roundComplete
      ? submitOrBridgeHref
      : !myScoreEntered
        ? undefined
        : isLastHole
          ? submitOrBridgeHref
          : `/games/${gameId}/holes/${nextHole}`;

    return { label, href };
  }

  const bottom = resolveBottomAction();

  return (
    <>
      <BottomActionBar
        label={bottom.label}
        href={bottom.href}
        disabled={(!roundComplete && !myScoreEntered) || disabled}
      />

      {/* #1441 (owner-QA finding B): seamless bridge to the OTHER half of a
          split-day cup round. Only ever set at the segment's boundary hole
          (server-resolved — see `findSegmentSibling`). #1466 §2: suppressed in
          broModus (broBridge set) — the bridge is the primary CTA there, so a
          secondary copy would duplicate it on hole 9. The back9 «Tilbake til
          hull 9» link keeps rendering (broBridge is null on that side). */}
      {segmentSibling && !broBridge && (
        <SmartLink
          href={`/games/${segmentSibling.gameId}/holes/${segmentSibling.holeNumber}`}
          style={segmentBridgeLinkStyle}
        >
          {holeSegment === 'front9'
            ? t('entry.continueToSibling', {
                hole: segmentSibling.holeNumber,
                format: tModes(
                  segmentSibling.gameMode as Parameters<typeof tModes>[0],
                ),
              })
            : t('entry.backToSibling', {
                hole: segmentSibling.holeNumber,
                format: tModes(
                  segmentSibling.gameMode as Parameters<typeof tModes>[0],
                ),
              })}
        </SmartLink>
      )}
    </>
  );
}
