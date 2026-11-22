// native/app/src/lib/newVersion.ts
// Native #2975: ren logikk for stripa «Ny versjon er klar.». Hooken bor i
// `useNewVersion.ts`, stripa i `components/NewVersionStrip.tsx`.
//
// Tallet for det nyeste bygget kommer fra `GET /api/app/min-version`, satt i
// `lib/app/latestBuild.ts`. Stripa er et hint, ikke en vakt: alt som er ukjent
// (dev uten byggnummer, nettfeil, en server fra før #2975) gir ingen stripe.
import { parseBuild } from './appBuild';
import type { StorePlatform } from './updateGuard';

/** Nøkkelen i AsyncStorage: bygget stripa sist ble lukket for. */
export const NEW_VERSION_DISMISSED_KEY = 'torny-new-version-dismissed';

function isBuildNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Det nyeste bygget for plattformen ut av svaret fra ruta, eller `null` når
 * feltet mangler eller har feil form. Feltnavnene følger `lib/app/latestBuild.ts`.
 */
export function readLatestBuild(body: Record<string, unknown>, platform: StorePlatform): number | null {
  const entry = body[platform];
  if (entry === null || typeof entry !== 'object') return null;
  const value = (entry as Record<string, unknown>)[
    platform === 'ios' ? 'latestBuild' : 'latestVersionCode'
  ];
  return isBuildNumber(value) ? value : null;
}

/**
 * Sant når et nyere bygg er ute og stripa ikke er lukket for det. Lukket for
 * bygg 15 betyr skjult for 15 og alt under, men synlig igjen når 16 kommer.
 */
export function shouldShowNewVersion(input: {
  build: number | null;
  latest: number | null;
  dismissed: number | null;
}): boolean {
  const { build, latest, dismissed } = input;
  if (build === null || latest === null) return false;
  if (latest <= build) return false;
  return dismissed === null || latest > dismissed;
}

/** Det lagrede tallet → bygget, eller `null` når det mangler eller er uleselig. */
export function parseDismissedBuild(raw: string | null | undefined): number | null {
  return parseBuild(raw);
}
