import type { NotificationKind, NotificationPayload } from './types';

/** Strukturell delmengde — vi trenger kun kind + payload for filtreringen. */
type SignupRow = {
  kind: NotificationKind;
  payload: NotificationPayload;
};

/**
 * Distinkte `game_id`-er fra `registration_request`-varsler. Brukes til å slå
 * opp hvilke av disse spillene som fortsatt finnes, i ÉN batched spørring, før
 * vi filtrerer (#613).
 */
export function collectSignupGameIds<T extends SignupRow>(rows: T[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.kind === 'registration_request') {
      const p = row.payload as NotificationPayload<'registration_request'>;
      ids.add(p.game_id);
    }
  }
  return [...ids];
}

/**
 * Del `registration_request`-varsler i dem som fortsatt peker på et spill som
 * finnes (`visible`) og dem som peker på et slettet/utilgjengelig spill
 * (`stale`). Et stale varsel navigerer til `/admin/games/[id]/signups`, som
 * kaller `notFound()` når spillet er borte — en blindvei brukeren uansett ikke
 * kan handle på, så det holdes ute av lista (#613).
 *
 * Sletter aldri noe: `stale`-radene arkiveres best-effort av innboks-siden
 * (`archiveStaleNotifications`, #1393) slik at de ikke blir liggende uleste og
 * holde bunn-nav-prikken tent for alltid. Historikken beholdes i DB.
 *
 * Kun signup-varsler partisjoneres; andre kinder er alltid `visible` (den
 * merkede not-found-en, #612, er sikkerhetsnettet for deres sjeldne blindveier).
 *
 * `existingGameIds` = settet av `game_id`-er som faktisk finnes (fra
 * `collectSignupGameIds` → eksistens-spørring). Rekkefølgen bevares i begge
 * bøttene.
 */
export function partitionStaleSignupNotifications<T extends SignupRow>(
  rows: T[],
  existingGameIds: Set<string>,
): { visible: T[]; stale: T[] } {
  const visible: T[] = [];
  const stale: T[] = [];
  for (const row of rows) {
    if (row.kind !== 'registration_request') {
      visible.push(row);
      continue;
    }
    const p = row.payload as NotificationPayload<'registration_request'>;
    if (existingGameIds.has(p.game_id)) visible.push(row);
    else stale.push(row);
  }
  return { visible, stale };
}
