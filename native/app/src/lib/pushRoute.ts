// #2256 PR 4: hvor et trykk på et varsel tar deg.
//
// Serveren legger stien i APNs-payloaden (`url`, fra
// `notificationDestination` i lib/notifications/deeplink.ts): `/games/{id}`,
// `/games/{id}/approve`, `/games/{id}/leaderboard` og andre. Alt som gjelder et
// spill åpner spillets side (`GameHome`), eller den av undersidene appen har:
// `/holes/{n}` (#2268, påminnelsen om et hull uten slag) åpner hullet (`Hole`),
// `/leaderboard` (#2632, «Resultatet er klart») tavla (`Leaderboard`), og `/approve`,
// `/submit` og `/avslutt` (#2759) godkjenningen, scorekortet og avslutningen.
// `/profile/venner` åpner vennene og `/profile/historikk` statistikken (#2759).
// Innboksen (`lib/inboxTarget.ts`) leser den samme regelen, så et trykk på samme
// varsel går til samme sted fra begge. Resten åpner Hjem, også arrangørsidene under
// `/admin/…`, som appen ikke har. Ligavarslene (#2638: runden er åpen, fristen nærmer seg)
// peker på `/liga/{id}` og åpner ligaen (`League`). Åpningsvarselet og
// fristvarselet i en simulatorliga (#2675) peker på `/liga/{id}/runde/{rid}/spill`
// og åpner startsiden for runden (`LeagueRoundStart`) med ligaen under.
// Markørens varsel (#2661)
// peker på `/liga/{id}/godkjenn/{gameId}/{userId}` og åpner markørens skjerm
// (`MarkerApprove`) med ligaen under. Cupvarslene (#2752: cupen har startet, kampene
// er avdekket, resultatet er klart) peker på `/cup/{id}` og `/cup/{id}/resultater`
// og åpner cup-rommet (`Cup`), som har begge deler. Cup-lenka `/cup/bli-med/{kode}`
// er ingen cup-id, og går til Hjem. Noen har meldt seg på eller av cupen din
// (`cup_signup`): det peker på Spillere-rommet, `/admin/cup/{id}/spillere` eller
// `/klubber/{klubb}/cup/{id}/spillere`, og åpner spillerlista (`CupParticipants`).
//
// Lagvarslene (#2840: en kaptein vil ha deg med, en medspiller trakk seg) peker på
// `/signup/{kode}/team` og åpner lagsiden (`TeamPage`, del 3). Har du ikke svart på
// invitasjonen, sender lagsiden deg videre til svaret på påmeldingsskjermen.
// `/signup/{kode}` er påmeldingssiden og åpner påmeldingsskjermen (`RoundInvite`).
//
// **Hvor `url` ligger.** For et fjernvarsel på iOS legger expo-notifications
// bare `userInfo["body"]` i `content.data` (Expos egen push-konvensjon).
// Vår payload er `{ aps, url, kind }`, så `url` står i
// `request.trigger.payload`, som er hele `userInfo`. `content.data` leses som
// reserve. På Android er `content.data` veien: målt på emulatoren (#2758), med
// appen lukket og i bakgrunnen, er `trigger` bare `{ channelId: null, type: 'push' }`,
// og `content.data` har `url` og `kind` sammen med Googles egne felt.
//
// **Hvilket varsel** (#2201): serveren legger `?varsel=<id>` på lenka, så et
// trykk kan merke akkurat det varselet som lest. Markøren endrer ikke hvor
// trykket går; `pushNotificationId` leser den med webbens egen
// `readMarkerFrom`, så regelen for hva som er en gyldig id har ett hjem.
//
// Ren og I/O-fri (Type A).
import { isSignupShortId } from '../../../../lib/appLinks/appLinkPaths';
import { readMarkerFrom } from '../../../../lib/notifications/readMarker';

export type PushTarget =
  | { name: 'GameHome'; params: { gameId: string } }
  | { name: 'Hole'; params: { gameId: string; holeNumber: number } }
  | { name: 'Leaderboard'; params: { gameId: string } }
  | { name: 'Approve'; params: { gameId: string } }
  | { name: 'Scorecard'; params: { gameId: string } }
  | { name: 'EndGame'; params: { gameId: string } }
  | { name: 'Friends'; params: { from: 'notification' } }
  | { name: 'RoundStats' }
  | { name: 'League'; params: { leagueId: string } }
  | { name: 'Cup'; params: { cupId: string } }
  | { name: 'CupParticipants'; params: { cupId: string } }
  | { name: 'LeagueRoundStart'; params: { leagueId: string; roundId: string } }
  | { name: 'MarkerApprove'; params: { leagueId: string; gameId: string; userId: string } }
  | { name: 'RoundInvite'; params: { shortId: string; src: null } }
  | { name: 'TeamPage'; params: { shortId: string } }
  | { name: 'Home' };

/** Den delen av et varsel funksjonen leser, løst typet: payloaden kan være hva som helst. */
export type PushRequestLike = {
  content?: { data?: Record<string, unknown> | null } | null;
  trigger?: { type?: string; payload?: Record<string, unknown> | null } | null;
};

const GAME_PATH = /^\/(?:[a-z]{2}\/)?games\/([^/?#]+)/;
const HOLE_SUFFIX = /^\/holes\/(\d{1,2})(?:[/?#]|$)/;
const LEADERBOARD_SUFFIX = /^\/leaderboard(?:[/?#]|$)/;
const APPROVE_SUFFIX = /^\/approve(?:[/?#]|$)/;
const SUBMIT_SUFFIX = /^\/submit(?:[/?#]|$)/;
const FINISH_SUFFIX = /^\/avslutt(?:[/?#]|$)/;
const FRIENDS_PATH = /^\/(?:[a-z]{2}\/)?profile\/venner(?:[/?#]|$)/;
const HISTORY_PATH = /^\/(?:[a-z]{2}\/)?profile\/historikk(?:[/?#]|$)/;
const LEAGUE_PATH = /^\/(?:[a-z]{2}\/)?liga\/([^/?#]+)/;
const ROUND_START_SUFFIX = /^\/runde\/([^/?#]+)\/spill(?:[/?#]|$)/;
const MARKER_SUFFIX = /^\/godkjenn\/([^/?#]+)\/([^/?#]+)(?:[/?#]|$)/;
const CUP_PATH = /^\/(?:[a-z]{2}\/)?cup\/([^/?#]+)/;
const SIGNUP_PATH = /^\/(?:[a-z]{2}\/)?signup\/([^/?#]+)(\/team)?\/?(?:[?#]|$)/;
const CUP_PLAYERS_PATH =
  /^\/(?:[a-z]{2}\/)?(?:admin\/cup|klubber\/[^/?#]+\/cup)\/([^/?#]+)\/spillere(?:[/?#]|$)/;

/** Stien et varsel peker på, eller `null` når det ikke har noen. */
export function pushUrl(request: PushRequestLike | null | undefined): string | null {
  const fromPayload = request?.trigger?.payload?.url;
  if (typeof fromPayload === 'string') return fromPayload;
  const fromData = request?.content?.data?.url;
  return typeof fromData === 'string' ? fromData : null;
}

/** `decodeURIComponent` kaster på en ødelagt `%`-sekvens; da går trykket til Hjem. */
function decodedOrNull(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Skjermen et trykk på varselet skal åpne. */
export function pushTarget(url: string | null): PushTarget {
  const match = url ? GAME_PATH.exec(url) : null;
  if (match) {
    const gameId = decodedOrNull(match[1]);
    if (gameId) {
      const hole = HOLE_SUFFIX.exec(url!.slice(match[0].length));
      const holeNumber = hole ? Number(hole[1]) : NaN;
      if (holeNumber >= 1 && holeNumber <= 18) {
        return { name: 'Hole', params: { gameId, holeNumber } };
      }
      // #2632: «Resultatet er klart» peker på tavla, der historien står.
      const rest = url!.slice(match[0].length);
      if (LEADERBOARD_SUFFIX.test(rest)) return { name: 'Leaderboard', params: { gameId } };
      if (APPROVE_SUFFIX.test(rest)) return { name: 'Approve', params: { gameId } };
      if (SUBMIT_SUFFIX.test(rest)) return { name: 'Scorecard', params: { gameId } };
      if (FINISH_SUFFIX.test(rest)) return { name: 'EndGame', params: { gameId } };
      return { name: 'GameHome', params: { gameId } };
    }
  }
  const league = url ? LEAGUE_PATH.exec(url) : null;
  const leagueId = league ? decodedOrNull(league[1]) : null;
  if (leagueId) {
    // #2661: markørens kort i ligaen.
    const marker = MARKER_SUFFIX.exec(url!.slice(league![0].length));
    const gameId = marker ? decodedOrNull(marker[1]) : null;
    const userId = marker ? decodedOrNull(marker[2]) : null;
    if (gameId && userId) return { name: 'MarkerApprove', params: { leagueId, gameId, userId } };
    // #2675: startsiden for runden.
    const start = ROUND_START_SUFFIX.exec(url!.slice(league![0].length));
    const roundId = start ? decodedOrNull(start[1]) : null;
    if (roundId) return { name: 'LeagueRoundStart', params: { leagueId, roundId } };
    return { name: 'League', params: { leagueId } };
  }
  const cupPlayers = url ? CUP_PLAYERS_PATH.exec(url) : null;
  const playersCupId = cupPlayers ? decodedOrNull(cupPlayers[1]) : null;
  if (playersCupId) return { name: 'CupParticipants', params: { cupId: playersCupId } };
  const cup = url ? CUP_PATH.exec(url) : null;
  const cupId = cup ? decodedOrNull(cup[1]) : null;
  if (cupId && cupId !== 'bli-med') return { name: 'Cup', params: { cupId } };
  const signup = url ? SIGNUP_PATH.exec(url) : null;
  const shortId = signup ? decodedOrNull(signup[1]) : null;
  if (shortId && isSignupShortId(shortId)) {
    return signup![2] ? { name: 'TeamPage', params: { shortId } } : { name: 'RoundInvite', params: { shortId, src: null } };
  }
  if (url && FRIENDS_PATH.test(url)) return { name: 'Friends', params: { from: 'notification' } };
  if (url && HISTORY_PATH.test(url)) return { name: 'RoundStats' };
  return { name: 'Home' };
}

/** Id-en til varselet lenka gjelder (`?varsel=<id>`), eller `null`. */
export function pushNotificationId(url: string | null): string | null {
  if (!url) return null;
  const query = url.indexOf('?');
  if (query === -1) return null;
  const hash = url.indexOf('#', query);
  return readMarkerFrom(url.slice(query, hash === -1 ? undefined : hash));
}
