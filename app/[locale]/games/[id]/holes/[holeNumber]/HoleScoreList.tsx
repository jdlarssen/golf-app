'use client';

// Innholdet i score-lista på hull-flaten (#1716 — ren flytting ut av
// `HoleClient`): ett kort per spiller/lag, og fot-linja under dem
// (synk-status + green-pin-chip).

import type { JSX } from 'react';
import { ScoreCard } from '@/components/hole/ScoreCard';
import { PuttsField } from '@/components/hole/PuttsField';
import { SyncStatusLine } from '@/components/hole/SyncStatusLine';
import { GreenPinChip } from '@/components/hole/GreenPinChip';
import { PIN_GATE_MAX_PINS } from '@/lib/geo/pinRules';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { HoleCard } from './holeLiveQueries';
import { stablefordPointsForCard } from './holeCards';

export function HoleScoreCardList({
  cards,
  par,
  gameMode,
  isStableford,
  disabled,
  withdrawn,
  myUserId,
  hideNetto,
  capturesPutts,
  puttsTracking,
  onSetScore,
  onLongPress,
  onClear,
  onSetPutts,
}: {
  cards: HoleCard[];
  par: number;
  gameMode: GameMode;
  isStableford: boolean;
  disabled: boolean;
  withdrawn: boolean;
  myUserId: string;
  hideNetto: boolean;
  capturesPutts: boolean;
  puttsTracking: boolean;
  onSetScore: (playerId: string, value: number) => void;
  onLongPress: (playerId: string) => void;
  onClear: (playerId: string) => void;
  onSetPutts: (playerId: string, next: number | null) => void;
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
        // kan fortsatt taste sine scorer (#386).
        const isMyCard = c.userId === myUserId;
        const cardDisabled = disabled || (withdrawn && isMyCard);
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
            hideNetto={hideNetto}
            stablefordPoints={stablefordPoints}
            onSetScore={onSetScore}
            onLongPress={onLongPress}
            onClear={onClear}
            belowScore={
              capturesPutts && puttsTracking ? (
                <PuttsField
                  playerId={c.userId}
                  name={c.nickname ?? c.name}
                  putts={c.putts}
                  disabled={cardDisabled}
                  onSetPutts={onSetPutts}
                />
              ) : undefined
            }
          />
        );
      })}
    </>
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
