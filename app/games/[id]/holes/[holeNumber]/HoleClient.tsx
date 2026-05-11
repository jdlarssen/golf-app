'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
} from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, scoreKey, type LocalScore } from '@/lib/sync/db';
import { writeScore } from '@/lib/sync/writeScore';
import { startSyncListener, drainQueue } from '@/lib/sync/syncWorker';
import { useInputMode } from '@/lib/hooks/useInputMode';
import { ScoreCard } from '@/components/hole/ScoreCard';
import { HoleStrip } from '@/components/hole/HoleStrip';
import { HoleHero } from '@/components/hole/HoleHero';
import { OnboardingBanner } from '@/components/hole/OnboardingBanner';
import { SyncStatusLine } from '@/components/hole/SyncStatusLine';
import { BottomActionBar } from '@/components/hole/BottomActionBar';
import { SettingsSheet } from '@/components/hole/SettingsSheet';
import { SpecificValueSheet } from '@/components/hole/SpecificValueSheet';

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
  currentHole: number;
  par: number;
  strokeIndex: number;
  myUserId: string;
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

const settingsBtnStyle: CSSProperties = {
  background: 'rgba(229,224,211,0.5)',
  border: '1px solid var(--border)',
  borderRadius: 9999,
  width: 34,
  height: 30,
  fontSize: 16,
  color: 'var(--text)',
  cursor: 'pointer',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  letterSpacing: '0.05em',
  lineHeight: 1,
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
    currentHole,
    par,
    strokeIndex,
    myUserId,
    players,
  } = props;

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
    const confirmed = score != null;
    return { ...p, score, confirmed };
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [valueSheetFor, setValueSheetFor] = useState<string | null>(null);
  const [mode, setMode] = useInputMode();

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

  const allConfirmed = cards.length > 0 && cards.every((c) => c.confirmed);
  const next = currentHole + 1;
  const isLastHole = currentHole === 18;

  const bottomLabel = !allConfirmed
    ? 'Bekreft alle scorer'
    : isLastHole
      ? 'Lever scorekort'
      : `Neste hull · ${next}`;

  const bottomHref = !allConfirmed
    ? undefined
    : isLastHole
      ? `/games/${gameId}/scorecard`
      : `/games/${gameId}/holes/${next}`;

  const bottomDisabled = !allConfirmed || disabled;

  return (
    <>
      <div style={headerRowStyle}>
        <Link
          href={`/games/${gameId}`}
          aria-label="Tilbake til turneringen"
          style={backLinkStyle}
        >
          ‹
        </Link>
        <div style={titleStyle}>{gameName}</div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Innstillinger"
          style={settingsBtnStyle}
        >
          ⋯
        </button>
      </div>

      <HoleStrip gameId={gameId} currentHole={currentHole} />
      <HoleHero
        holeNumber={currentHole}
        par={par}
        strokeIndex={strokeIndex}
      />

      <OnboardingBanner visible={showHint} onDismiss={dismissHint} />

      <div style={listStyle}>
        {cards.map((c) => (
          <ScoreCard
            key={c.userId}
            playerId={c.userId}
            name={c.nickname ?? c.name}
            initial={c.initial}
            extraStrokes={c.extraStrokes}
            score={c.score}
            par={par}
            confirmed={c.confirmed}
            mode={mode}
            disabled={disabled}
            onSetScore={onSetScore}
            onLongPress={onLongPress}
          />
        ))}
        <SyncStatusLine syncing={syncing} savedAt={savedAt} />
      </div>

      <BottomActionBar
        label={bottomLabel}
        href={bottomHref}
        disabled={bottomDisabled}
      />

      <SettingsSheet
        open={settingsOpen}
        mode={mode}
        onPick={setMode}
        onClose={() => setSettingsOpen(false)}
      />
      <SpecificValueSheet
        open={valueSheetFor !== null}
        par={par}
        onPick={onPickValue}
        onClose={() => setValueSheetFor(null)}
      />
    </>
  );
}
