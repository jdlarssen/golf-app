// «Hvem sitt utslag» (#2580) i appen. Tekstene er webbens `teeShots.*` fra
// messages/no.json tegn for tegn (alternativ b i kontrakten, som
// kavalkadeCopy.ts); teeShotsCopy.test.ts låser dem, så en endring på nettet
// uten appen blir rød. Hvilke navn, hvilken rekkefølge og den korte formen
// avgjøres i lib/games/teeShots.ts; her fylles bare navnene inn, og lister
// settes sammen med formatNameList (Hermes har ikke Intl.ListFormat). Formen
// speiler webbens components/games/teeShotCopy.ts.
import type {
  TeeShotDeliveryAdvice,
  TeeShotHoleLine,
  TeeShotPlayerStatus,
  TeeShotStatus,
} from '../../../../lib/games/teeShots';
import { formatNameList } from './display';
import { formatMessage, type MessageValues } from './kavalkadeCopy';

/** `teeShots.*` fra messages/no.json, tegn for tegn. */
export const TEE_SHOTS_TEXT = {
  question: 'Hvem sitt utslag ble brukt?',
  minimum: 'minst {min} hver',
  teamLabel: 'Lag {team}',
  countShort: '{count} av {min}',
  countReached: 'har {count}',
  a11yShort: '{name}, {count} av {min} utslag',
  a11yReached: '{name}, har {count} utslag',
  a11yLockedSuffix: '{label}, kan ikke velges nå',
  shortFirst: '{name} mangler {count}',
  shortRest: '{name} {count}',
  othersEach: '{first}, de andre {count} hver',
  freeLine: '{who} · {holes, plural, one {# hull} other {# hull}} å velge fritt på',
  lockedLine: '{names} trenger {holes, plural, =1 {utslaget på det siste hullet} =2 {utslagene på de to hullene som er igjen} =3 {utslagene på de tre hullene som er igjen} =4 {utslagene på de fire hullene som er igjen} =5 {utslagene på de fem hullene som er igjen} =6 {utslagene på de seks hullene som er igjen} other {utslagene på de # hullene som er igjen}}.',
  teamShortLine: '{who}, og {holes, plural, =0 {ingen hull er igjen} other {bare # hull er igjen}}. Bytt på et tidligere hull der {surplus} står.',
  goneMember: 'en som ikke er med på laget lenger',
  partialLine: 'Et kort på laget er levert. Du kan bare bytte så lenge alle har nok.',
  boxTitle: '{who} utslag',
  boxSwap: 'Alle må ha minst {min} utslag før {delivery, select, team {lagets kort kan leveres} other {noen på laget kan levere}}. Trykk «Rediger hullene» og bytt til {names} på {holes, plural, =1 {ett hull} =2 {to hull} =3 {tre hull} =4 {fire hull} =5 {fem hull} =6 {seks hull} other {# hull}} der {surplus} står.',
  boxPickOpen: 'Alle må ha minst {min} utslag før {delivery, select, team {lagets kort kan leveres} other {noen på laget kan levere}}. Trykk «Rediger hullene» og velg {names} på hullene som ikke har utslag ennå.',
  boxEdit: 'Rediger hullene',
  organizerLine: '{name} har {count} av {min} utslag',
} as const;

/** Appens egne tekster, som ikke finnes i webbens katalog. */
export const TEE_SHOTS_APP_TEXT = {
  /** Raden på scorekortet (`Utslag-forslag-levering`). */
  scorecardRow: 'Utslag',
  /** Leddet foran scoren i «Ditt lag på hull N» (contract-2579 punkt 11 og 13). */
  holeCardLead: 'Utslaget til {name} ble brukt',
  /** Kortet på den ferdige lagtavla (`Lagtavle-ferdig-forslag`). */
  boardHeading: 'Utslag som ble brukt · ditt lag',
  /** Ved tallet til en spiller under minimum i kortet over (contract-2579 punkt 13). */
  boardMinimum: 'minst {min}',
} as const;

export type TeeShotsKey = keyof typeof TEE_SHOTS_TEXT;

/** `t` fra `useTranslations('teeShots')`. */
export function teeShotsT(key: TeeShotsKey, values?: MessageValues): string {
  return formatMessage(TEE_SHOTS_TEXT[key], values);
}

export type NameOf = (userId: string) => string;

/** «Per mangler 4, Jonas 3 og Sigrid 2». */
export function shortListText(short: readonly TeeShotPlayerStatus[], nameOf: NameOf): string {
  return formatNameList(
    short.map((p, i) =>
      teeShotsT(i === 0 ? 'shortFirst' : 'shortRest', { name: nameOf(p.userId), count: p.missing }),
    ),
  );
}

/**
 * «Marte eller Jonas», og «… eller en som ikke er med på laget lenger» når en
 * som ikke er med på laget lenger, holder hull laget må bytte.
 */
function swapPlacesText(surplus: readonly string[], alsoGone: boolean, nameOf: NameOf): string {
  const places = surplus.map(nameOf);
  if (alsoGone) places.push(TEE_SHOTS_TEXT.goneMember);
  return formatNameList(places, 'eller');
}

/** Linja under knappene på hullsiden, eller null når det ikke er noen. */
export function teeShotHoleLineText(line: TeeShotHoleLine, nameOf: NameOf): string | null {
  switch (line.kind) {
    case 'none':
      return null;
    case 'partial':
      return teeShotsT('partialLine');
    case 'free': {
      const first = line.short[0];
      const who =
        line.othersEach !== null && first
          ? teeShotsT('othersEach', {
              first: teeShotsT('shortFirst', { name: nameOf(first.userId), count: first.missing }),
              count: line.othersEach,
            })
          : shortListText(line.short, nameOf);
      return teeShotsT('freeLine', { who, holes: line.freeHoles });
    }
    case 'locked':
      return teeShotsT('lockedLine', {
        names: formatNameList(line.names.map(nameOf)),
        count: line.names.length,
        holes: line.holesLeft,
      });
    case 'teamShort':
    case 'teamShortMixed':
    case 'teamShortGone':
      return teeShotsT('teamShortLine', {
        who: shortListText(line.short, nameOf),
        holes: line.holesLeft,
        surplus: swapPlacesText(line.kind === 'teamShortGone' ? [] : line.surplus, line.kind !== 'teamShort', nameOf),
      });
  }
}

/** Boksen over leverknappen (`Utslag-forslag-levering`): tittel og setning. */
export function teeShotBoxText(
  advice: TeeShotDeliveryAdvice,
  status: TeeShotStatus,
  wholeTeamDelivers: boolean,
  nameOf: NameOf,
): { title: string; body: string } {
  const delivery = wholeTeamDelivers ? 'team' : 'each';
  const names = formatNameList(advice.shortNames.map(nameOf));
  const body =
    advice.kind === 'pickOpen'
      ? teeShotsT('boxPickOpen', { min: status.minimum, delivery, names })
      : teeShotsT('boxSwap', {
          min: status.minimum,
          delivery,
          names,
          holes: advice.holes,
          surplus: swapPlacesText(advice.surplus, advice.kind !== 'swap', nameOf),
        });
  return {
    title: teeShotsT('boxTitle', { who: shortListText(advice.short, nameOf), total: status.totalShort }),
    body,
  };
}

/** «Per har 2 av 4 utslag», én linje per spiller under minimum. */
export function teeShotOrganizerLines(status: TeeShotStatus, nameOf: NameOf): string[] {
  return status.short.map((p) =>
    teeShotsT('organizerLine', { name: nameOf(p.userId), count: p.count, min: status.minimum }),
  );
}

/** Tallet under et navn: «2 av 4», eller «har 4» når minimum er nådd. */
export function teeShotCountText(player: TeeShotPlayerStatus, minimum: number): string {
  return player.missing > 0
    ? teeShotsT('countShort', { count: player.count, min: minimum })
    : teeShotsT('countReached', { count: player.count });
}

/** Skjermlesernavnet på en navneknapp, med «kan ikke velges nå» når den er låst. */
export function teeShotButtonLabel(name: string, player: TeeShotPlayerStatus, minimum: number, canTap: boolean): string {
  const label =
    player.missing > 0
      ? teeShotsT('a11yShort', { name, count: player.count, min: minimum })
      : teeShotsT('a11yReached', { name, count: player.count });
  return canTap ? label : teeShotsT('a11yLockedSuffix', { label });
}
