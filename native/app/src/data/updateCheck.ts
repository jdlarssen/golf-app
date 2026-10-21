// native/app/src/data/updateCheck.ts
// Native #2619: hente minstenivået fra den offentlige ruta. Svaret leses av
// `createUpdateCheck` (`lib/updateGuard.ts`).
//
// Aldri noe som kaster og aldri noe som henger: alt annet enn et ferdig 200-svar
// innen fristen er `null`, og `null` betyr «ingen dialog».
import { FETCH_TIMEOUT_MS } from '../lib/updateGuard';
import { callPublicWebRoute } from './webApi';

export const MIN_VERSION_PATH = '/api/app/min-version';

export async function fetchMinVersionBody(): Promise<Record<string, unknown> | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), FETCH_TIMEOUT_MS);
  });
  const request = callPublicWebRoute(MIN_VERSION_PATH, 'GET')
    .then((call) => (call.ok && call.status === 200 ? call.body : null))
    .catch(() => null);
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
