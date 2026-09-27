'use client';

// Innholdet i score-lista på hull-flaten (#1716 — ren flytting ut av
// `HoleClient`): ett kort per spiller/lag i Bingo Bango Bongo, én rad per
// spiller/lag i alle andre formater (#2251, skinna taster), og fot-linja
// under dem (synk-status + green-pin-chip).

import type { JSX } from 'react';
import { ScoreCard } from '@/components/hole/ScoreCard';
import { FlightRow } from '@/components/hole/FlightRow';
import { SyncStatusLine } from '@/components/hole/SyncStatusLine';
import { GreenPinChip } from '@/components/hole/GreenPinChip';
import { PIN_GATE_MAX_PINS } from '@/lib/geo/pinRules';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { HoleCard } from './holeLiveQueries';
import { isCardLocked, stablefordPointsForCard } from './holeCards';

export function HoleScoreCardList({
  cards,
  par,
  gameMode,
  isStableford,
  disabled,
  withdrawn,
  myUserId,
  hideNetto,
  onSetScore,
  onLongPress,
  onClear,
}: {
  cards: HoleCard[];
  par: number;
  gameMode: GameMode;
  isStableford: boolean;
  disabled: boolean;
  withdrawn: boolean;
  myUserId: string;
  hideNetto: boolean;
  onSetScore: (playerId: string, value: number) => void;
  onLongPress: (playerId: string) => void;
  onClear: (playerId: string) => void;
}): JSX.Element {
  return (
    <>
      {cards.map((c) => {
        const stablefordPoints = stablefordPointsForCard({
          card: c,
          par,
          gameMode,
          isStableford,
        });
        // WD-spilleren kan ikke taste sin egen ball, men flight-kameratene
        // kan fortsatt taste sine scorer (#386). Et levert kort er låst (#2211).
        const cardDisabled = isCardLocked(c, {
          pageDisabled: disabled,
          withdrawn,
          myUserId,
        });
        return (
          <ScoreCard
            key={c.userId}
            playerId={c.userId}
            name={c.nickname ?? c.name}
            initial={c.initial}
            extraStrokes={c.extraStrokes}
            score={c.score}
            par={par}
            disabled={cardDisabled}
            submitted={c.submitted}
            hideNetto={hideNetto}
            stablefordPoints={stablefordPoints}
            onSetScore={onSetScore}
            onLongPress={onLongPress}
            onClear={onClear}
          />
        );
      })}
    </>
  );
}

/**
 * #2251: the flight as compact rows above the score rail. A row is read-only
 * here — tapping it hands the rail to that player (`onSelect`); the rail does
 * the writing. Points show in the stableford family, never in reveal (#1447).
 */
export function HoleFlightList({
  cards,
  par,
  gameMode,
  isStableford,
  disabled,
  withdrawn,
  myUserId,
  hideNetto,
  activeSeatId,
  onSelect,
}: {
  cards: HoleCard[];
  par: number;
  gameMode: GameMode;
  isStableford: boolean;
  disabled: boolean;
  withdrawn: boolean;
  myUserId: string;
  hideNetto: boolean;
  activeSeatId: string | null;
  onSelect: (playerId: string) => void;
}): JSX.Element {
  return (
    <div data-testid="flight-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {cards.map((c) => (
        <FlightRow
          key={c.userId}
          playerId={c.userId}
          name={c.nickname ?? c.name}
          initial={c.initial}
          extraStrokes={c.extraStrokes}
          score={c.score}
          par={par}
          active={!disabled && c.userId === activeSeatId}
          locked={isCardLocked(c, { pageDisabled: disabled, withdrawn, myUserId })}
          submitted={c.submitted}
          points={
            hideNetto
              ? null
              : stablefordPointsForCard({ card: c, par, gameMode, isStableford })
          }
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export function HoleSyncFooter({
  syncing,
  savedAt,
  pendingCount,
  courseId,
  currentHole,
  scoredThisSession,
  freshPinCount,
  gameInactive,
}: {
  syncing: boolean;
  savedAt: string;
  pendingCount: number;
  courseId: string | null;
  currentHole: number;
  scoredThisSession: boolean;
  freshPinCount: number;
  gameInactive: boolean;
}): JSX.Element {
  const showPinChip =
    courseId != null &&
    scoredThisSession &&
    freshPinCount < PIN_GATE_MAX_PINS &&
    !gameInactive;
  return (
    <>
      {(syncing || savedAt.length > 0 || pendingCount > 0) && (
        <SyncStatusLine
          syncing={syncing}
          savedAt={savedAt}
          pendingCount={pendingCount}
        />
      )}
      {/* #1210: green-pin-chip ved SyncStatusLine-plassen. Gates: tastings-
          økten (se scoredThisSession), fresh pin-gate (server-talt) og
          aktivt spill; online-sjekken eier chippen selv. */}
      {showPinChip && (
        <div style={{ marginTop: 8 }}>
          <GreenPinChip courseId={courseId} holeNumber={currentHole} />
        </div>
      )}
    </>
  );
}
