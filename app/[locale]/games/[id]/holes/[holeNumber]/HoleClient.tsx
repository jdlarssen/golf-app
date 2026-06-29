'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type ReactNode,
} from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatTime } from '@/lib/i18n/format';
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
import { computeModifiedStablefordPoints } from '@/lib/scoring/modes/modifiedStableford';
import { isStablefordFamily, isScrambleFamily } from '@/lib/scoring/modes/types';
import type {
  GameMode,
  ScoringGender,
  WolfChoice,
  WolfHoleChoice,
  BingoBangoBongoHoleInput,
} from '@/lib/scoring/modes/types';
import type { HoleParByGender } from '@/lib/games/parDisplay';
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
  const {
    gameId,
    gameName,
    gameStatus,
    gameMode = 'best_ball',
    withdrawn = false,
    currentHole,
    par,
    parByGender,
    playerGender,
    strokeIndex,
    myUserId,
    myCompletedHoles,
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

  // #668: count THIS player's locally-entered holes across all 18, not just the
  // current screen. The server snapshot (`myCompletedHoles`) misses strokes that
  // are still in the offline queue, so a player who taps in every hole offline
  // would never see the submit CTA. Union via Math.max below — the server count
  // is the floor (synced holes from earlier sessions Dexie may not hold), the
  // local count adds the unsynced delta. Never under-counts, so it can only
  // reveal the CTA earlier, never hide one that used to show.
  const localCompletedHoles = useLiveQuery(
    () =>
      localDb.scores
        .where('[gameId+userId]')
        .equals([gameId, myUserId])
        .filter((r) => r.strokes != null)
        .count(),
    [gameId, myUserId],
  );

  // #754: count non-abandoned items in the sync queue so SyncStatusLine can
  // show a "waiting for network" state while scores are queued but unsynced.
  const syncQueue = useLiveQuery(() => localDb.syncQueue.toArray(), []);
  const pendingCount = (syncQueue ?? []).filter(
    (item) => item != null && item.abandonedAt == null,
  ).length;

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
  // For Texas: players har én entry per lag (lag-kapteinen), så lookup
  // via myUserId feiler for non-captain-medlemmer. Fall tilbake til
  // lag-kortet — submit-state er lag-nivå for Texas.
  const me = isTexas ? players[0] : players.find((p) => p.userId === myUserId);
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

  const allConfirmed = cards.length > 0 && cards.every((c) => c.score != null);
  const next = currentHole + 1;
  const isLastHole = currentHole === 18;
  // Once the player has a score on every hole, the natural next action is
  // to submit — regardless of which hole they're currently editing. Skip
  // the 'Neste hull' chain and offer the submit CTA on every screen. Union
  // the server snapshot with the live local count (#668) so offline-entered
  // holes still surface the CTA.
  const roundComplete = Math.max(myCompletedHoles, localCompletedHoles ?? 0) >= 18;

  // Stableford = solo-modus, så det er kun «ditt» scorekort, ikke et lag-kort.
  // Texas = ett delt lag-scorekort — «lagets». Best-ball-kopien
  // («Lever scorekort») holder vi som default for å unngå unødvendig
  // copy-endring der.
  const submitLabel = isStableford
    ? t('entry.submitScorecardSolo')
    : isTexas
      ? t('entry.submitScorecardTeam')
      : t('entry.submitScorecard');
  const bottomLabel = roundComplete
    ? submitLabel
    : !allConfirmed
      ? t('entry.confirmAllScores')
      : isLastHole
        ? submitLabel
        : t('entry.nextHole', { next });

  const bottomHref = roundComplete
    ? `/games/${gameId}/submit`
    : !allConfirmed
      ? undefined
      : isLastHole
        ? `/games/${gameId}/submit`
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

  const bottomDisabled = (!roundComplete && !allConfirmed) || disabled;

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

      <HoleStrip gameId={gameId} currentHole={currentHole} />
      <HoleHero
        holeNumber={currentHole}
        par={par}
        parByGender={parByGender}
        playerGender={playerGender}
        strokeIndex={strokeIndex}
        contextLine={holeContextLine}
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
          return (
            <ScoreCard
              key={c.userId}
              playerId={c.userId}
              name={c.nickname ?? c.name}
              initial={c.initial}
              extraStrokes={c.extraStrokes}
              score={c.score}
              par={par}
              disabled={disabled || (withdrawn && isMyCard)}
              hideNetto={hideNetto}
              stablefordPoints={stablefordPoints}
              onSetScore={onSetScore}
              onLongPress={onLongPress}
              onClear={onClearFromCard}
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
