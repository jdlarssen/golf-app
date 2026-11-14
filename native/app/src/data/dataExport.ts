// #2332 PR C: «Last ned dataene dine», rett i appen.
//
// Appen henter fila fra `GET /api/profile/export` med tokenet sitt, skriver den
// til cache-mappa som `torny-data-<dato>.json` og åpner telefonens delingsark,
// der spilleren kan lagre den i Filer, sende den på e-post eller la være.
// Ingen nettleser og ingen ny innlogging. Fila er den samme som nettsiden gir:
// begge rutene bygger den med `buildUserExport` (`lib/profile/exportCore.ts`).
//
// **Wiren** er rutas egen (`app/api/profile/export/route.ts`): 200 med
// eksportobjektet, 401 `unauthorized`, 500 `export_failed`. Alt annet enn 200 og
// 401 leses som `failed`, også en ny kode ruta en dag kunne finne på.
//
// **Modulene lastes ved trykk.** `expo-file-system` og `expo-sharing` hentes
// med lat `require`, som i `lib/shareImage.ts`: jest kjører ikke dynamisk
// import, og skjermen skal kunne vises uten at de native delene lastes. Kaster
// noe av dette (en modul mangler i bygget, disken er full), blir det `failed`.
//
// **Et lukket ark er ingen feil.** `shareAsync` svarer likt når spilleren delte
// og når arket ble lukket, og begge er `ok`: fila ble laget og tilbudt.
import { callWebRoute, type WebApiFailure } from './webApi';

const EXPORT_PATH = '/api/profile/export';

/**
 * Tidstaket for hentingen: det samme som ruta tåler (`maxDuration` 60 s), ikke
 * appens vanlige 15 s. Taket gjelder til hele kroppen er lest, og for en spiller
 * med mange sesonger er fila stor. Målt på staging 14.11: 682 kB på under 3,1 s
 * i simulatoren, og den tyngste spilleren der har omtrent 1,4 ganger så mye; på
 * svakt mobilnett blir det fort mange ganger mer.
 */
export const EXPORT_TIMEOUT_MS = 60_000;

/** Hvorfor fila ikke kom fram. `failed` dekker både ruta og telefonen. */
export type DataExportFailure = WebApiFailure | 'failed';

export type DataExportResult = { ok: true } | { ok: false; reason: DataExportFailure };

/**
 * `torny-data-2026-11-20.json`, med telefonens egen dato. Samme navn som
 * nettsiden gir fila, så to nedlastinger fra samme dag har samme navn.
 */
export function dataExportFilename(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `torny-data-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/** Hent fila, skriv den og åpne delingsarket. Kaster aldri. */
export async function downloadDataExport(now: Date = new Date()): Promise<DataExportResult> {
  const call = await callWebRoute(EXPORT_PATH, 'GET', undefined, { timeoutMs: EXPORT_TIMEOUT_MS });
  if (!call.ok) return call;
  if (call.status === 401) return { ok: false, reason: 'unauthorized' };
  if (call.status !== 200) return { ok: false, reason: 'failed' };

  try {
    /* eslint-disable @typescript-eslint/no-require-imports -- lastes ved trykk, se toppen av fila */
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    const sharing = require('expo-sharing') as typeof import('expo-sharing');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const file = new File(Paths.cache, dataExportFilename(now));
    file.create({ overwrite: true });
    file.write(JSON.stringify(call.body, null, 2));
    await sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
    return { ok: true };
  } catch (err) {
    console.error('[dataExport] fila kunne ikke skrives eller deles', err);
    return { ok: false, reason: 'failed' };
  }
}
