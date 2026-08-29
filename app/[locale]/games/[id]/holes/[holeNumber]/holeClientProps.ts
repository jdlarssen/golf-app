// Props-kontrakten for hull-flaten (`HoleClient`) + laget som påfører
// default-verdiene. Interfacet vokser med hver spillemodus, så det bor her i
// stedet for å presse komponenten under seg (#1716 — ren flytting).
//
// `resolveHoleClientProps` er ETT sted for alle back-compat-defaultene som
// JSDoc-en under beskriver («Default X holder eldre callsites bakoverkompatible»).
// Den bruker destructuring-defaults, ikke `??`, slik at semantikken er identisk
// med den inlinede varianten den erstattet: default slår kun inn på `undefined`.

import type { LatLng } from '@/lib/geo/distance';
import type { HoleParByGender } from '@/lib/games/parDisplay';
import type { HoleSegment } from '@/lib/scoring';
import type { RoundRobinConstellationPlayer } from '@/lib/scoring/modes/roundRobin';
import type {
  GameMode,
  ScoringGender,
  WolfHoleChoice,
  BingoBangoBongoHoleInput,
} from '@/lib/scoring/modes/types';

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

/**
 * #1441 (owner-QA finding B): server-resolved bridge to the OTHER half of
 * a split-day cup round (front9 ⇄ back9), only ever set at the segment's
 * boundary hole (front9's hole 9, back9's hole 10) — see
 * `findSegmentSibling`. Null everywhere else, including 'full'-segment
 * games. Renders a secondary link below the primary CTA; never replaces
 * this game's own submit/completeness flow.
 */
export type SegmentSiblingLink = {
  gameId: string;
  holeNumber: number;
  gameMode: GameMode;
};

/**
 * #1466 (eier-tillegget): the sibling half's own holes on a split cup day,
 * for the full 1–18 hole strip. Own holes stay linked to this game; sibling
 * holes link across to the other host. Null → today's segment-only strip.
 *
 * #1578: `scoredHoles` is the sibling half's server snapshot of entered holes
 * (already owner-filtered), unioned with this device's unsynced Dexie rows
 * below — a split day is normally played on one phone, so the front9 rows may
 * only exist locally. `gameMode` + `teamOwnerId` are what that union needs to
 * ask who owns each row over there. `scoredHoles: null` = we couldn't read
 * the half; the strip then keeps its positional derivation.
 */
export type HoleStripSibling = {
  gameId: string;
  holes: number[];
  gameMode: GameMode;
  teamOwnerId: string | null;
  scoredHoles: number[] | null;
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
  /** Se `SegmentSiblingLink`. */
  segmentSibling?: SegmentSiblingLink | null;
  /** Se `HoleStripSibling`. */
  holeStripSibling?: HoleStripSibling | null;
  /**
   * #1466 §2 (broModus): the front9 host's bridge to the sibling's hole 10,
   * set only when this is a front9 host whose back9 sibling is still
   * undelivered. When present it REPLACES every «Lever scorekort» in the bottom
   * CTA (both the isLastHole and roundComplete branches) with the bridge —
   * delivery happens once, on the back9 host — and suppresses the duplicate
   * secondary bridge link. Null on the back9 side and off broModus.
   */
  broBridge?: SegmentSiblingLink | null;
  players: ClientPlayer[];
}

/**
 * `HoleClientProps` etter at defaultene er påført — de valgfrie feltene er
 * garantert tilstede (men kan fortsatt være `null` der null er en gyldig
 * verdi).
 */
export type ResolvedHoleClientProps = HoleClientProps &
  Required<
    Pick<
      HoleClientProps,
      | 'gameMode'
      | 'holeSegment'
      | 'withdrawn'
      | 'myTeamNumber'
      | 'myTeamScoreOwnerId'
      | 'courseId'
      | 'greenCenter'
      | 'freshPinCount'
      | 'myStablefordTotal'
      | 'myStablefordForCurrentHole'
      | 'hideNetto'
      | 'segmentSibling'
      | 'holeStripSibling'
      | 'broBridge'
    >
  >;

/** Påfør back-compat-defaultene én gang, før komponenten leser noe. */
export function resolveHoleClientProps(
  props: HoleClientProps,
): ResolvedHoleClientProps {
  const {
    gameMode = 'best_ball',
    holeSegment = 'full',
    withdrawn = false,
    myTeamNumber = null,
    myTeamScoreOwnerId = null,
    courseId = null,
    greenCenter = null,
    freshPinCount = 0,
    myStablefordTotal = null,
    myStablefordForCurrentHole = null,
    hideNetto = false,
    segmentSibling = null,
    holeStripSibling = null,
    broBridge = null,
  } = props;
  return {
    ...props,
    gameMode,
    holeSegment,
    withdrawn,
    myTeamNumber,
    myTeamScoreOwnerId,
    courseId,
    greenCenter,
    freshPinCount,
    myStablefordTotal,
    myStablefordForCurrentHole,
    hideNetto,
    segmentSibling,
    holeStripSibling,
    broBridge,
  };
}
