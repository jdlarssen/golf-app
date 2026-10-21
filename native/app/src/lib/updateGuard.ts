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

/** Høyst én sjekk per så lenge, etter et svar vi kunne bruke. */
export const CHECK_INTERVAL_MS = 10 * 60 * 1000;

/** Etter et kall uten brukbart svar venter vi så lenge før neste forsøk. */
export const FAILURE_PAUSE_MS = 60 * 1000;

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
 * Etter et brukbart svar går det minst 10 minutter til neste henting. Et kall
 * uten brukbart svar (nettfeil, timeout, uleselig kropp) gir bare en kort pause,
 * så en spiller som var uten nett ved oppstart ikke venter 10 minutter på neste
 * forsøk.
 */
export function createUpdateCheck(deps: UpdateCheckDeps): () => Promise<boolean> {
  let tooOld = false;
  let notBefore: number | null = null;
  let inFlight = false;

  return async function check(): Promise<boolean> {
    if (deps.build === null) return false;
    if (inFlight) return tooOld;

    const now = deps.now();
    // Står grensen lenger fram enn det lengste vinduet, gikk klokka bakover; da
    // stoler vi ikke på den.
    const due =
      notBefore === null || now >= notBefore || notBefore - now > CHECK_INTERVAL_MS;
    if (!due) return tooOld;

    inFlight = true;
    let minBuild: number | null = null;
    try {
      const body = await deps.fetchBody();
      minBuild = body === null ? null : readMinBuild(body, deps.platform);
    } catch {
      // Nettfeil er ikke et svar: tilstanden står som den var.
    } finally {
      inFlight = false;
    }
    if (minBuild !== null) {
      tooOld = isBelowMinimum(deps.build, minBuild);
      notBefore = now + CHECK_INTERVAL_MS;
    } else {
      notBefore = now + FAILURE_PAUSE_MS;
    }
    return tooOld;
  };
}
