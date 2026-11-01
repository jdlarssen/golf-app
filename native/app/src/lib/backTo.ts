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
  reset(state: never): void;
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

/**
 * Skjermen over i hierarkiet (regel 1 i §Tilbake): Hjem → spillet → hull,
 * scorekort, tavla og godkjenning. Hjem → ligaen → start runde og markørens
 * kort. Hjem → Profil → rommene under profilen. Skjermer en lenke åpner, har
 * ingen «der du kom fra» og ligger rett under Hjem (#2748). Hjem står over alt.
 */
const PARENT: Partial<Record<keyof RootStackParamList, keyof RootStackParamList>> = {
  GameHome: 'Home',
  Hole: 'GameHome',
  Scorecard: 'GameHome',
  Leaderboard: 'GameHome',
  HoleByHole: 'GameHome',
  Approve: 'GameHome',
  EndGame: 'GameHome',
  League: 'Home',
  LeagueJoin: 'Home',
  LeagueRoundStart: 'League',
  MarkerApprove: 'League',
  Profile: 'Home',
  EditProfile: 'Profile',
};

/** Står skjermen `screen` over `name` i hierarkiet? */
function isAbove(screen: string, name: string): boolean {
  for (let parent = PARENT[name as keyof RootStackParamList]; parent; parent = PARENT[parent]) {
    if (parent === screen) return true;
  }
  return false;
}

/** Gjelder skjermen samme spill eller liga som målet? */
function sharesIdentity(route: RouteLike, params: object | undefined): boolean {
  const own = (route.params ?? {}) as Record<string, unknown>;
  const target = (params ?? {}) as Record<string, unknown>;
  return IDENTITY_KEYS.some((key) => target[key] !== undefined && own[key] === target[key]);
}

/**
 * Hvor mange skjermer under den du står på, skal bli liggende når `backTo`
 * legger målet inn (regel 3 i §Tilbake)? Skjermer fra samme spill eller liga
 * som ligger over den nærmeste skjermen over målet i hierarkiet, går ut sammen
 * med skjemaet. Kortet levert fra Hjem-kortets hull ([Hjem, Hull 18,
 * Scorekort]) gir da [Hjem, Spillet], ikke [Hjem, Hull 18, Spillet] der
 * tilbake fra spillet ville åpnet hullet på kortet du nettopp leverte. Alt
 * annet blir liggende.
 */
export function keepBelow(routes: readonly RouteLike[], name: string, params: object | undefined): number {
  for (let i = routes.length - 2; i >= 0; i--) {
    const route = routes[i]!;
    if (isAbove(route.name, name) || !sharesIdentity(route, params)) return i + 1;
  }
  return 0;
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
  else if (step === 'push') call(navigation.navigate.bind(navigation));
  else {
    // Skjemaet byttes ut. Ligger det skjermer mellom skjemaet og skjermen
    // over målet i hierarkiet, går de ut samtidig (ett `reset`, de som blir
    // liggende beholder nøklene sine og er montert som før).
    const keep = keepBelow(routes, name, params);
    if (keep >= routes.length - 1) call(navigation.replace.bind(navigation));
    else {
      const next = [...routes.slice(0, keep), { name, params }];
      navigation.reset({ index: next.length - 1, routes: next } as never);
    }
  }
}

/**
 * Forlat et skjema du har sendt: tilbake til skjermen når den ligger under,
 * ellers bytt ut skjemaet med den, under skjermen som står over den i
 * hierarkiet. Skjemaet blir aldri liggende i stakken.
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
