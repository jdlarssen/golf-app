// native/app/src/lib/updateGuard.ts
// Native #2619: ren logikk for oppdateringsvakta — sammenligningen og
// 10-minuttersgrensen. Selve dialogen bor i `useUpdateGuard.ts`, nettkallet i
// `data/updateCheck.ts`.
//
// **Fail-open er hele kontrakten.** Vakta ber spilleren oppdatere bare når
// serveren har SVART at bygget er for gammelt. Ukjent byggnummer (dev, Expo Go),
// uleselig svar, timeout og nettfeil gir alle «ingen dialog»: appen blokkerer
// aldri på grunn av en nettfeil.

export type StorePlatform = 'ios' | 'android';

/** Høyst én sjekk per så lenge. */
export const CHECK_INTERVAL_MS = 10 * 60 * 1000;

/** Svarer ikke ruta innen så lenge, regnes sjekken som mislykket. */
export const FETCH_TIMEOUT_MS = 5000;

function isBuildNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Minstenivået for plattformen ut av `GET /api/app/min-version`, eller `null`
 * når svaret ikke har riktig form. Feltnavnene følger `lib/app/minVersion.ts`.
 */
export function readMinBuild(body: Record<string, unknown>, platform: StorePlatform): number | null {
  const entry = body[platform];
  if (entry === null || typeof entry !== 'object') return null;
  const value = (entry as Record<string, unknown>)[
    platform === 'ios' ? 'minBuild' : 'minVersionCode'
  ];
  return isBuildNumber(value) ? value : null;
}

/** Sant bare når begge tallene er kjent og bygget er lavere enn minstenivået. */
export function isBelowMinimum(build: number | null, minBuild: number | null): boolean {
  return build !== null && minBuild !== null && build < minBuild;
}

export type UpdateCheckDeps = {
  platform: StorePlatform;
  /** Bygget som kjører, eller `null` når det er ukjent. */
  build: number | null;
  /** Svaret fra ruta, eller `null` ved nettfeil og timeout. Kan kaste. */
  fetchBody: () => Promise<Record<string, unknown> | null>;
  now: () => number;
};

/**
 * Lager sjekken som vakta kaller ved oppstart og hver gang appen kommer i
 * forgrunnen. Svaret er «skal dialogen vises nå?».
 *
 * Et bekreftet «for gammelt» huskes: neste forgrunn viser dialogen igjen uten ny
 * henting, og en senere mislykket sjekk fjerner den ikke. Bare et nytt, gyldig
 * svar fra serveren kan slippe spilleren inn igjen.
 *
 * Et mislykket kall teller som en sjekk i vinduet (høyst én per 10 min).
 */
export function createUpdateCheck(deps: UpdateCheckDeps): () => Promise<boolean> {
  let tooOld = false;
  let lastCheckAt: number | null = null;
  let inFlight = false;

  return async function check(): Promise<boolean> {
    if (deps.build === null) return false;
    if (inFlight) return tooOld;

    const now = deps.now();
    const elapsed = lastCheckAt === null ? Infinity : now - lastCheckAt;
    // Negativ tid betyr at klokka gikk bakover; da stoler vi ikke på vinduet.
    const due = elapsed < 0 || elapsed >= CHECK_INTERVAL_MS;
    if (!due) return tooOld;

    inFlight = true;
    lastCheckAt = now;
    try {
      const body = await deps.fetchBody();
      const minBuild = body === null ? null : readMinBuild(body, deps.platform);
      if (minBuild !== null) tooOld = isBelowMinimum(deps.build, minBuild);
    } catch {
      // Nettfeil er ikke et svar: tilstanden står som den var.
    } finally {
      inFlight = false;
    }
    return tooOld;
  };
}
