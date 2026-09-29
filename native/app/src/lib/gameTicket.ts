// #2255: reglene bak startbilletten på spillets side i appen.
//
// Ingen regel her er ny. Hver del spør stedet regelen allerede bor:
//
//  - **Felt 2** (LAG, SIDE, FLIGHT eller SPILLERE) følger webbens ordbruk: et
//    lagformat har lag (`modeRequiresTeamNumber`), matchplay har sider (#1880),
//    og flight står bare når runden faktisk er delt i flere flighter.
//  - **DINE SLAG** er tallet hodet på scorekortet viser (`scorecardHandicapPart`,
//    #2262). Før start er ikke banehandicapen frosset ennå, og da regnes den
//    samme vei som frysingen gjør (`displayCourseHandicap`, webbens reserve på
//    spillets side), før den går gjennom samme regel som etter start.
//  - **Stubben** velger mellom de samme grenene, i samme rekkefølge, som
//    `PrimarySection` gjorde før billetten: stengt format, ikke spiller,
//    trukket, utkast, planlagt, avsluttet, og i en aktiv runde
//    `computePrimaryCtaState`.
//
// Ren fil: ingen React, ingen nett, ingen `Intl` (Hermes mangler dataene).
import { usesGameHcpAllowance, effectiveHcpAllowancePct } from '../../../../lib/games/hcpAllowance';
import { finishedResultBadge } from '../../../../lib/games/finishedResultBadge';
import { holeCountForSegment } from '../../../../lib/games/holeScope';
import type { GameStatus } from '../../../../lib/games/status';
import { expectedTeamSize, modeRequiresTeamNumber } from '../../../../lib/games/teamScope';
import { getRatingForGender, type Rating, type TeeGender } from '../../../../lib/games/teeRating';
import { revealState, shouldHideNetto, type ScoreVisibility } from '../../../../lib/games/visibility';
import { fromSignedHcp } from '../../../../lib/handicap/sign';
import { displayCourseHandicap } from '../../../../lib/scoring/courseHandicap';
import type { HoleSegment } from '../../../../lib/scoring';
import { isMatchplayFamily, MODE_LABELS, type GameMode } from '../../../../lib/scoring/modes/types';
import type { BundlePlayer, BundleTeeRatings, GameBundle } from '../data/gameBundle';
import { MAX_AVATARS } from './flightRoster';
import type { GateReason } from './formatGate';
import { HOME_TEXT, finishedResultText } from './homeCopy';
import { formatStubClock, formatStubDate, formatWeekdayDayMonth } from './homeDates';
import { computePrimaryCtaState, nextUnfilledHole, type PrimaryCtaState } from './primaryCtaState';
import { scorecardHandicapPart } from './scorecardHeader';
import { TICKET_TEXT, allowancePart, fieldA11y, flightOf, teePart } from './ticketCopy';

const SEPARATOR = ' · ';

/** Det felt 2 på billetten viser. */
export type TicketSlot =
  | { kind: 'team'; number: number }
  | { kind: 'side'; number: number }
  | { kind: 'flight'; number: number; of: number }
  | { kind: 'players'; count: number };

function isKnownMode(mode: string): mode is GameMode {
  return Object.hasOwn(MODE_LABELS, mode);
}

/**
 * Felt 2. Lag først (lagformat, eller side i matchplay), så flight når runden
 * er delt i flere flighter, ellers antall spillere. Trukne spillere står ikke
 * på banen og telles ikke, heller ikke som en egen flight.
 */
export function ticketSlot(
  bundle: Pick<GameBundle, 'game' | 'players'>,
  userId: string,
): TicketSlot {
  const mode = bundle.game.gameMode;
  const me = bundle.players.find((p) => p.userId === userId);
  const onCourse = bundle.players.filter((p) => p.withdrawnAt == null);

  if (me?.teamNumber != null && isKnownMode(mode)) {
    if (isMatchplayFamily(mode)) {
      // En side i duellen er 1 eller 2. Alt annet er ikke en side (#1880).
      if (me.teamNumber === 1 || me.teamNumber === 2) {
        return { kind: 'side', number: me.teamNumber };
      }
    } else {
      const teamSize = expectedTeamSize(bundle.game.modeConfig as { team_size?: number } | null);
      if (modeRequiresTeamNumber(mode, teamSize)) {
        return { kind: 'team', number: me.teamNumber };
      }
    }
  }

  const flights = new Set(
    onCourse.map((p) => p.flightNumber).filter((n): n is number => n != null),
  );
  if (me?.flightNumber != null && flights.size >= 2) {
    return { kind: 'flight', number: me.flightNumber, of: flights.size };
  }

  return { kind: 'players', count: onCourse.length };
}

/** Etiketten og verdien felt 2 tegner: «Flight» over «2 av 3». */
export function slotField(slot: TicketSlot): { label: string; value: string } {
  switch (slot.kind) {
    case 'team':
      return { label: TICKET_TEXT.team, value: String(slot.number) };
    case 'side':
      return { label: TICKET_TEXT.side, value: String(slot.number) };
    case 'flight':
      return { label: TICKET_TEXT.flight, value: flightOf(slot.number, slot.of) };
    case 'players':
      return { label: TICKET_TEXT.players, value: String(slot.count) };
  }
}

/**
 * Linja i hodet: «Tee: Gul · Stableford · 85 % handicap». Prosenten står bare
 * for formatene som bruker den generelle andelen (`usesGameHcpAllowance`); de
 * andre har sin egen i `mode_config`, og da ville tallet her lyve. Det som
 * mangler, hoppes over.
 */
export function ticketHeaderLine(
  bundle: Pick<GameBundle, 'game' | 'teeBoxName'>,
): string {
  const { gameMode, hcpAllowancePct } = bundle.game;
  return [
    bundle.teeBoxName ? teePart(bundle.teeBoxName) : null,
    isKnownMode(gameMode) ? MODE_LABELS[gameMode] : null,
    hcpAllowancePct != null && usesGameHcpAllowance(gameMode)
      ? allowancePart(hcpAllowancePct)
      : null,
  ]
    .filter((part): part is string => part != null)
    .join(SEPARATOR);
}

function toTeeBoxRatings(tee: BundleTeeRatings) {
  return {
    slope_mens: tee.slopeMens,
    course_rating_mens: tee.courseRatingMens,
    par_total_mens: tee.parTotalMens,
    slope_ladies: tee.slopeLadies,
    course_rating_ladies: tee.courseRatingLadies,
    par_total_ladies: tee.parTotalLadies,
    slope_juniors: tee.slopeJuniors,
    course_rating_juniors: tee.courseRatingJuniors,
    par_total_juniors: tee.parTotalJuniors,
  };
}

/** Slope, CR og par for spillerens tee-kjønn, eller `null` når noe mangler. */
function ratingFor(
  tee: BundleTeeRatings | null | undefined,
  me: Pick<BundlePlayer, 'teeGender'> | undefined,
): Rating | null {
  if (!tee || !me) return null;
  return getRatingForGender(toTeeBoxRatings(tee), me.teeGender as TeeGender);
}

/** «6 124» med hardt mellomrom som tusenskille, uten `Intl`. */
function groupThousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
}

/** «71,5» med desimalkomma; et helt tall står uten. */
function decimalComma(n: number): string {
  return String(n).replace('.', ',');
}

/**
 * Faktalinja: «18 hull · Par 72 · 6 124 m · Slope 125 · CR 71,5». Par og
 * lengde er tallene for hele banen, så de står bare på en hel runde. Det som
 * mangler, hoppes over. Hvert ledd holdes sammen med hardt mellomrom, så linja
 * brekker mellom leddene og aldri mellom «CR» og tallet.
 */
export function ticketFacts(
  bundle: Pick<GameBundle, 'game' | 'teeRatings'>,
  me: Pick<BundlePlayer, 'teeGender'> | undefined,
): string {
  const segment = bundle.game.holeSegment;
  const full = segment === 'full';
  const holes = full ? 18 : holeCountForSegment(segment as HoleSegment);
  const rating = ratingFor(bundle.teeRatings, me);
  const length = bundle.teeRatings?.lengthMeters ?? null;
  return [
    `${holes}\u00A0hull`,
    full && rating ? `Par\u00A0${rating.par}` : null,
    full && length != null ? `${groupThousands(length)}\u00A0m` : null,
    rating ? `Slope\u00A0${rating.slope}` : null,
    rating ? `CR\u00A0${decimalComma(rating.courseRating)}` : null,
  ]
    .filter((part): part is string => part != null)
    .join(SEPARATOR);
}

/** «15», eller «+2» for pluss-handicap (lagret negativt), som i Golfbox. */
function handicapValue(value: number): string {
  const { magnitude, isPlus } = fromSignedHcp(value);
  return `${isPlus ? '+' : ''}${magnitude}`;
}

/**
 * DINE SLAG: det samme tallet som hodet på scorekortet (#2262). Før start er
 * banehandicapen ikke frosset, og den regnes da fra hcp-indeksen i profilen,
 * teens rating og spillets andel, samme vei som frysingen ved start. Tallet
 * går deretter gjennom samme regel som etter start, så fourball viser 17 og
 * ikke 20 både før og etter tee-off. I en reveal-runde og uten tall: «—».
 */
export function ticketStrokes(opts: {
  bundle: Pick<GameBundle, 'game' | 'teeRatings'>;
  me: BundlePlayer | undefined;
  /** `users.hcp_index` fra profilen, eller `null` når den ikke er hentet. */
  profileHcpIndex: number | null;
  /** Kortet viser lagets rader (formatet deler én ball), som på scorekortet. */
  teamMode: boolean;
  /** Lagets handicap fra motoren (`teamHandicapFor`), eller `null`. */
  teamHandicap: number | null;
}): string {
  const { bundle, me } = opts;
  if (!me) return TICKET_TEXT.noValue;
  const { game } = bundle;
  const revealActive = shouldHideNetto(
    revealState(game.scoreVisibility as ScoreVisibility, game.status as GameStatus),
  );
  const courseHandicap = me.courseHandicap ?? preStartCourseHandicap(opts);
  const part = scorecardHandicapPart({
    game,
    courseHandicap,
    teamMode: opts.teamMode,
    teamHandicap: opts.teamHandicap,
    revealActive,
  });
  return part ? handicapValue(part.value) : TICKET_TEXT.noValue;
}

function preStartCourseHandicap(opts: {
  bundle: Pick<GameBundle, 'game' | 'teeRatings'>;
  me: BundlePlayer | undefined;
  profileHcpIndex: number | null;
}): number | null {
  const rating = ratingFor(opts.bundle.teeRatings, opts.me);
  if (!rating || opts.profileHcpIndex == null) return null;
  const { gameMode, hcpAllowancePct } = opts.bundle.game;
  return displayCourseHandicap({
    hcpIndex: Number(opts.profileHcpIndex),
    slope: rating.slope,
    courseRating: rating.courseRating,
    par: rating.par,
    // #2210: samme andel frysingen ved start bruker.
    allowancePct: effectiveHcpAllowancePct(gameMode, hcpAllowancePct ?? 100),
  });
}

/**
 * Navnelista under avatarene: «Du, Marte, Jonas og Kristian». Som avatarene
 * står fire andre med navn, og resten som et tall («og 2 til»): i et klubbspill
 * uten flighter ville en full liste vært over hundre navn.
 */
export function rosterNames(names: readonly string[], max = MAX_AVATARS): string {
  const shown = ['Du', ...names.slice(0, max)];
  const rest = names.length - Math.min(names.length, max);
  if (rest > 0) return `${shown.join(', ')} og ${rest} til`;
  if (shown.length === 1) return shown[0]!;
  return `${shown.slice(0, -1).join(', ')} og ${shown[shown.length - 1]}`;
}

/**
 * START-feltet: «Lør 3. okt» over «kl. 09:30», og hele setningen for
 * skjermleseren. Enhetens lokaltid, som Hjem (`homeDates.ts`).
 */
export function startField(iso: string | null): {
  date: string | null;
  clock: string | null;
  a11y: string;
} {
  const date = formatStubDate(iso);
  if (!date || !iso) {
    return { date: null, clock: null, a11y: fieldA11y(TICKET_TEXT.start, HOME_TEXT.noTeeOff) };
  }
  const clock = formatStubClock(iso);
  // Etter kolon midt i setningen: liten forbokstav («Start: lørdag 3. oktober»).
  const day = formatWeekdayDayMonth(new Date(iso));
  const spoken = [day.charAt(0).toLowerCase() + day.slice(1), clock].filter(Boolean).join(' ');
  return { date, clock, a11y: fieldA11y(TICKET_TEXT.start, spoken) };
}

/**
 * «Vis på kart»: banenavnet som søk i telefonens kartapp. Banene har ingen
 * koordinater, og et søk trenger ingen ny modul.
 */
export function mapSearchUrl(courseName: string, os: string): string {
  const query = encodeURIComponent(courseName);
  return os === 'ios' ? `https://maps.apple.com/?q=${query}` : `geo:0,0?q=${query}`;
}

/** Hvilken stubb billetten skal ha. */
export type TicketStub =
  | { kind: 'gated'; reason: GateReason }
  | { kind: 'notPlayer' }
  | { kind: 'withdrawn'; bySelf: boolean }
  | { kind: 'draft' }
  | { kind: 'scheduled' }
  | { kind: 'finished'; result: { text: string; isWin: boolean } | null }
  | {
      kind: 'active';
      state: PrimaryCtaState;
      played: number;
      total: number;
      nextHole: number;
    }
  | { kind: 'none' };

/**
 * Stubben, i den rekkefølgen spilleren skal møte grenene. Rekkefølgen er
 * regelen: et stengt format slår alt, og levert slår «Fortsett» (se
 * `computePrimaryCtaState`).
 */
export function ticketStub(opts: {
  status: string;
  gate: GateReason | null;
  me: BundlePlayer | undefined;
  /** Hull med slag: mine, eller lagets i formatene som deler kort. */
  filled: readonly number[];
  totalHoles: number;
  /** Stemplene CTA-en regner på: mine, eller lagets når laget deler kort. */
  submittedAt: string | null;
  approvedAt: string | null;
  requirePeerApproval: boolean;
}): TicketStub {
  const { me, status } = opts;
  if (opts.gate !== null) return { kind: 'gated', reason: opts.gate };
  if (!me) return { kind: 'notPlayer' };
  if (me.withdrawnAt) {
    // #2358: bare den som trakk seg selv kan angre.
    return { kind: 'withdrawn', bySelf: me.withdrawnByUserId === me.userId };
  }
  if (status === 'draft') return { kind: 'draft' };
  if (status === 'scheduled') return { kind: 'scheduled' };
  if (status === 'finished') {
    const summary = me.resultSummary ?? null;
    if (!summary) return { kind: 'finished', result: null };
    const badge = finishedResultBadge(summary);
    const text = finishedResultText(badge);
    return { kind: 'finished', result: text ? { text, isWin: badge.isWin } : null };
  }
  if (status !== 'active') return { kind: 'none' };

  const state = computePrimaryCtaState({
    strokesCount: opts.filled.length,
    totalHoles: opts.totalHoles,
    submittedAt: opts.submittedAt,
    approvedAt: opts.approvedAt,
    requirePeerApproval: opts.requirePeerApproval,
  });
  return {
    kind: 'active',
    state,
    played: opts.filled.length,
    total: opts.totalHoles,
    nextHole: nextUnfilledHole(opts.filled, opts.totalHoles),
  };
}
