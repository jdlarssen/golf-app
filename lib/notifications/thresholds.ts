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
 * Egen fil framfor å bo i notify.ts: historisk fordi middleware-laget den
 * gang kjørte på edge-runtime og ikke kunne importere `server-only`-moduler.
 * Premisset er utdatert — i Next 16 kjører proxy.ts på Node.js-runtimen, og
 * edge kan ikke lenger konfigureres for proxy (proxy.md §Runtime: «Setting
 * the runtime config option in Proxy will throw an error»). Splitten består
 * som ren stil: proxy-bundelen slipper å dra inn hele notify-modulen for én
 * konstant. (#1336)
 */
export const OFF_APP_THRESHOLD_MS = 5 * 60 * 1000;
