# Copy-stil for Tørny (norsk bruker-rettet tekst)

Pattern-katalog for bruker-rettet copy i Tørny — strenger som vises i UI, mail-templates, feilmeldinger, banner-tekster, knapper, helper-tekster.

Trigger: `.githooks/pre-commit` peker hit når den advarer. Korte hooked-mønstre + bevisst-bevart-listen ligger også i [`CLAUDE.md`](../CLAUDE.md) under «Språk-kvalitet i bruker-rettet copy» (slik at jeg er primet før commit, ikke bare etter).

## Hva hooken fanger mekanisk

`.githooks/pre-commit` advarer (men blokkerer ikke) på følgende i nye linjer i `.tsx`/`.ts`-filer (ikke tester, ikke markdown):

- «X-spillet»-redundans (`slagspill-spillet` → `slagspillet`, `matchplay-spillet` → `matchen`, `par-stableford-spillet` → `par-stableford-runden`)
- «Vennligst»-overforbruk
- «Tap»-anglism (`Tap kort` → `Trykk kort`)
- Em-dash-kjeder (`X — Y — Z` → splitt med punktum/komma/parens)

## Hovedmønstre — utover hookens automatikk

Etablert i [PR #170](https://github.com/jdlarssen/golf-app/pull/170) og [PR #174](https://github.com/jdlarssen/golf-app/pull/174).

- **Anglisismer:** `feature` → `funksjon`, `release` → `lansering`, `entry` → `oppføring`, `by default` → `som standard`, «på login» → drop
- **Significance-puffery:** drop frase som «markerer at», «representerer en pivotal», «spennings-moment» → bytt med noe konkret
- **Curly quotes** → guillemets («…»)
- **US-decimal i feilmeldinger** → norsk komma (`54.0` → `54,0`)
- **Passiv → aktiv du-form:** «Vi mottok forespørsel» → «Du har bedt om»
- **Generisk feilmelding → konkret:** «Noe gikk galt» → «Klarte ikke å fullføre handlingen»
- **Idiomatisk definitt-form:** «leaderboard er åpen» → «leaderboardet er åpent»

## Bevisst bevart (false-positives å ignorere ved hook-advarsel)

- Brand-tagline `Tørny — fyr opp golfturneringen` (kanonisk per `CLAUDE.md → Brand`)
- Mail-subject «Resultatet er klart — ${gameName}» (5 snapshot-tester låser eksakt streng)
- «Sekretariat»-stemmen i admin-flater
- Engelske achievement-navn (Turkey/Solid/Snowman — bevisste sportstermer)

## Code-switching i bruker-rettet kopi

En sentral kategori `no-nb`-skillet fanger er **engelske ord embedded i norske setninger** — typisk teknisk vokabular fra dev-context (`gender`, `preset`, `Custom`, `Achievements`, `Penalty`, `trigger`/`trigge`, `Hole-wins`, `streak`, `Best X` som mid-sentence-adjektiv). Disse er ofte usynlige i en helt-engelsk-streng-audit; må letes etter spesifikt.

Norske erstatninger: `kjønn`, `forhåndsvalg`, `Egendefinert`, `Bragder`, `Minuspoeng`, `utløse`, `Hull-seire`, `rekke`, `Beste X`.

Se [PR #175](https://github.com/jdlarssen/golf-app/pull/175) for første sweep (~22 forekomster ryddet i sideturnerings-flatene + bane-admin).

## Engelsk → norsk-konvertering

Hvis du har engelsk source-content som skal bli norsk (f.eks. dokumentasjon fra en library, kopier fra en utenlandsk app, eller framtidig engelsk-versjon per [issue #60](https://github.com/jdlarssen/golf-app/issues/60)), bruk `no-nb:no-nb`-skillet (fra `floka-marketplace`) til å oversette idiomatisk i stedet for å skrive direkte fra topp.

`no-nb` pairer med `humanizer` — oversetter intent (ikke ord-for-ord) og påfører norske konvensjoner (`3,14`, «guillemets», `du`-form aldri `De`, lowercase måneder/språk). For ren norsk komposisjon (det normale tilfellet i Tørny i dag) er `no-nb` ikke nødvendig — komponer direkte og kjør `humanizer`.

## Markdown-filer ikke skannet

Markdown-filer (`CHANGELOG.md`, `docs/email-templates.md`) skannes ikke av hooken — prosjekt-dokumentasjon inneholder legitimt eksempler på mønstrene. CHANGELOG-taglines håndteres via policyen i [`docs/changelog-conventions.md`](changelog-conventions.md), og mail-malene via manuelt `humanizer`-pass.
