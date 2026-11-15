// #2259 PR 2: tekstene på Topplista (designlerretet, «Toppliste B»). Nettsiden har
// ikke lenger noe brett, så teksten finnes bare her. Malene er ICU, fylt ut av
// `formatMessage` fra Kavalkaden.
import { formatMessage } from './kavalkadeCopy';

export const TOPPLISTE_TEXT = {
  heading: 'Toppliste',
  /** Toppen sier hvor du kom fra, som Varsler: siden åpnes fra profilmenyen. */
  kicker: 'Profil',
  backLabel: 'Tilbake til profil',
  subtitleSeason: 'Hele Tørny · sesongen {year}',
  /** Før sesongen er kjent (lasting, uten nett, feil). */
  subtitle: 'Hele Tørny',
  tabsLabel: 'Velg liste',
  tabWins: 'Seire',
  tabBirdies: 'Birdies',
  tabRounds: 'Runder',
  winsCount: '{count, plural, one {# seier} other {# seire}}',
  birdiesCount: '{count, plural, one {# birdie} other {# birdier}}',
  roundsCount: '{count, plural, one {# runde} other {# runder}}',
  /** Enheten alene, under lederens tall. */
  winsUnit: '{count, plural, one {seier} other {seire}}',
  birdiesUnit: '{count, plural, one {birdie} other {birdier}}',
  roundsUnit: '{count, plural, one {runde} other {runder}}',
  youPlace: 'Du er på {place}. plass',
  toTop5: '{count} til topp 5',
  /** Ingen i denne fanen ennå (første linje, så en linje under). */
  noneWins: 'Ingen seire ennå',
  noneWinsBody: 'Vinn en runde, så er du med.',
  noneBirdies: 'Ingen birdier ennå',
  noneBirdiesBody: 'Slå en birdie, så er du med.',
  noneRounds: 'Ingen runder ennå',
  noneRoundsBody: 'Spill en runde, så er du med.',
  /** Sesongen er over: ingenting å ta igjen. */
  noneWinsOver: 'Ingen seire i {year}',
  noneBirdiesOver: 'Ingen birdier i {year}',
  noneRoundsOver: 'Ingen runder i {year}',
  noneOverBody: 'Sesongen er over.',
  leaderRunning: 'Leder sesongen',
  leaderOver: 'Årets spiller {year}',
  you: 'Du',
  youSpoken: 'deg',
  place: '{place}. plass, {name}, {count}',
  emptyHeading: 'Ingen runder ennå',
  emptyBody: 'Vinneren av den første står her.',
  offlineHeading: 'Du er uten nett',
  offlineBody: 'Koble til og prøv igjen.',
  failedHeading: 'Fikk ikke hentet topplista',
  failedBody: 'Prøv igjen om litt.',
  birdiesFailedHeading: 'Fikk ikke hentet birdiene',
  birdiesFailedBody: 'Seire og runder virker som vanlig.',
  retry: 'Prøv igjen',
  // «Sjeldne slag i 2026» (PR 4): hole-in-one, albatross og eagle, likt under alle tre fanene.
  momentsTitle: 'Sjeldne slag i {year}',
  momentsSubtitle: 'Hole-in-one, albatross og eagle',
  momentHoleInOne: 'Hole-in-one',
  momentAlbatross: 'Albatross',
  momentEagle: 'Eagle',
  momentWhere: ' · hull {hole} på {course}',
  momentWhereNoCourse: ' · hull {hole}',
  momentSpoken: '{kind}, {name}, hull {hole} på {course}, {date}',
  momentSpokenNoCourse: '{kind}, {name}, hull {hole}, {date}',
  momentsShowAll: 'Vis alle {count}',
  momentsShowLess: 'Vis færre',
  momentsNone: 'Ingen ennå.',
  momentsNoneOver: 'Ingen i {year}.',
  momentsFailed: 'Fikk ikke hentet slagene.',
  // Æreslista (#2894 PR 2): hole-in-one og albatross for alle år, lenka i kortet og banneret på Hjem.
  aeresHeading: 'Æreslista',
  aeresSubtitle: 'Hole-in-one og albatross i Tørny',
  /** Toppen sier hvor siden ble åpnet fra (tegningen viser «Toppliste»). */
  aeresKickerHome: 'Hjem',
  aeresLinkSubtitle: 'Hole-in-one og albatross, alle år',
  aeresNewestHoleInOne: 'Nyeste hole-in-one',
  aeresNewestAlbatross: 'Nyeste albatross',
  /** Hole-in-one er samme ord i flertall. */
  aeresCountHoleInOne: '{count} hole-in-one',
  aeresCountAlbatross: '{count, plural, one {# albatross} other {# albatrosser}}',
  aeresEmptyHeading: 'Ingen ennå',
  aeresEmptyBody: 'Den første hole-in-one står her.',
  aeresFailedHeading: 'Fikk ikke hentet slagene',
  aeresWhere: 'Hull {hole} på {course}',
  aeresWhereNoCourse: 'Hull {hole}',
  aeresHeroSpoken: '{label}, {name}, hull {hole} på {course}, {date}',
  aeresHeroSpokenNoCourse: '{label}, {name}, hull {hole}, {date}',
  bannerMore: '+{count} til',
  bannerClose: 'Lukk',
  bannerSpoken: '{kind}: {name}, hull {hole} på {course}. Åpner æreslista.',
  bannerSpokenNoCourse: '{kind}: {name}, hull {hole}. Åpner æreslista.',
} as const;

export type TopplisteKey = keyof typeof TOPPLISTE_TEXT;

export function topplisteT(key: TopplisteKey, values?: Record<string, string | number>): string {
  return formatMessage(TOPPLISTE_TEXT[key], values);
}

/** Ordet i toppen på Æreslista (#2894): hvor den ble åpnet fra, og bare pila fra et varsel. */
export function aereslisteKicker(from: 'toppliste' | 'home' | 'notification' | undefined): string {
  if (from === 'toppliste') return TOPPLISTE_TEXT.heading;
  if (from === 'home') return TOPPLISTE_TEXT.aeresKickerHome;
  return '';
}
