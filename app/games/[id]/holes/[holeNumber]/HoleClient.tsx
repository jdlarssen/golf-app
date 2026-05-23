'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
} from 'react';
import { SmartLink } from '@/components/ui/SmartLink';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, scoreKey, type LocalScore } from '@/lib/sync/db';
import { writeScore } from '@/lib/sync/writeScore';
import { startSyncListener, drainQueue } from '@/lib/sync/syncWorker';
import { ScoreCard } from '@/components/hole/ScoreCard';
import { HoleStrip } from '@/components/hole/HoleStrip';
import { HoleHero } from '@/components/hole/HoleHero';
import { OnboardingBanner } from '@/components/hole/OnboardingBanner';
import { SyncStatusLine } from '@/components/hole/SyncStatusLine';
import { BottomActionBar } from '@/components/hole/BottomActionBar';
import { SpecificValueSheet } from '@/components/hole/SpecificValueSheet';
import { PokalIcon } from '@/components/icons';
import { computeStablefordPoints } from '@/lib/scoring/modes/stableford';
import type { GameMode } from '@/lib/scoring/modes/types';

export type ClientPlayer = {
  userId: string;
  name: string;
  nickname: string | null;
  initial: string;
  extraStrokes: number;
  initialStrokes: number | null;
  initialClientUpdatedAt: string | null;
  initialServerUpdatedAt: string | null;
  submitted: boolean;
};

export interface HoleClientProps {
  gameId: string;
  gameName: string;
  gameStatus: 'draft' | 'scheduled' | 'active' | 'finished';
  /**
   * Spillets modus. Stableford bytter ut «Lever lagets scorekort» med
   * «Lever ditt scorekort», viser «Dine poeng»-subtittel i headeren, og
   * surfacer stableford-poeng per hull på score-kortet. Default-prop
   * `best_ball_netto` holder eldre callsites bakoverkompatible inntil
   * de oppdateres.
   */
  gameMode?: GameMode;
  currentHole: number;
  par: number;
  strokeIndex: number;
  myUserId: string;
  /**
   * How many of the player's 18 holes already have a score recorded
   * (server-side snapshot at render). When this is 18, the bottom CTA
   * becomes 'Lever scorekort' on every hole — you don't need to
   * navigate back to hole 18 to find the submit action.
   */
  myCompletedHoles: number;
  /**
   * Stableford-totalen til brukeren server-side ved render (summen av
   * stableford-poeng over alle ferdig-tastede hull). Null for best-ball.
   * Brukes til «Dine poeng: N»-subtittelen i headeren — oppdateres ved
   * neste server-render (etter hull-bytte). Live optimistic-update for
   * current hull skjer client-side via computeStablefordPoints.
   */
  myStablefordTotal?: number | null;
  /**
   * Stableford-poengene som teller for *current* hull spesifikt, ved
   * server-side render. Null hvis hullet ikke er tastet ennå eller hvis
   * spillet ikke er stableford. Brukes til å initialisere subtitle-en før
   * useLiveQuery rekker å hydrere.
   */
  myStablefordForCurrentHole?: number | null;
  /**
   * Reveal-modus flag forwarded from the server: true only when
   * `score_visibility='reveal'` AND status is still pre-finished. Forwarded
   * to each ScoreCard so the +N SLAG badge stays hidden until admin avslutter.
   */
  hideNetto?: boolean;
  players: ClientPlayer[];
}

export const ONBOARDING_KEY = 'torny-hole-hint-dismissed';

const SYNC_PULSE_MS = 700;

const headerRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px 8px',
  gap: 12,
};

const backLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 32,
  minHeight: 32,
  marginLeft: -6,
  padding: 6,
  fontSize: 18,
  lineHeight: 1,
  color: 'var(--text)',
  textDecoration: 'none',
  background: 'transparent',
};

const leaderboardIconLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 34,
  height: 34,
  marginRight: -6,
  color: 'var(--text-muted)',
  textDecoration: 'none',
  background: 'transparent',
};

const titleStyle: CSSProperties = {
  flex: 1,
  textAlign: 'center',
  fontFamily: 'var(--font-sans)',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.20em',
  color: 'var(--text-muted)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '60%',
  margin: '0 auto',
};

const listStyle: CSSProperties = {
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  flex: 1,
  overflowY: 'auto',
};

export function HoleClient(props: HoleClientProps): JSX.Element {
  const {
    gameId,
    gameName,
    gameStatus,
    gameMode = 'best_ball_netto',
    currentHole,
    par,
    strokeIndex,
    myUserId,
    myCompletedHoles,
    myStablefordTotal = null,
    myStablefordForCurrentHole = null,
    hideNetto = false,
    players,
  } = props;

  const isStableford = gameMode === 'stableford';

  // Sync listener — start once on mount.
  useEffect(() => {
    startSyncListener();
  }, []);

  // Seed Dexie with server values on mount / hole change.
  // players is stable per render because the parent is a server component.
  // If this ever becomes a client-rendered parent, swap to a derived stable key.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const p of players) {
        const id = scoreKey(gameId, p.userId, currentHole);
        const existing = await localDb.scores.get(id);
        const seedClientUpdatedAt =
          p.initialClientUpdatedAt ?? '1970-01-01T00:00:00.000Z';
        if (!existing || existing.clientUpdatedAt < seedClientUpdatedAt) {
          if (cancelled) return;
          await localDb.scores.put({
            id,
            gameId,
            userId: p.userId,
            holeNumber: currentHole,
            strokes: p.initialStrokes,
            enteredBy: '',
            clientUpdatedAt: seedClientUpdatedAt,
            serverUpdatedAt: p.initialServerUpdatedAt,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, currentHole, players]);

  const scoreIds = useMemo(
    () => players.map((p) => scoreKey(gameId, p.userId, currentHole)),
    [gameId, currentHole, players],
  );
  const scoreIdsKey = scoreIds.join('|');

  const localRows = useLiveQuery<(LocalScore | undefined)[]>(
    () => localDb.scores.bulkGet(scoreIds),
    [scoreIdsKey],
  );

  const cards = players.map((p, i) => {
    const row = localRows?.[i];
    const score = row?.strokes ?? null;
    return { ...p, score };
  });

  // For stableford: regn ut «Dine poeng» live ved å justere server-totalen
  // med delta-en for current hull (server-snapshot vs live-Dexie-rad). Dette
  // gir umiddelbar feedback når brukeren taster et nytt slag — uten å vente
  // på neste server-render. For best-ball er hele blokken null.
  const myLiveCard = cards.find((c) => c.userId === myUserId);
  const myLiveScoreForCurrent = myLiveCard?.score ?? null;
  const myExtraStrokesForCurrent = myLiveCard?.extraStrokes ?? 0;
  const myLivePointsForCurrent =
    isStableford && myLiveScoreForCurrent != null
      ? computeStablefordPoints({
          par,
          netStrokes: myLiveScoreForCurrent - myExtraStrokesForCurrent,
        })
      : null;
  const myDisplayedStablefordTotal = isStableford
    ? (myStablefordTotal ?? 0) -
      (myStablefordForCurrentHole ?? 0) +
      (myLivePointsForCurrent ?? 0)
    : null;

  const [valueSheetFor, setValueSheetFor] = useState<string | null>(null);

  // Onboarding banner: visible only on hole 1, and only if not dismissed.
  // We track "dismissed" rather than "show" so we never assign state inside an
  // effect on subsequent renders — the visibility is purely derived.
  //
  // The lazy initializer reads localStorage synchronously to avoid a banner
  // flash on every page load. Trade-off: a returning user landing on hole 1
  // may see a one-paint banner-mismatch warning in dev (React rehydration).
  // Acceptable: the banner is only on hole 1 and dismisses on first interaction.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === '1';
    } catch {
      return false;
    }
  });
  const showHint = currentHole === 1 && !dismissed;

  function dismissHint() {
    setDismissed(true);
    try {
      localStorage.setItem(ONBOARDING_KEY, '1');
    } catch {
      // best effort
    }
  }

  // Sync pulse — local-only signal "we wrote a score recently".
  const [syncing, setSyncing] = useState(false);
  const [savedAt, setSavedAt] = useState<string>('');
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  function pulseSync() {
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    setSyncing(true);
    pulseTimerRef.current = setTimeout(() => {
      setSyncing(false);
      setSavedAt(
        new Date().toLocaleTimeString('nb-NO', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
      pulseTimerRef.current = null;
    }, SYNC_PULSE_MS);
  }

  // Defensive disable — server already redirects on submitted, but keep a
  // safety net for non-active states reached via stale client state.
  const gameInactive = gameStatus !== 'active';
  const me = players.find((p) => p.userId === myUserId);
  const submitted = me?.submitted ?? false;
  const disabled = gameInactive || submitted;

  async function onSetScore(playerId: string, value: number) {
    if (disabled) return;
    await writeScore({
      gameId,
      userId: playerId,
      holeNumber: currentHole,
      strokes: value,
      enteredBy: myUserId,
    });
    pulseSync();
    void drainQueue();
    if (showHint) dismissHint();
  }

  function onLongPress(playerId: string) {
    if (disabled) return;
    setValueSheetFor(playerId);
  }

  function onPickValue(value: number) {
    if (valueSheetFor != null) {
      void onSetScore(valueSheetFor, value);
    }
    setValueSheetFor(null);
  }

  async function onClearScore() {
    if (valueSheetFor == null) return;
    if (disabled) return;
    await writeScore({
      gameId,
      userId: valueSheetFor,
      holeNumber: currentHole,
      strokes: null,
      enteredBy: myUserId,
    });
    pulseSync();
    void drainQueue();
    setValueSheetFor(null);
  }

  const allConfirmed = cards.length > 0 && cards.every((c) => c.score != null);
  const next = currentHole + 1;
  const isLastHole = currentHole === 18;
  // Once the player has a score on every hole, the natural next action is
  // to submit — regardless of which hole they're currently editing. Skip
  // the 'Neste hull' chain and offer the submit CTA on every screen.
  const roundComplete = myCompletedHoles >= 18;

  // Stableford = solo-modus, så det er kun «ditt» scorekort, ikke et lag-kort.
  // Best-ball-kopien («Lever scorekort») holder vi som default for å unngå
  // unødvendig copy-endring der.
  const submitLabel = isStableford ? 'Lever ditt scorekort' : 'Lever scorekort';
  const bottomLabel = roundComplete
    ? submitLabel
    : !allConfirmed
      ? 'Bekreft alle scorer'
      : isLastHole
        ? submitLabel
        : `Neste hull · ${next}`;

  const bottomHref = roundComplete
    ? `/games/${gameId}/submit`
    : !allConfirmed
      ? undefined
      : isLastHole
        ? `/games/${gameId}/submit`
        : `/games/${gameId}/holes/${next}`;

  const bottomDisabled = (!roundComplete && !allConfirmed) || disabled;

  return (
    <>
      <div style={headerRowStyle}>
        <SmartLink
          href={`/games/${gameId}`}
          aria-label="Tilbake til turneringen"
          style={backLinkStyle}
        >
          ‹
        </SmartLink>
        <div style={titleStyle}>{gameName}</div>
        <SmartLink
          href={`/games/${gameId}/leaderboard?return=hole&n=${currentHole}`}
          aria-label="Vis leaderboard"
          style={leaderboardIconLinkStyle}
        >
          <PokalIcon size={20} />
        </SmartLink>
      </div>

      {/* Stableford-subtittel: «Dine poeng: N». Erstatter den implisitte
          «Lagets totalsum»-narrativen for solo-modus. Plassert som en stille
          chip-stil under headeren, før hull-stripa — informativ uten å rope.
          Bruker tabular-nums for at totalen ikke vippes hver gang tallet
          oppdaterer. */}
      {isStableford && myDisplayedStablefordTotal !== null && (
        <div
          data-testid="stableford-total-subtitle"
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '0 18px 6px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 10.5,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: 'var(--text-muted)',
            }}
          >
            Dine poeng:{' '}
            <span
              className="score-num"
              style={{
                color: 'var(--accent)',
                fontFamily: 'var(--font-serif)',
                fontSize: 13,
                marginLeft: 2,
              }}
            >
              {myDisplayedStablefordTotal}
            </span>
          </span>
        </div>
      )}

      <HoleStrip gameId={gameId} currentHole={currentHole} />
      <HoleHero
        holeNumber={currentHole}
        par={par}
        strokeIndex={strokeIndex}
      />

      <OnboardingBanner visible={showHint} onDismiss={dismissHint} />

      <div style={listStyle}>
        {cards.map((c) => {
          // Per-kort stableford-poeng for current hull. Vi regner client-side
          // av samme grunn som vi viser de live (= umiddelbar feedback uten
          // å vente på neste server-render). Bruker spillerens egne
          // extraStrokes som allerede er bakt inn i ClientPlayer.
          const stablefordPoints =
            isStableford && c.score != null
              ? computeStablefordPoints({
                  par,
                  netStrokes: c.score - c.extraStrokes,
                })
              : null;
          return (
            <ScoreCard
              key={c.userId}
              playerId={c.userId}
              name={c.nickname ?? c.name}
              initial={c.initial}
              extraStrokes={c.extraStrokes}
              score={c.score}
              par={par}
              disabled={disabled}
              hideNetto={hideNetto}
              stablefordPoints={stablefordPoints}
              onSetScore={onSetScore}
              onLongPress={onLongPress}
            />
          );
        })}
        <SyncStatusLine syncing={syncing} savedAt={savedAt} />
      </div>

      <BottomActionBar
        label={bottomLabel}
        href={bottomHref}
        disabled={bottomDisabled}
      />

      <SpecificValueSheet
        open={valueSheetFor !== null}
        par={par}
        onPick={onPickValue}
        onClear={onClearScore}
        onClose={() => setValueSheetFor(null)}
      />
    </>
  );
}
