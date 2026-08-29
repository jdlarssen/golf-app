'use client';

import { useEffect, useState, type CSSProperties, type JSX } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import { writeScore } from '@/lib/sync/writeScore';
import { currentDeviceUserId } from '@/lib/sync/currentUser';
import { mergeServerScore } from '@/lib/sync/mergeServerScore';
import { drainQueue } from '@/lib/sync/syncWorker';
import { HoleStrip } from '@/components/hole/HoleStrip';
import { HoleHero } from '@/components/hole/HoleHero';
import { DistanceToGreen } from '@/components/hole/DistanceToGreen';
import { OnboardingBanner } from '@/components/hole/OnboardingBanner';
import { SpecificValueSheet } from '@/components/hole/SpecificValueSheet';
import { PokalIcon } from '@/components/icons';
import {
  isStablefordFamily,
  isScrambleFamily,
  modeCollapsesToTeamCard,
  formatCapturesPutts,
} from '@/lib/scoring/modes/types';
import {
  holeNumbersForSegment,
  lastHoleForSegment,
  positionInSegment,
} from '@/lib/games/holeScope';
import { WolfChoiceModal } from './WolfChoiceModal';
import { BingoBangoBongoEntry } from './BingoBangoBongoEntry';
import {
  resolveHoleClientProps,
  type HoleClientProps,
} from './holeClientProps';
import {
  useHoleCards,
  useMyScoredHoles,
  usePendingSyncCount,
  useSiblingScoredHoles,
} from './holeLiveQueries';
import {
  computeDisplayedStablefordTotal,
  isMySeatSubmitted,
  summarizeMyCard,
  type MySeatLookup,
} from './holeCards';
import { useWolfHole } from './useWolfHole';
import { useBingoBangoBongoHoles } from './useBingoBangoBongoHoles';
import {
  useOnboardingHint,
  usePuttsTracking,
  useSyncPulse,
} from './holeScreenState';
import { useHoleModeContextLine } from './useHoleModeContextLine';
import { PuttsTogglePill } from './PuttsTogglePill';
import { HoleScoreCardList, HoleSyncFooter } from './HoleScoreList';
import { HoleBottomCta } from './HoleBottomCta';
import {
  MissingFlightScoresHint,
  StablefordTotalSubtitle,
  WithdrawnBanner,
} from './HoleNotices';

// Props-kontrakten (og defaultene) bor i `holeClientProps.ts`; re-eksportert
// her fordi callsites og tester har importert dem herfra siden #1058.
export type { ClientPlayer, HoleClientProps } from './holeClientProps';
export { ONBOARDING_KEY } from './holeScreenState';

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
  minWidth: 44,
  minHeight: 44,
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
  width: 44,
  height: 44,
  marginRight: -6,
  color: 'var(--text-muted)',
  textDecoration: 'none',
  background: 'transparent',
};

const titleStyle: CSSProperties = {
  flex: 1,
  textAlign: 'center',
  fontFamily: 'var(--font-sans)',
  fontSize: 11,
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

export function HoleClient(rawProps: HoleClientProps): JSX.Element {
  const locale = useLocale();
  const t = useTranslations('holes');
  const {
    gameId,
    gameName,
    gameStatus,
    gameMode,
    holeSegment,
    withdrawn,
    currentHole,
    par,
    parByGender,
    playerGender,
    strokeIndex,
    myUserId,
    myTeamNumber,
    myTeamScoreOwnerId,
    myScoredHoles,
    courseId,
    greenCenter,
    freshPinCount,
    myStablefordTotal,
    myStablefordForCurrentHole,
    hideNetto,
    wolfPlayers,
    wolfChoices: wolfChoicesInitial,
    wolfPointsByUser,
    skinsAtStake,
    skinsCarriedIn,
    bingoBangoBongoHoles: bingoBangoBongoHolesInitial,
    roundRobinPlayers,
    segmentSibling,
    holeStripSibling,
    broBridge,
    players,
  } = resolveHoleClientProps(rawProps);

  const isStableford = isStablefordFamily(gameMode);
  const isWolf = gameMode === 'wolf';
  const isSkins = gameMode === 'skins';
  const isBBB = gameMode === 'bingo_bango_bongo';
  const isRoundRobin = gameMode === 'round_robin';
  // Texas scramble og Ambrose: ett kort per lag (server bygger players-array
  // med ÉN entry der userId = lag-kapteinens userId). Lookup-er som matcher
  // mot myUserId må derfor falle tilbake til lag-kortet for non-captain-
  // medlemmer. Submit-state speiler hele lagets state.
  const isTexas = isScrambleFamily(gameMode);
  // Florida Scramble (#283): step-aside-regelen vises som påminnelse på hull-flaten.
  // Kun for florida — ikke for texas eller ambrose.
  const isFlorida = gameMode === 'florida_scramble';
  // Team-collapsed moduser (#1058): server bygger ETT kort per lag i stedet
  // for ett per spiller — speiler eksakt samme gruppering som page.tsx sin
  // `playersForClient`-forgrening. Regelens ene hjem er
  // `modeCollapsesToTeamCard` (#1538/#1606): Texas-familien, alternate-shot-
  // matchplay-familien, og Patsome fra og med foursomes-segmentet på hull 7.
  // "Mitt kort" kan da ikke slås opp via `userId === myUserId` (jeg er ikke
  // nødvendigvis lag-kapteinen) — se `myCard`/`findMySeat` i holeCards.ts.
  const isTeamCollapsedMode = modeCollapsesToTeamCard(gameMode, currentHole);
  // Putt-registrering (#939): kun individuelle slag-/stableford-format viser
  // opt-in-bryteren + putts-feltet.
  const capturesPutts = formatCapturesPutts(gameMode);
  const seatLookup: MySeatLookup = {
    isTeamCollapsedMode,
    myTeamNumber,
    myUserId,
  };

  // Seed Dexie with server values on mount / hole change.
  // players is stable per render because the parent is a server component.
  // If this ever becomes a client-rendered parent, swap to a derived stable key.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Resolved once, before any merge — a Dexie transaction must not await
      // anything non-Dexie (PrematureCommitError).
      const currentUserId = await currentDeviceUserId();
      for (const p of players) {
        if (cancelled) return;
        // #1611: the seed goes through the shared merge like realtime and
        // catch-up do. It runs FIRST on a page load, so if it overwrote without
        // detection the catch-up right after would see matching timestamps and
        // the notice would be lost one level down. `enteredBy: ''` is the
        // server row's unknown author — it never matches a user id, so a seeded
        // row is never itself treated as typed here.
        await mergeServerScore(
          {
            gameId,
            userId: p.userId,
            holeNumber: currentHole,
            strokes: p.initialStrokes,
            putts: p.initialPutts, // #939
            enteredBy: '',
            clientUpdatedAt:
              p.initialClientUpdatedAt ?? '1970-01-01T00:00:00.000Z',
            serverUpdatedAt: p.initialServerUpdatedAt,
          },
          currentUserId,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, currentHole, players]);

  // ⚠️ De fire Dexie-live-queryene MÅ kalles i denne rekkefølgen — se
  // rekkefølge-kontrakten i `holeLiveQueries.ts` (HoleClient.test.tsx mocker
  // `useLiveQuery` med en teller keyet på den).
  const cards = useHoleCards(gameId, currentHole, players);
  const scoredHoles = useMyScoredHoles({
    gameId,
    gameMode,
    myUserId,
    myTeamScoreOwnerId,
    myScoredHoles,
  });
  const siblingScoredHoles = useSiblingScoredHoles({
    holeStripSibling,
    myUserId,
  });
  const pendingCount = usePendingSyncCount(gameId);

  const myDisplayedStablefordTotal = computeDisplayedStablefordTotal({
    cards,
    myUserId,
    par,
    gameMode,
    isStableford,
    myStablefordTotal,
    myStablefordForCurrentHole,
  });

  const [valueSheetFor, setValueSheetFor] = useState<string | null>(null);

  const wolf = useWolfHole({
    gameId,
    isWolf,
    currentHole,
    myUserId,
    gameStatus,
    wolfPlayers,
    wolfChoicesInitial,
    wolfPointsByUser,
  });
  const bingoBangoBongo = useBingoBangoBongoHoles({
    gameId,
    isBBB,
    currentHole,
    initialHoles: bingoBangoBongoHolesInitial,
  });
  const hint = useOnboardingHint(currentHole);
  const putts = usePuttsTracking(gameId);
  const syncPulse = useSyncPulse(locale);
  const holeContextLine = useHoleModeContextLine({
    currentHole,
    myUserId,
    isWolf,
    wolfBadgeText: wolf.badgeText,
    isSkins,
    skinsAtStake,
    skinsCarriedIn,
    isRoundRobin,
    roundRobinPlayers,
    isFlorida,
  });

  // Defensive disable — server already redirects on submitted, but keep a
  // safety net for non-active states reached via stale client state.
  const gameInactive = gameStatus !== 'active';
  const disabled = gameInactive || isMySeatSubmitted(players, seatLookup);

  // #1210: chip-triggeren er TASTINGS-ØKTEN — minst ett onSetScore-kall på
  // hullet, uansett hvilket kort det gjelder (alle kall tastes av brukeren
  // selv, enteredBy = myUserId). Bevisst IKKE playerId === myUserId: i
  // team-collapsed-modi er kortets playerId lag-representantens, så et
  // eierskaps-vilkår ville ekskludert ikke-kapteiner (#1058-fella).
  // onSetPutts holdes utenfor (putter tastes gjerne i etterkant).
  const [scoredThisSession, setScoredThisSession] = useState(false);

  async function onSetScore(playerId: string, value: number) {
    if (disabled) return;
    await writeScore({
      gameId,
      userId: playerId,
      holeNumber: currentHole,
      strokes: value,
      enteredBy: myUserId,
    });
    setScoredThisSession(true);
    syncPulse.pulse();
    void drainQueue();
    if (hint.visible) hint.dismiss();
  }

  function onLongPress(playerId: string) {
    if (disabled) return;
    setValueSheetFor(playerId);
  }

  // #939: writes only the putts field — writeScore merges, so the stroke score
  // is preserved. `next === null` clears the recorded putt count.
  async function onSetPutts(playerId: string, next: number | null) {
    if (disabled) return;
    await writeScore({
      gameId,
      userId: playerId,
      holeNumber: currentHole,
      putts: next,
      enteredBy: myUserId,
    });
    syncPulse.pulse();
    void drainQueue();
  }

  function onPickValue(value: number) {
    if (valueSheetFor != null) {
      void onSetScore(valueSheetFor, value);
    }
    setValueSheetFor(null);
  }

  async function clearScoreFor(playerId: string) {
    if (disabled) return;
    await writeScore({
      gameId,
      userId: playerId,
      holeNumber: currentHole,
      strokes: null,
      enteredBy: myUserId,
    });
    syncPulse.pulse();
    void drainQueue();
  }

  // ⋯-arkets X-knapp: nullstiller for spilleren arket er åpnet for.
  async function onClearScore() {
    if (valueSheetFor == null) return;
    await clearScoreFor(valueSheetFor);
    setValueSheetFor(null);
  }

  // «Angre»-lenka på selve kortet: ett trykk nullstiller den spillerens score.
  function onClearFromCard(playerId: string) {
    void clearScoreFor(playerId);
  }

  const { myScoreEntered, missingFlightScoreCount } = summarizeMyCard(
    cards,
    seatLookup,
  );
  // #1441: last hole + completion threshold are the SEGMENT's, not always
  // 18 — a front9 game's last hole is 9, and a back9 game's round is
  // complete at 9 holes filled (holes 10-18) even though its holes are
  // numbered up to 18.
  const totalHoles = holeNumbersForSegment(holeSegment).length;
  // #1441 (F5 polish): a front9/back9 game's real hole number (e.g. 12) and
  // its segment hole COUNT (9) live on different scales — HoleHero's plain
  // "{holeNumber} av {totalHoles}" suffix read as "hull 12 av 9" for those
  // games. Only set for segment games; 'full' keeps the unchanged suffix.
  const heroSegmentPosition =
    holeSegment === 'full'
      ? undefined
      : { position: positionInSegment(currentHole, holeSegment), total: totalHoles };
  // Once the player has a score on every hole, the natural next action is
  // to submit — regardless of which hole they're currently editing. Skip
  // the 'Neste hull' chain and offer the submit CTA on every screen. The
  // union set (#668/#1352) covers offline-entered holes too. It's scoped to
  // this game_id, so a front9/back9 segment (#1441) compares against its own
  // totalHoles correctly.
  const roundComplete = scoredHoles.size >= totalHoles;

  return (
    <>
      <div style={headerRowStyle}>
        <SmartLink
          href={`/games/${gameId}`}
          aria-label={t('entry.backAriaLabel')}
          style={backLinkStyle}
        >
          ‹
        </SmartLink>
        <div style={titleStyle}>{gameName}</div>
        <SmartLink
          href={`/games/${gameId}/leaderboard?return=hole&n=${currentHole}`}
          aria-label={t('entry.leaderboardAriaLabel')}
          style={leaderboardIconLinkStyle}
        >
          <PokalIcon size={20} />
        </SmartLink>
      </div>

      <StablefordTotalSubtitle
        isStableford={isStableford}
        total={myDisplayedStablefordTotal}
      />

      <HoleStrip
        gameId={gameId}
        currentHole={currentHole}
        scoredHoles={scoredHoles}
        holes={holeNumbersForSegment(holeSegment)}
        sibling={
          holeStripSibling
            ? {
                gameId: holeStripSibling.gameId,
                holes: holeStripSibling.holes,
                scoredHoles: siblingScoredHoles,
              }
            : null
        }
      />
      <HoleHero
        holeNumber={currentHole}
        totalHoles={totalHoles}
        segmentPosition={heroSegmentPosition}
        par={par}
        parByGender={parByGender}
        playerGender={playerGender}
        strokeIndex={strokeIndex}
        contextLine={holeContextLine}
        puttsToggle={
          <PuttsTogglePill
            capturesPutts={capturesPutts}
            enabled={putts.enabled}
            disabled={disabled}
            onToggle={putts.toggle}
          />
        }
        distanceLine={<DistanceToGreen center={greenCenter} />}
      />

      <OnboardingBanner visible={hint.visible} onDismiss={hint.dismiss} />

      <WithdrawnBanner withdrawn={withdrawn} gameId={gameId} />

      <div style={listStyle}>
        <HoleScoreCardList
          cards={cards}
          par={par}
          gameMode={gameMode}
          isStableford={isStableford}
          disabled={disabled}
          withdrawn={withdrawn}
          myUserId={myUserId}
          hideNetto={hideNetto}
          capturesPutts={capturesPutts}
          puttsTracking={putts.enabled}
          onSetScore={onSetScore}
          onLongPress={onLongPress}
          onClear={onClearFromCard}
          onSetPutts={onSetPutts}
        />
        <HoleSyncFooter
          syncing={syncPulse.syncing}
          savedAt={syncPulse.savedAt}
          pendingCount={pendingCount}
          courseId={courseId}
          currentHole={currentHole}
          scoredThisSession={scoredThisSession}
          freshPinCount={freshPinCount}
          gameInactive={gameInactive}
        />
      </div>

      {/* Bingo Bango Bongo — additiv seksjon under slag-padden, speiler
          wolf-badge-mønstret (seksjonen er uavhengig av scorekortet). */}
      {isBBB && (
        <BingoBangoBongoEntry
          gameId={gameId}
          holeNumber={currentHole}
          players={players.map((p) => ({
            userId: p.userId,
            name: p.nickname ?? p.name,
          }))}
          savedHole={bingoBangoBongo.savedHole}
          disabled={gameInactive}
          onSaved={bingoBangoBongo.onSaved}
        />
      )}

      <MissingFlightScoresHint count={missingFlightScoreCount} />

      <HoleBottomCta
        gameId={gameId}
        holeSegment={holeSegment}
        isStableford={isStableford}
        isTexas={isTexas}
        roundComplete={roundComplete}
        myScoreEntered={myScoreEntered}
        isLastHole={currentHole === lastHoleForSegment(holeSegment)}
        nextHole={currentHole + 1}
        disabled={disabled}
        broBridge={broBridge}
        segmentSibling={segmentSibling}
      />

      <SpecificValueSheet
        open={valueSheetFor !== null}
        par={par}
        onPick={onPickValue}
        onClear={onClearScore}
        onClose={() => setValueSheetFor(null)}
      />

      {wolf.modal && (
        <WolfChoiceModal
          isOpen={wolf.modal.isOpen}
          gameId={gameId}
          holeNumber={currentHole}
          wolfUserId={wolf.modal.wolfUserId}
          otherPlayers={wolf.modal.otherPlayers}
          onClose={wolf.modal.onClose}
          onChoiceSaved={wolf.modal.onChoiceSaved}
        />
      )}
    </>
  );
}
