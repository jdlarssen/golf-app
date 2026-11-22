// native/app/src/lib/newVersion.ts
// Native #2975: ren logikk for «ny versjon er klar». Hooken og leverandøren bor i
// `useNewVersion.tsx`, visningene i `components/newVersion/`.
//
// Bygget, versjonen og nyhetene kommer fra `GET /api/app/min-version`, satt i
// `lib/app/latestBuild.ts`. Dette er et hint, ikke en vakt: alt som er ukjent
// (dev uten byggnummer, nettfeil, en server fra før #2975) gir ingenting.
import { parseBuild } from './appBuild';
import type { StorePlatform } from './updateGuard';

/** Nøkkelen i AsyncStorage: bygget arket sist ble vist og lukket for. */
export const NEW_VERSION_SEEN_KEY = 'torny-new-version-seen';

export type LatestRelease = {
  build: number;
  /** Semver, f.eks. `1.2.0`, eller `null` når serveren ikke sier det. */
  version: string | null;
  /** Det som er nytt, én linje per punkt. Tom liste = arket uten liste. */
  notes: string[];
};

/**
 * - `sheet`: et nyere bygg er ute, og arket er ikke vist for det.
 * - `reminder`: arket er lukket for det nyeste bygget, men appen er ikke
 *   oppdatert. Prikken på profil-pillen og raden på Profil står.
 * - `none`: appen er oppdatert, eller noe er ukjent.
 */
export type NewVersionMode = 'none' | 'sheet' | 'reminder';

function isBuildNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Det nyeste bygget for plattformen ut av svaret fra ruta, eller `null` når
 * byggnummeret mangler eller har feil form. Versjon og nyheter er valgfrie.
 * Feltnavnene følger `lib/app/latestBuild.ts`.
 */
export function readLatestRelease(
  body: Record<string, unknown>,
  platform: StorePlatform,
): LatestRelease | null {
  const entry = body[platform];
  if (entry === null || typeof entry !== 'object') return null;
  const fields = entry as Record<string, unknown>;
  const build = fields[platform === 'ios' ? 'latestBuild' : 'latestVersionCode'];
  if (!isBuildNumber(build)) return null;
  const version =
    typeof fields.latestVersion === 'string' && fields.latestVersion.trim() !== ''
      ? fields.latestVersion.trim()
      : null;
  const notes = Array.isArray(fields.notes)
    ? fields.notes
        .filter((line): line is string => typeof line === 'string')
        .map((line) => line.trim())
        .filter((line) => line !== '')
    : [];
  return { build, version, notes };
}

/** «1.2.0 (15)» som i TestFlight, eller bare «15» uten versjon. */
export function releaseName(release: LatestRelease): string {
  return release.version !== null ? `${release.version} (${release.build})` : String(release.build);
}

/**
 * Hva appen skal vise. Sett for bygg 15 betyr at arket ikke kommer igjen for 15
 * eller noe under, men påminnelsen står til appen kjører 15. Kommer 16, vises
 * arket igjen.
 */
export function newVersionMode(input: {
  build: number | null;
  latest: number | null;
  seen: number | null;
}): NewVersionMode {
  const { build, latest, seen } = input;
  if (build === null || latest === null || latest <= build) return 'none';
  return seen !== null && seen >= latest ? 'reminder' : 'sheet';
}

/** Det lagrede tallet → bygget, eller `null` når det mangler eller er uleselig. */
export function parseSeenBuild(raw: string | null | undefined): number | null {
  return parseBuild(raw);
}
