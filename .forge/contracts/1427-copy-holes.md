# Kontrakt #1427 — to copy-hull: «rotereende» + tom headingGold i EN

**Issue:** #1427 · **Branch:** `claude/1427-copy-holes` · **Type:** fix (bruker-synlig)

## Mål

To pre-eksisterende katalog-hull fra #1267-runden:

1. **Skrivefeil:** `formatGuide.content.wolf.shortDescription` i `messages/no.json`
   (L1505): «rotereende» → «roterende».
2. **Tom accent-streng:** `messages/en.json` `landing.endCta.headingGold` (L5612) er
   `""`. NO har «par» (golf-ordspillet i «på et par minutter»). Rendereren
   (`AnonLanding.tsx:300`) håndterer allerede tom streng bevisst (`{gold && <span>}`),
   så dette er et manglende ord, ikke en crash — EN-CTA-en mangler bare gull-aksenten.

## Produktvalg (gullordet)

- **A (bygget):** ordspill-speiling — pre «Fire up your golf tournament in a », gold
  «par», post « of minutes» → «…in a **par** of minutes». Beholder golf-blunket fra
  NO-taglinen; målgruppa (golfere) leser det umiddelbart.
- **B:** trygg emfase — pre «…in a », gold «couple», post « of minutes». Ingen ordspill,
  null risiko for å leses som skrivefeil av ikke-golfere.
- Synlig tekstforskjell for spillere → PR-en får `## Produktvalg`-heading (ordrett, jf.
  #1630) og auto-merges IKKE.

## Suksesskriterier

- [ ] `no.json` sier «roterende» (wolf.shortDescription); EN-søsteren uendret (allerede
  korrekt: «the Wolf rotates»).
- [ ] `en.json` `landing.endCta.*` gir en hel, naturlig setning MED ikke-tomt gullord.
- [ ] Ingen test-/snapshot-oppdatering nødvendig (0 test-treff på strengene — verifisert
  grep); `npx vitest -u` kjøres IKKE.
- [ ] `.changes/1427-copy-hull.md` notatfil (type fix).
- [ ] Humanizer-sjekk på ny EN-copy (og typo-fiksen).
- [ ] Staging-bevis: skjermbilde av EN lande-CTA + wolf-kortet i formatguiden på
  torny-staging, postet som PR-kommentar + `staging-verified`-label FØR ready.

## Gates

- `npx vitest run lib/i18n` hvis katalog-strukturtester finnes (glob sjekkes); ellers
  `npm run build` (validerer JSON-parsing + i18n-nøkler ved render).

## Antagelser

- ASSUMPTION: A («par»-ordspillet) anbefales og bygges; eieren kan svare «alternativ B»
  på PR-en for ombygging på samme branch (liten kostnad — én streng).

## Utenfor scope

- hvorfor-torny-sidens endCta (har allerede gullord i begge locales). Øvrige
  formatGuide-tekster.
