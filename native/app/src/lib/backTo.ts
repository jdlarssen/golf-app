// native/app/src/lib/backTo.ts
// #2746: hvor tilbake fører. Regelen står i `docs/user-flows.md` §Tilbake.
//
// I react-navigation 7 legger `navigate('X')` en ny X oppå stakken når X ikke
// er skjermen du står på. Den går ikke tilbake til en X som ligger lenger nede.
// Et levert kort fulgt av `navigate('GameHome')` ga derfor [Hjem, Spillet,
// Hull, Scorekort, Spillet], og tilbake fra spillet åpnet kortet du nettopp
// leverte. Disse to hjelperne går tilbake til skjermen når den ligger under.
//
// `popTo` uten `getId` velger den øverste skjermen med samme navn, uansett
// spill. Avgjørelsen sjekker derfor selv at den skjermen gjelder samme spill
// eller liga, og faller ellers tilbake til `replace` eller `navigate`. `getId`
// på skjermene er ikke svaret: da flytter `navigate` skjermen til toppen i
// stedet for å gå tilbake til den.
import type { RootStackParamList } from '../navigation';

type RouteLike = { name: string; params?: object };

/** Det hjelperne trenger av navigasjonen. Skjermenes `navigation` passer. */
export type BackNavigation = {
  getState(): { index: number; routes: readonly RouteLike[] } | undefined;
  popTo(name: never, params?: never): void;
  replace(name: never, params?: never): void;
  navigate(name: never, params?: never): void;
};

export type BackStep = 'popTo' | 'replace' | 'push';

/** Params som sier hvilken skjerm det er. Alt annet (hull, kvittering) er valg på samme skjerm. */
const IDENTITY_KEYS = ['gameId', 'leagueId'] as const;

function sameIdentity(a: object | undefined, b: object | undefined): boolean {
  const left = (a ?? {}) as Record<string, unknown>;
  const right = (b ?? {}) as Record<string, unknown>;
  return IDENTITY_KEYS.every((key) => left[key] === right[key]);
}

/**
 * Hvor skal vi, gitt stakken? `'popTo'` når den nærmeste skjermen med navnet
 * ligger under den du står på og gjelder samme spill eller liga. Ellers
 * `fallback`.
 */
export function backStep(
  routes: readonly RouteLike[],
  name: string,
  params: object | undefined,
  fallback: 'replace' | 'push' = 'replace',
): BackStep {
  const current = routes.length - 1;
  for (let i = current; i >= 0; i--) {
    const route = routes[i]!;
    if (route.name !== name) continue;
    return i < current && sameIdentity(route.params, params) ? 'popTo' : fallback;
  }
  return fallback;
}

type Args<N extends keyof RootStackParamList> = undefined extends RootStackParamList[N]
  ? [name: N, params?: RootStackParamList[N]]
  : [name: N, params: RootStackParamList[N]];

function go(navigation: BackNavigation, fallback: 'replace' | 'push', name: string, params?: object) {
  const state = navigation.getState();
  const routes = state ? state.routes.slice(0, state.index + 1) : [];
  const step = backStep(routes, name, params, fallback);
  // `never`-parameterne over lar alle skjermers `navigation` passe; her er
  // navnet og params alt sjekket mot param-lista av `Args`.
  const call = (fn: (name: never, params?: never) => void) => fn(name as never, params as never);
  if (step === 'popTo') call(navigation.popTo.bind(navigation));
  else if (step === 'replace') call(navigation.replace.bind(navigation));
  else call(navigation.navigate.bind(navigation));
}

/**
 * Forlat et skjema du har sendt: tilbake til skjermen når den ligger under,
 * ellers bytt ut skjemaet med den. Skjemaet blir aldri liggende i stakken.
 */
export function backTo<N extends keyof RootStackParamList>(navigation: BackNavigation, ...args: Args<N>) {
  go(navigation, 'replace', args[0], args[1] as object | undefined);
}

/**
 * Gå videre uten løkker: tilbake til skjermen når den ligger under (hull →
 * tavla → hull gir ett hull), ellers åpne den som vanlig.
 */
export function openOrReturn<N extends keyof RootStackParamList>(
  navigation: BackNavigation,
  ...args: Args<N>
) {
  go(navigation, 'push', args[0], args[1] as object | undefined);
}
