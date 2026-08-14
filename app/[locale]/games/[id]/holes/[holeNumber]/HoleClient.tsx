'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type JSX,
  type ReactNode,
} from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatTime } from '@/lib/i18n/format';
import { SmartLink } from '@/components/ui/SmartLink';
import { useLiveQuery } from 'dexie-react-hooks';
import { localDb, scoreKey, type LocalScore } from '@/lib/sync/db';
import { isActiveForGame } from '@/lib/sync/queueScope';
import { writeScore } from '@/lib/sync/writeScore';
import { drainQueue } from '@/lib/sync/syncWorker';
import { ScoreCard } from '@/components/hole/ScoreCard';
import { PuttsField } from '@/components/hole/PuttsField';
import { HoleStrip } from '@/components/hole/HoleStrip';
import { HoleHero } from '@/components/hole/HoleHero';
import { DistanceToGreen } from '@/components/hole/DistanceToGreen';
import { GreenPinChip } from '@/components/hole/GreenPinChip';
import { PIN_GATE_MAX_PINS } from '@/lib/geo/pinRules';
import type { LatLng } from '@/lib/geo/distance';
import { OnboardingBanner } from '@/components/hole/OnboardingBanner';
import { SyncStatusLine } from '@/components/hole/SyncStatusLine';
import { BottomActionBar } from '@/components/hole/BottomActionBar';
import { SpecificValueSheet } from '@/components/hole/SpecificValueSheet';
import { PokalIcon, PinFlagSm } from '@/components/icons';
import { computeStablefordPoints } from '@/lib/scoring/modes/stableford';
import { computeModifiedStablefordPoints } from '@/lib/scoring/modes/modifiedStableford';
import {
  isStablefordFamily,
  isScrambleFamily,
  isAlternateShotMatchplay,
  formatCapturesPutts,
} from '@/lib/scoring/modes/types';
import type {
  GameMode,
  ScoringGender,
  WolfChoice,
  WolfHoleChoice,
  BingoBangoBongoHoleInput,
} from '@/lib/scoring/modes/types';
import type { HoleParByGender } from '@/lib/games/parDisplay';
import { scoreOwnerForHole, scoreOwnerUserIds } from '@/lib/games/scoreOwner';
import {
  holeNumbersForSegment,
  lastHoleForSegment,
  positionInSegment,
} from '@/lib/games/holeScope';
import type { HoleSegment } from '@/lib/scoring';
import { subscribeWolfChoices } from '@/lib/wolf/subscribeWolfChoices';
import { subscribeBingoBangoBongo } from '@/lib/bbb/subscribeBingoBangoBongo';
import { WolfChoiceModal } from './WolfChoiceModal';
import { BingoBangoBongoEntry } from './BingoBangoBongoEntry';
import { RoundRobinBadge } from './RoundRobinBadge';
import { HoleContextLine } from '@/components/hole/HoleContextLine';
import { determineWolfForHole } from './wolfRotation';
import type { RoundRobinConstellationPlayer } from '@/lib/scoring/modes/roundRobin';

export type ClientPlayer = {
  userId: string;
  name: string;
  nickname: string | null;
  initial: string;
  extraStrokes: number;
  initialStrokes: number | null;
  initialPutts: number | null;
  initialClientUpdatedAt: string | null;
  initialServerUpdatedAt: string | null;
  submitted: boolean;
  /**
   * Laget kortet representerer (kun satt for team-collapsed moduser — Texas-
   * familien og alternate-shot-matchplay-familien — der server bygger ETT
   * kort per lag, keyed på lag-kapteinens userId). Brukes sammen med
   * `myTeamNumber` til å finne "mitt kort" når `myUserId` ikke matcher
   * kort-userId-en (jeg er ikke kapteinen). Null/undefined for
   * per-spiller-moduser der `userId` alltid er meg selv. #1058.
   */
  teamNumber?: number | null;
};

export interface HoleClientProps {
  gameId: string;
  gameName: string;
  gameStatus: 'draft' | 'scheduled' | 'active' | 'finished';
  /**
   * True when the current player has been withdrawn (WD) from the game (#386).
   * When set, a locked-banner is shown above the score cards and the player's
   * own ScoreCard is disabled. Other players' cards remain interactive so
   * flight-mates can still enter scores.
   */
  withdrawn?: boolean;
  /**
   * Spillets modus. Stableford bytter ut «Lever lagets scorekort» med
   * «Lever ditt scorekort», viser «Dine poeng»-subtittel i headeren, og
   * surfacer stableford-poeng per hull på score-kortet. Default-prop
   * `best_ball` holder eldre callsites bakoverkompatible inntil
   * de oppdateres.
   */
  gameMode?: GameMode;
  /**
   * #1441 (splittet cup-dag): begrenser spillet til hull 1-9 ('front9'),
   * 10-18 ('back9'), eller hele runden (default 'full'). Styrer
   * isLastHole/roundComplete-grensa, HoleStrip sitt hull-utvalg og
   * HoleHero sin «hull N av total»-tekst. Default 'full' holder eldre
   * callsites bakoverkompatible inntil de oppdateres.
   */
  holeSegment?: HoleSegment;
  currentHole: number;
  par: number;
  /**
   * Per-kjønn-par for hullet (`course_holes.par_<gender>`). Brukes til å
   * vise avvik-indikator i `HoleHero` når hullet har annerledes par for
   * medspillere av andre kjønn. Optional — uten den vises ingen indikator. #240.
   */
  parByGender?: HoleParByGender;
  /**
   * Spillerens tee-gender (fra `game_players.tee_gender`). Brukes til å
   * ekskludere egen kjønn fra avvik-tooltip-en. #240.
   */
  playerGender?: ScoringGender;
  strokeIndex: number;
  myUserId: string;
  /**
   * Innlogget spillers `game_players.team_number` (fra `me.team_number`
   * server-side). Kun relevant for team-collapsed moduser — brukes til å
   * finne "mitt kort" blant lag-kortene når jeg ikke er lag-kapteinen (og
   * derfor ikke matcher noe kort-userId direkte). Null/undefined for
   * per-spiller-moduser og for spillere uten lag. #1058.
   */
  myTeamNumber?: number | null;
  /**
   * Who owns the team's shared scores rows (`teamScoreOwnerId`, server-side),
   * or null when I own my own rows — no team, unreadable roster, everyone
   * withdrawn. Only differs from `myUserId` for a non-captain in a
   * team-collapsed mode; that's exactly the seat whose completion set has to
   * count the captain's rows instead of its own. #1577.
   */
  myTeamScoreOwnerId?: string | null;
  /**
   * WHICH of the player's holes already have a score recorded (server-side
   * snapshot at render, #1352 — used to be a bare count). Unioned with the
   * live Dexie set below: it drives both the hole strip's «missing score»
   * marking and the bottom CTA, which becomes 'Lever scorekort' on every hole
   * once the round is complete — you don't need to navigate back to the last
   * hole to find the submit action. Already owner-filtered server-side (#1577).
   */
  myScoredHoles: number[];
  /**
   * Banens course_id (#1210) — trengs av green-pin-chippen for insert.
   * Null når spillet mangler bane (chip og avstandslinje skjules da).
   */
  courseId?: string | null;
  /**
   * Crowdsourcet green-senter for hullet (#1210): per-akse-median av
   * green_pins, ferdigregnet server-side i page.tsx (lib/geo/greenCenter.ts).
   * Null når hullet ikke har pins — da vises ingen avstandslinje.
   */
  greenCenter?: LatLng | null;
  /**
   * Antall pins nyere enn PIN_GATE_WINDOW_DAYS for hullet, server-talt ved
   * page-load (#1210). Chip-gaten: vises kun når < PIN_GATE_MAX_PINS. Stale
   * i løpet av runden er akseptert (verste fall pin #4 — DB-triggeren
   * green_pins_gate er ytre vakt).
   */
  freshPinCount?: number;
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
  /**
   * Wolf-mode-spesifikt: liste av de n spillerne (3-5, #465) med team_number
   * 1..n. Brukes til å regne ut hvem som er Wolf på hvilket hull (rotasjon) og
   * til å rendre partner-valg i WolfChoiceModal. Kun satt når gameMode === 'wolf'.
   */
  wolfPlayers?: Array<{ userId: string; teamNumber: number; name: string }>;
  /**
   * Wolf-mode-spesifikt: alle eksisterende valg fra `wolf_hole_choices` for
   * dette spillet, lest server-side ved page-render. Brukes som initial state
   * for realtime-merged client state. Empty array tilsvarer "ingen valg ennå".
   */
  wolfChoices?: WolfHoleChoice[];
  /**
   * Wolf-mode-spesifikt: akkumulerte poeng per userId før gjeldende hull,
   * server-computert via `computeLeaderboard()`. Brukes til trailing-wolf-
   * regelen (hull 17-18). Empty record = alle spillere på 0.
   */
  wolfPointsByUser?: Record<string, number>;
  /**
   * Skins-modus: antall skins på spill på dette hullet (`atStake` fra
   * `skins.compute(ctx).holes[holeNumber]`). Server-computert ved render.
   * Vises som informasjons-banner over score-input. Undefined for andre modi.
   */
  skinsAtStake?: number;
  /**
   * Skins-modus: antall skins båret inn i dette hullet fra tidligere delte hull
   * (`carriedIn`). 0 = friskt hull. Brukes til å vise «potten har rullet videre»-
   * hint når > 0. Undefined for andre modi.
   */
  skinsCarriedIn?: number;
  /**
   * Bingo Bango Bongo-modus: alle lagrede rader for dette spillet, lest
   * server-side ved page-render. Brukes som initial state for realtime-merged
   * client state. Empty array = ingen rader ennå.
   */
  bingoBangoBongoHoles?: BingoBangoBongoHoleInput[];
  /**
   * Round Robin-modus: de 4 spillerne med teamNumber 1-4 og visningsnavn.
   * Brukes til å beregne og vise partner-konstellasjon-badge per hull.
   * Kun satt når gameMode === 'round_robin'.
   */
  roundRobinPlayers?: RoundRobinConstellationPlayer[];
  /**
   * #1441 (owner-QA finding B): server-resolved bridge to the OTHER half of
   * a split-day cup round (front9 ⇄ back9), only ever set at the segment's
   * boundary hole (front9's hole 9, back9's hole 10) — see
   * `findSegmentSibling`. Null everywhere else, including 'full'-segment
   * games. Renders a secondary link below the primary CTA; never replaces
   * this game's own submit/completeness flow.
   */
  segmentSibling?: {
    gameId: string;
    holeNumber: number;
    gameMode: GameMode;
  } | null;
  /**
   * #1466 (eier-tillegget): the sibling half's own holes on a split cup day,
   * for the full 1–18 hole strip. Own holes stay linked to this game; sibling
   * holes link across to the other host. Null → today's segment-only strip.
   */
  holeStripSibling?: { gameId: string; holes: number[] } | null;
  /**
   * #1466 §2 (broModus): the front9 host's bridge to the sibling's hole 10,
   * set only when this is a front9 host whose back9 sibling is still
   * undelivered. When present it REPLACES every «Lever scorekort» in the bottom
   * CTA (both the isLastHole and roundComplete branches) with the bridge —
   * delivery happens once, on the back9 host — and suppresses the duplicate
   * secondary bridge link. Null on the back9 side and off broModus.
   */
  broBridge?: { gameId: string; holeNumber: number; gameMode: GameMode } | null;
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

const listStyle: CSSProperties = {
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  flex: 1,
  overflowY: 'auto',
};

export function HoleClient(props: HoleClientProps): JSX.Element {
  const locale = useLocale();
  const t = useTranslations('holes');
  const tModes = useTranslations('modes');
  const {
    gameId,
    gameName,
    gameStatus,
    gameMode = 'best_ball',
    holeSegment = 'full',
    withdrawn = false,
    currentHole,
    par,
    parByGender,
    playerGender,
    strokeIndex,
    myUserId,
    myTeamNumber = null,
    myTeamScoreOwnerId = null,
    myScoredHoles,
    courseId = null,
    greenCenter = null,
    freshPinCount = 0,
    myStablefordTotal = null,
    myStablefordForCurrentHole = null,
    hideNetto = false,
    wolfPlayers,
    wolfChoices: wolfChoicesInitial,
    wolfPointsByUser,
    skinsAtStake,
    skinsCarriedIn,
    bingoBangoBongoHoles: bingoBangoBongoHolesInitial,
    roundRobinPlayers,
    segmentSibling = null,
    holeStripSibling = null,
    broBridge = null,
    players,
  } = props;

  const isStableford = isStablefordFamily(gameMode);
  const stablefordPointsFn = gameMode === 'modified_stableford'
    ? computeModifiedStablefordPoints
    : computeStablefordPoints;
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
  const isPatsome = gameMode === 'patsome';
  // Team-collapsed moduser (#1058): server bygger ETT kort per lag i stedet
  // for ett per spiller — speiler eksakt samme gruppering som page.tsx sin
  // `playersForClient`-forgrening (Texas-familien, alternate-shot-matchplay-
  // familien, og Patsome fra og med foursomes-segmentet på hull 7). "Mitt
  // kort" kan da ikke slås opp via `userId === myUserId` (jeg er ikke
  // nødvendigvis lag-kapteinen) — se `myCard` under.
  const isTeamCollapsedMode =
    isTexas || isAlternateShotMatchplay(gameMode) || (isPatsome && currentHole >= 7);
  // Putt-registrering (#939): kun individuelle slag-/stableford-format viser
  // opt-in-bryteren + putts-feltet.
  const capturesPutts = formatCapturesPutts(gameMode);

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
            putts: p.initialPutts, // #939
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

  // #668 / #1352: WHICH of THIS player's holes are entered locally, across the
  // whole round rather than just the current screen. The server snapshot
  // (`myScoredHoles`) misses strokes that are still in the offline queue, so a
  // player who taps in every hole offline would never see the submit CTA.
  // Unioned with the server set below — the server side is the floor (synced
  // holes from earlier sessions Dexie may not hold), the local side adds the
  // unsynced delta. `scores` is unique on (game_id, user_id, hole_number), so
  // the union is never smaller than either side: it can only reveal the CTA
  // earlier, never hide one that used to show. Since #1352 the set — not a
  // count — is the single source for both the CTA and the hole strip.
  //
  // #1577: mirrors the server select — the shared team row lives under the
  // captain's id, so a non-captain reads both ids and keeps the one that owns
  // each hole. Identical to the old single-id query whenever I own my rows.
  const scoredHoleOwnerIds = useMemo(
    () => scoreOwnerUserIds(gameMode, myUserId, myTeamScoreOwnerId),
    [gameMode, myUserId, myTeamScoreOwnerId],
  );
  const scoredHoleOwnerKey = scoredHoleOwnerIds.join('|');
  const localScoredRows = useLiveQuery(
    () =>
      localDb.scores
        .where('[gameId+userId]')
        .anyOf(scoredHoleOwnerIds.map((ownerId) => [gameId, ownerId]))
        .filter((r) => r.strokes != null)
        .toArray(),
    [gameId, scoredHoleOwnerKey],
  );
  const scoredHoles = new Set<number>([
    ...myScoredHoles,
    ...(localScoredRows ?? [])
      // The id list is the fetch; this is the rule. Keeping it out here rather
      // than inside the Dexie callback means a captain's row only counts on the
      // holes where the mode actually collapses — patsome's 4BBB half stays
      // mine even though the same round's foursomes half is the team's.
      .filter(
        (r) =>
          r != null &&
          r.userId ===
            scoreOwnerForHole(
              gameMode,
              r.holeNumber,
              myUserId,
              myTeamScoreOwnerId,
            ),
      )
      .map((r) => r?.holeNumber)
      .filter((n): n is number => n != null),
  ]);

  // #754: count non-abandoned items in the sync queue so SyncStatusLine can
  // show a "waiting for network" state while scores are queued but unsynced.
  // #1370: scoped to THIS round — the queue is global, so an unsynced stroke
  // from another round used to show up here as "waiting". The whole queue is
  // read in one go and filtered in JS: syncQueue has no gameId index (db.ts).
  const syncQueue = useLiveQuery(() => localDb.syncQueue.toArray(), []);
  const pendingCount = (syncQueue ?? []).filter(
    (item) => item != null && isActiveForGame(item, gameId),
  ).length;

  const cards = players.map((p, i) => {
    const row = localRows?.[i];
    const score = row?.strokes ?? null;
    const putts = row?.putts ?? null; // #939
    return { ...p, score, putts };
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
      ? stablefordPointsFn({
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

  // Wolf-mode state: vi initialiserer fra server-prop og merger inn realtime-
  // endringer. Når Wolf-spilleren velger på sin device, broadcaster Supabase
  // postgres_changes til alle 4 — vi merger den nye raden inn slik at alle
  // sine UI-er oppdaterer badge-en uten å vente på neste server-render.
  //
  // Init-fra-prop er trygt her fordi parent-wrapperen har `key={holeNumber}`
  // som remounter hele HoleClient ved hull-bytte; vi trenger ikke useEffect-
  // sync mot wolfChoicesInitial-prop-endringer innen samme hull.
  const [wolfChoices, setWolfChoices] = useState<WolfHoleChoice[]>(
    wolfChoicesInitial ?? [],
  );

  useEffect(() => {
    if (!isWolf) return;
    const unsubscribe = subscribeWolfChoices(gameId, (change) => {
      setWolfChoices((prev) => {
        const next = prev.filter((c) => c.holeNumber !== change.holeNumber);
        next.push({
          holeNumber: change.holeNumber,
          wolfUserId: change.wolfUserId,
          choice: change.choice,
          partnerUserId: change.partnerUserId,
        });
        next.sort((a, b) => a.holeNumber - b.holeNumber);
        return next;
      });
    });
    return unsubscribe;
  }, [isWolf, gameId]);

  // Bingo Bango Bongo state: initialiseres fra server-prop, mergerer inn
  // realtime-endringer — speiler wolf-mønstret ovenfor.
  // Parent remounter HoleClient via `key={holeNumber}` ved hull-bytte, så vi
  // trenger ikke useEffect-sync mot prop-endringer på samme hull.
  const [bingoBangoBongoHoles, setBingoBangoBongoHoles] = useState<
    BingoBangoBongoHoleInput[]
  >(bingoBangoBongoHolesInitial ?? []);

  useEffect(() => {
    if (!isBBB) return;
    const unsubscribe = subscribeBingoBangoBongo(gameId, (change) => {
      setBingoBangoBongoHoles((prev) => {
        const next = prev.filter((h) => h.holeNumber !== change.holeNumber);
        next.push({
          holeNumber: change.holeNumber,
          bingoUserId: change.bingoUserId,
          bangoUserId: change.bangoUserId,
          bongoUserId: change.bongoUserId,
        });
        next.sort((a, b) => a.holeNumber - b.holeNumber);
        return next;
      });
    });
    return unsubscribe;
  }, [isBBB, gameId]);

  // Hvem er Wolf på dette hullet? Wolf-tabellen kan ha en eksplisitt rad
  // (f.eks. admin-override), ellers regner vi rotasjon eller trailing-wolf.
  const currentHoleWolfChoice = wolfChoices.find(
    (c) => c.holeNumber === currentHole,
  );
  const pointsByUserMap = useMemo(() => {
    const m = new Map<string, number>();
    if (wolfPointsByUser) {
      for (const [userId, points] of Object.entries(wolfPointsByUser)) {
        m.set(userId, points);
      }
    }
    return m;
  }, [wolfPointsByUser]);
  const wolfUserIdForHole = isWolf
    ? determineWolfForHole(
        currentHole,
        wolfPlayers ?? [],
        pointsByUserMap,
        currentHoleWolfChoice?.wolfUserId,
      )
    : null;
  const iAmWolfForHole = isWolf && wolfUserIdForHole === myUserId;

  // Trigger modal automatisk når dette er min tur og ingen valg finnes ennå.
  // `dismissed` lar brukeren lukke modalen midt i et hull uten at den popper
  // opp igjen. Når parent remounter (hull-bytte via `key={holeNumber}` på
  // wrapper-div-en), starter dismissed på false igjen.
  const shouldShowModal =
    isWolf && iAmWolfForHole && !currentHoleWolfChoice && gameStatus === 'active';
  const [modalDismissed, setModalDismissed] = useState(false);
  const modalOpen = shouldShowModal && !modalDismissed;

  // Wolf-badge tekst — vises over score-card-listen for å gi flighten
  // raskt overblikk over hvem som er Wolf og hva valget ble.
  const wolfBadgePlayerName = wolfUserIdForHole
    ? (wolfPlayers?.find((p) => p.userId === wolfUserIdForHole)?.name ?? null)
    : null;
  const wolfPartnerName =
    currentHoleWolfChoice?.choice === 'partner' && currentHoleWolfChoice.partnerUserId
      ? (wolfPlayers?.find(
          (p) => p.userId === currentHoleWolfChoice.partnerUserId,
        )?.name ?? null)
      : null;

  // #465: Lone-gevinst = n, blind = n+2. Vis faktiske poeng i badgen i stedet
  // for den nå-unøyaktige «2x/3x»-rammingen (gjaldt bare 4 spillere).
  const wolfPlayerCount = wolfPlayers?.length ?? 0;
  let wolfBadgeText: string | null = null;
  if (isWolf && wolfBadgePlayerName) {
    if (!currentHoleWolfChoice) {
      wolfBadgeText = iAmWolfForHole
        ? t('wolf.youAreWolf')
        : t('wolf.wolfWaiting', { name: wolfBadgePlayerName });
    } else if (currentHoleWolfChoice.choice === 'partner' && wolfPartnerName) {
      wolfBadgeText = t('wolf.wolfPartner', { wolfName: wolfBadgePlayerName, partnerName: wolfPartnerName });
    } else if (currentHoleWolfChoice.choice === 'lone') {
      wolfBadgeText = t('wolf.wolfLone', { name: wolfBadgePlayerName, points: wolfPlayerCount });
    } else if (currentHoleWolfChoice.choice === 'blind') {
      wolfBadgeText = t('wolf.wolfBlind', { name: wolfBadgePlayerName, points: wolfPlayerCount + 2 });
    }
  }

  // Modal-prop: hvilke andre spillere (n-1) skal vises som partner-alternativer?
  const otherWolfPlayers = (wolfPlayers ?? [])
    .filter((p) => p.userId !== myUserId)
    .map((p) => ({ userId: p.userId, name: p.name }));

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

  // Putt-registrering opt-in (#939): per-runde-bryter persistert i localStorage,
  // per game. useSyncExternalStore holder SSR + første klient-paint enige
  // (server-snapshot = false), og leser localStorage på nytt etter hydrering —
  // ingen hydration-mismatch (samme mønster som ThemeSwitcher/InstallBanner).
  // Selve putts-dataen ligger i scores.putts; bryteren styrer bare synligheten.
  const puttsTrackingKey = `torny:putts:${gameId}`;
  const subscribePutts = useCallback((onChange: () => void) => {
    window.addEventListener('storage', onChange);
    window.addEventListener('torny:putts-change', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('torny:putts-change', onChange);
    };
  }, []);
  const puttsTracking = useSyncExternalStore(
    subscribePutts,
    () => {
      try {
        return localStorage.getItem(puttsTrackingKey) === '1';
      } catch {
        return false;
      }
    },
    () => false,
  );

  function togglePuttsTracking() {
    try {
      const next = localStorage.getItem(puttsTrackingKey) === '1' ? '0' : '1';
      localStorage.setItem(puttsTrackingKey, next);
    } catch {
      // best effort
    }
    window.dispatchEvent(new Event('torny:putts-change'));
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
        formatTime(new Date(), locale, {
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
  // Team-collapsed moduser: players har én entry per lag (lag-kapteinen), så
  // lookup via myUserId feiler for non-captain-medlemmer. Match på
  // teamNumber i stedet — players[0]-fallback var korrekt kun når rosteret
  // aldri spenner over mer enn ETT lag (dvs. ikke singleFlight med 2 lag),
  // så den falt til feil lag for en 4-spiller Texas/foursomes-runde (#1058).
  const me = isTeamCollapsedMode
    ? (players.find((p) => p.teamNumber === myTeamNumber) ?? players[0])
    : players.find((p) => p.userId === myUserId);
  const submitted = me?.submitted ?? false;
  const disabled = gameInactive || submitted;

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
    pulseSync();
    void drainQueue();
    if (showHint) dismissHint();
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
    pulseSync();
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
    pulseSync();
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

  // #1058: the CTA gates on MY OWN score (or my team's shared card in
  // team-collapsed modes), not on every card in the flight. Flight-mates who
  // haven't tapped in yet no longer block me from moving on — that's what
  // used to force a passive player's card to get filled by whoever else was
  // active. The "everyone still needs to enter something" signal moves to a
  // passive hint below instead of gating the button.
  const myCard = isTeamCollapsedMode
    ? (cards.find((c) => c.teamNumber === myTeamNumber) ?? cards[0])
    : cards.find((c) => c.userId === myUserId);
  const myScoreEntered = myCard?.score != null;
  // Missing count excludes my own card — that state already has its own
  // affordance (the disabled/no-score CTA state below).
  const missingFlightScoreCount = cards.filter(
    (c) => c.userId !== myCard?.userId && c.score == null,
  ).length;
  const next = currentHole + 1;
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
  const isLastHole = currentHole === lastHoleForSegment(holeSegment);
  // Once the player has a score on every hole, the natural next action is
  // to submit — regardless of which hole they're currently editing. Skip
  // the 'Neste hull' chain and offer the submit CTA on every screen. The
  // union set (#668/#1352) covers offline-entered holes too. It's scoped to
  // this game_id, so a front9/back9 segment (#1441) compares against its own
  // totalHoles correctly.
  const roundComplete = scoredHoles.size >= totalHoles;

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

  const bottomLabel = roundComplete
    ? submitOrBridgeLabel
    : !myScoreEntered
      ? t('entry.enterYourScore')
      : isLastHole
        ? submitOrBridgeLabel
        : t('entry.nextHole', { next });

  const bottomHref = roundComplete
    ? submitOrBridgeHref
    : !myScoreEntered
      ? undefined
      : isLastHole
        ? submitOrBridgeHref
        : `/games/${gameId}/holes/${next}`;

  // #639: modus-kontekst-linja (Wolf / Skins / Round Robin / Florida) er
  // gjensidig utelukkende per modus. Den rutes inn i midt-kolonnen av HoleHero
  // (mellom hull-tallet og Par/indeks) i stedet for å ta en egen full-bredde
  // banner-rad som dyttet 4. spillerkort under folden på mobil.
  const holeContextLine: ReactNode = isWolf && wolfBadgeText ? (
    <HoleContextLine testId="wolf-badge" accent>
      {wolfBadgeText}
    </HoleContextLine>
  ) : isSkins && skinsAtStake != null ? (
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
  ) : isRoundRobin && roundRobinPlayers ? (
    <RoundRobinBadge
      holeNumber={currentHole}
      players={roundRobinPlayers}
      myUserId={myUserId}
    />
  ) : isFlorida ? (
    // Florida Scramble (#283): step-aside-påminnelse — kun for florida,
    // ikke for texas eller ambrose. Honor-system; ingen tracking.
    <HoleContextLine testId="florida-step-aside-reminder">
      {t('banners.floridaStepAside')}
    </HoleContextLine>
  ) : null;

  // Putt-registrering-bryter (#939) som pille, rutet inn i hull-headeren via
  // HoleHero sin puttsToggle-slot (rett til venstre for Par). Sitter i den ledige
  // header-høyden, så den tar ingen egen vertikal plass. «På» bruker en myk
  // primary-tint (champagne er reservert vinnere) + fyllt pille; «av» er en
  // dempet omriss-pille. Kun fangst-format viser den.
  const puttsTogglePill: ReactNode = capturesPutts ? (
    <button
      type="button"
      role="switch"
      aria-checked={puttsTracking}
      aria-label={t('putts.toggleLabel')}
      onClick={togglePuttsTracking}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 11px',
        borderRadius: 999,
        border: `1px solid ${
          puttsTracking
            ? 'color-mix(in srgb, var(--primary) 50%, transparent)'
            : 'var(--border)'
        }`,
        background: puttsTracking
          ? 'color-mix(in srgb, var(--primary) 16%, transparent)'
          : 'transparent',
        color: puttsTracking ? 'var(--text)' : 'var(--text-muted)',
        fontFamily: 'var(--font-sans)',
        fontSize: 12.5,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      <PinFlagSm size={13} />
      <span>{t('putts.fieldLabel')}</span>
    </button>
  ) : null;

  const bottomDisabled = (!roundComplete && !myScoreEntered) || disabled;

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
            {t('entry.myPoints')}{' '}
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

      <HoleStrip
        gameId={gameId}
        currentHole={currentHole}
        scoredHoles={scoredHoles}
        holes={holeNumbersForSegment(holeSegment)}
        sibling={holeStripSibling}
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
        puttsToggle={puttsTogglePill}
        distanceLine={<DistanceToGreen center={greenCenter} />}
      />

      <OnboardingBanner visible={showHint} onDismiss={dismissHint} />

      {/* WD-banner: vises øverst i score-lista når innlogget spiller er
          trukket (#386). Lenker til game-home for angre-knapp. */}
      {withdrawn && (
        <div
          data-testid="withdrawn-banner"
          style={{
            margin: '0 14px 8px',
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid var(--danger)',
            background: 'var(--danger-soft, color-mix(in srgb, var(--danger) 10%, transparent))',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span>{t('banners.withdrawn')}</span>
          <SmartLink
            href={`/games/${gameId}`}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text)',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
              whiteSpace: 'nowrap',
            }}
          >
            {t('banners.withdrawnUndo')}
          </SmartLink>
        </div>
      )}

      <div style={listStyle}>
        {cards.map((c) => {
          // Per-kort stableford-poeng for current hull. Vi regner client-side
          // av samme grunn som vi viser de live (= umiddelbar feedback uten
          // å vente på neste server-render). Bruker spillerens egne
          // extraStrokes som allerede er bakt inn i ClientPlayer.
          const stablefordPoints =
            isStableford && c.score != null
              ? stablefordPointsFn({
                  par,
                  netStrokes: c.score - c.extraStrokes,
                })
              : null;
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
              onClear={onClearFromCard}
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
        {courseId != null &&
          scoredThisSession &&
          freshPinCount < PIN_GATE_MAX_PINS &&
          !gameInactive && (
            <div style={{ marginTop: 8 }}>
              <GreenPinChip courseId={courseId} holeNumber={currentHole} />
            </div>
          )}
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
          savedHole={
            bingoBangoBongoHoles.find((h) => h.holeNumber === currentHole) ??
            null
          }
          disabled={gameInactive}
          onSaved={(updated) => {
            setBingoBangoBongoHoles((prev) => {
              const next = prev.filter(
                (h) => h.holeNumber !== updated.holeNumber,
              );
              next.push(updated);
              next.sort((a, b) => a.holeNumber - b.holeNumber);
              return next;
            });
          }}
        />
      )}

      {/* #1058: passiv påminnelse om at flight-kamerater ikke har tastet
          scoren sin på dette hullet — CTA-en gater ikke lenger på dette (kun
          på mitt eget/lagets kort), så dette er den eneste nudge-en som er
          igjen for å fylle inn for en passiv medspiller. Vises i alle
          moduser med flere kort, inkl. matchplay/skins/wolf der en manglende
          motstander-score lar hullet stå uavgjort på leaderboardet. */}
      {missingFlightScoreCount > 0 && (
        <div
          data-testid="missing-flight-scores-hint"
          style={{
            textAlign: 'center',
            marginTop: -4,
            marginBottom: 6,
            fontFamily: 'var(--font-sans)',
            fontSize: 11.5,
            color: 'var(--text-muted)',
          }}
        >
          {t('entry.missingFlightScores', { count: missingFlightScoreCount })}
        </div>
      )}

      <BottomActionBar
        label={bottomLabel}
        href={bottomHref}
        disabled={bottomDisabled}
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

      <SpecificValueSheet
        open={valueSheetFor !== null}
        par={par}
        onPick={onPickValue}
        onClear={onClearScore}
        onClose={() => setValueSheetFor(null)}
      />

      {isWolf && iAmWolfForHole && wolfUserIdForHole && (
        <WolfChoiceModal
          isOpen={modalOpen}
          gameId={gameId}
          holeNumber={currentHole}
          wolfUserId={wolfUserIdForHole}
          otherPlayers={otherWolfPlayers}
          onClose={() => setModalDismissed(true)}
          onChoiceSaved={(choice: WolfChoice, partnerUserId: string | null) => {
            // Optimistic merge — vi venter ikke på realtime-broadcast.
            setWolfChoices((prev) => {
              const next = prev.filter((c) => c.holeNumber !== currentHole);
              next.push({
                holeNumber: currentHole,
                wolfUserId: wolfUserIdForHole,
                choice,
                partnerUserId,
              });
              next.sort((a, b) => a.holeNumber - b.holeNumber);
              return next;
            });
          }}
        />
      )}
    </>
  );
}
