# Evaluerings-runder — #1286 spillformater 404 (natt-bygg)

Kontrakt: ekte 404 for ugyldige `/spillformater/<slug>`-slugs (proxy-guard under
cacheComponents). Baner-delen (del 2) utsatt per kontraktens fallback #3.

## Runde 1 (Opus, bygg)
- Implementert: `proxy.ts` slug-guard (MODE_LABELS-sett + regex) → minimal
  brandet `NextResponse` med status 404 + `Cache-Control: no-store`, FØR
  auth/i18n-grenene. Locale-strippet sti → /en dekket gratis.
- e2e: `e2e/public/spillformater-status.spec.ts` (@gate) — 404 for tullball
  (begge locales), 200 for gyldig slug + liste-siden.
- Del 2 (baner): UTSATT. proxy.md advarer mot delte moduler/treg proxy +
  "avoid fetching full content"; baner-slugs er DB-drevne (dynamiske). Rent
  proxy-DB-oppslag eller statisk manifest = ny kompleksitetsklasse → oppfølgings-
  issue opprettet, spillformater-delen leveres alene (delvis leveranse akseptert).
- Gates: se PR-kommentar for kommando-utfall.
