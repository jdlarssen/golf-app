/**
 * Terskel for når brukeren regnes som «off-app» og dermed skal få mail
 * som backup på in-app varselet. 5 min er konservativt — dekker normal
 * idle/swap-mellom-apper-bruk uten å gi unødvendig mail-spam.
 *
 * Brukes både av `lib/notifications/notify.ts` (gating for shouldAlsoSendMail)
 * og av `proxy.ts` (Postgres-side WHERE-clause-debounce på `users.last_seen_at`
 * skriv-frekvens). Konstantene MÅ matche, ellers kan en aktiv bruker få mail
 * fordi siste last_seen_at-skriving var > 5 min siden men < proxy-debouncen.
 *
 * Refleksjonen er beskrevet nærmere i design-doc-en til issue #25.
 *
 * Egen fil framfor å bo i notify.ts fordi proxy.ts kjører på edge runtime
 * og kan ikke importere fra moduler som har `import 'server-only'`.
 */
export const OFF_APP_THRESHOLD_MS = 5 * 60 * 1000;
