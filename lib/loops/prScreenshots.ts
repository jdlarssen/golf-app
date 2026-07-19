// Discord PR-kort, Del B (#1159): ren logikk for å avgjøre om en PR-diff rører
// en visuell flate, og hvilke staging-ruter som skal skjermbildes. Playwright-
// kjøringen (scripts/loops/screenshot-routes.ts) resolverer ekte fikstur-verdier
// mot staging og navigerer; denne modulen er kun kartleggingen (unit-testbar).

// Fikstur-verdier resolvert mot staging på kjøretid; her injisert så funksjonene
// er rene. Mangler en verdi → ruter som trenger den droppes (best-effort).
export type Fixtures = {
  /** Aktivt spill — scorecard-/hull-familiene (føring pågår). */
  gameId?: string;
  /**
   * Ferdig spill (sideturnering + round_report seedet) — leaderboard-/podium-
   * familiene, der fikser typisk bare synes i finished-tilstanden (#1295).
   */
  finishedGameId?: string;
  courseSlug?: string;
  clubId?: string;
  cupId?: string;
  ligaId?: string;
  playerId?: string;
};

export type RouteAuth = 'admin' | 'player' | 'none';

export type RouteTarget = {
  path: string;
  auth: RouteAuth;
  /** Menneskelesbar kilde (endret fil / komponent-familie) for kort + logg. */
  label: string;
};

// Maks skjermbilder per kort — holder Discord-kortet lesbart.
export const MAX_SHOTS = 3;

// En endret fil er «visuell» hvis den er en .tsx under app/[locale] eller
// components/ (ekskl. tester).
export function isVisualChange(files: string[]): boolean {
  return files.some(
    (f) =>
      !/\.test\.tsx$/.test(f) &&
      (/^app\/\[locale\]\/.*\.tsx$/.test(f) || /^components\/.*\.tsx$/.test(f)),
  );
}

// Auth-behov ut fra rute-prefiks. Public-settet speiler proxy.ts' åpne ruter.
function authForPath(path: string): RouteAuth {
  if (path.startsWith('/admin')) return 'admin';
  if (path === '/') return 'none';
  if (path === '/login' || path === '/demo') return 'none';
  if (path.startsWith('/baner')) return 'none';
  if (path.startsWith('/legal')) return 'none';
  if (path.startsWith('/embed')) return 'none';
  return 'player';
}

// `app/[locale]/games/[id]/leaderboard/page.tsx` → ['games','[id]','leaderboard'].
// Route-grupper `(auth)` strippes. Null hvis ikke en page.tsx under app/[locale].
function pageFileToSegments(file: string): string[] | null {
  const prefix = 'app/[locale]/';
  const suffix = '/page.tsx';
  if (!(file.startsWith(prefix) && file.endsWith(suffix))) return null;
  const inner = file.slice(prefix.length, file.length - suffix.length);
  if (inner === '') return []; // app/[locale]/page.tsx → forsiden
  return inner.split('/').filter((s) => !(s.startsWith('(') && s.endsWith(')')));
}

// Substituerer ett rute-segment. Statisk segment returneres uendret; et
// dynamisk `[param]` mappes til en fikstur-verdi ut fra param-navn + kontekst
// (foreldre-segmentene). Null = ingen fikstur → hele ruten droppes.
function substituteSegment(
  seg: string,
  parents: string[],
  fx: Fixtures,
): string | null {
  if (!(seg.startsWith('[') && seg.endsWith(']'))) return seg;
  const param = seg.slice(1, -1);
  switch (param) {
    case 'holeNumber':
      return '1';
    case 'slug':
      return fx.courseSlug ?? null;
    case 'userId':
      return fx.playerId ?? null;
    case 'cupId':
      return fx.cupId ?? null;
    case 'ligaId':
      return fx.ligaId ?? null;
    case 'id': {
      if (parents.includes('games')) return fx.gameId ?? null;
      if (parents.includes('cup')) return fx.cupId ?? null;
      if (parents.includes('liga')) return fx.ligaId ?? null;
      if (parents.includes('klubber')) return fx.clubId ?? null;
      if (parents.includes('spillere')) return fx.playerId ?? null;
      return null; // ukjent [id]-kontekst (f.eks. lanseringer)
    }
    default:
      return null; // shortId, token, roundId … — ingen fikstur i v1
  }
}

function buildRoute(segs: string[], fx: Fixtures): string | null {
  const out: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    const sub = substituteSegment(segs[i], segs.slice(0, i), fx);
    if (sub === null) return null;
    out.push(sub);
  }
  return `/${out.join('/')}`;
}

// Kuratert komponent → rute-map (nøkkelord i filstien, robust mot mappe-navn).
// Leaderboard/podium skyter det FERDIGE fikstur-spillet (fallback aktivt) —
// #1292-klassen av fikser synes bare der; scorecard/hull trenger aktivt spill.
const COMPONENT_ROUTE_MAP: Array<{
  key: RegExp;
  route: (fx: Fixtures) => string | null;
  label: string;
}> = [
  { key: /leaderboard/i, route: (fx) => finishedOrActiveLeaderboard(fx), label: 'leaderboard' },
  { key: /podium/i, route: (fx) => finishedOrActiveLeaderboard(fx), label: 'podium' },
  { key: /scorecard/i, route: (fx) => (fx.gameId ? `/games/${fx.gameId}/scorecard` : null), label: 'scorecard' },
  { key: /(hole|hull)/i, route: (fx) => (fx.gameId ? `/games/${fx.gameId}/holes/1` : null), label: 'hull' },
];

function finishedOrActiveLeaderboard(fx: Fixtures): string | null {
  const id = fx.finishedGameId ?? fx.gameId;
  return id ? `/games/${id}/leaderboard` : null;
}

// Familie-kartet gjelder components/ OG samlokaliserte ikke-page-.tsx under
// app/[locale] (#1295): PR #1294 endret kun leaderboard/formats/*.tsx og falt
// utenfor både page-utledningen og components-kravet → login-skjermbilde.
function mapFamilyFile(file: string, fx: Fixtures): RouteTarget | null {
  if (/\.test\.tsx$/.test(file)) return null;
  const isComponent = /^components\/.*\.tsx$/.test(file);
  const isColocated = /^app\/\[locale\]\/.*\.tsx$/.test(file) && !file.endsWith('/page.tsx');
  if (!isComponent && !isColocated) return null;
  for (const entry of COMPONENT_ROUTE_MAP) {
    if (entry.key.test(file)) {
      const path = entry.route(fx);
      if (path) return { path, auth: authForPath(path), label: `komponent: ${entry.label}` };
    }
  }
  return null;
}

/**
 * Kartlegger endrede filer til staging-ruter som skal skjermbildes. Page-endringer
 * prioriteres (rute utledet fra stien + fikstur-substitusjon), deretter kuraterte
 * komponent-familier (components/ + samlokaliserte app/[locale]-tsx). Deduplisert
 * på path, cappet til {@link MAX_SHOTS}. Uoppløst → tom liste, aldri fallback (#1295).
 */
export function deriveTargetsFromChangedFiles(files: string[], fx: Fixtures): RouteTarget[] {
  const targets: RouteTarget[] = [];
  const seen = new Set<string>();
  const push = (t: RouteTarget) => {
    if (seen.has(t.path)) return;
    seen.add(t.path);
    targets.push(t);
  };

  for (const f of files) {
    const segs = pageFileToSegments(f);
    if (segs === null) continue;
    const route = buildRoute(segs, fx);
    if (route) push({ path: route, auth: authForPath(route), label: f });
  }
  for (const f of files) {
    const mapped = mapFamilyFile(f, fx);
    if (mapped) push(mapped);
  }
  // #1295: ingen forsiden-fallback — en uoppløst visuell diff gir heller null
  // bilder enn et intetsigende anonym-skudd (som ender som login-skjermen).
  return targets.slice(0, MAX_SHOTS);
}
