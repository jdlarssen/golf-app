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
 * Skjul `registration_request`-varsler som peker til et spill som ikke lenger
 * finnes (slettet/utilgjengelig). Et slikt varsel navigerer til
 * `/admin/games/[id]/signups`, som kaller `notFound()` når spillet er borte —
 * en blindvei. I stedet for å la brukeren treffe den merkede 404-en for et
 * varsel de uansett ikke kan handle på, fjernes raden fra visningen (#613).
 *
 * Ikke-destruktivt: rader blir værende i `notifications`-tabellen, de skjules
 * bare. Kun signup-varsler beskjæres; andre kinder beholdes uansett (den
 * merkede not-found-en, #612, er sikkerhetsnettet for deres sjeldne blindveier).
 *
 * `existingGameIds` = settet av `game_id`-er som faktisk finnes (fra
 * `collectSignupGameIds` → eksistens-spørring). Rekkefølgen bevares.
 */
export function filterStaleSignupNotifications<T extends SignupRow>(
  rows: T[],
  existingGameIds: Set<string>,
): T[] {
  return rows.filter((row) => {
    if (row.kind !== 'registration_request') return true;
    const p = row.payload as NotificationPayload<'registration_request'>;
    return existingGameIds.has(p.game_id);
  });
}
