# Forge-kontrakt: #622 — «roster» anglisme → norsk i UI-copy

**Issue:** [#622](https://github.com/jdlarssen/golf-app/issues/622)
**Branch:** `claude/upbeat-mclean-ede6ce`
**Type:** `fix(i18n)` — bruker-synlig copy-endring → PATCH-bump
**Eier-beslutning (avklart 2026-06-14):** Bytt «roster» → norsk «spillerliste» i all norsk bruker-rettet copy. Behold ikke som lånord.

## Bakgrunn

Funnet under #614 (copy-kvalitet). Det engelske ordet «roster» brukes i norske string-VERDIER, bøyd som lånord («rosteren», «Lag-roster»). #614 lot det stå bevisst fordi en omdøping er en egen term-beslutning. Eier har nå besluttet: bytt til norsk.

«match» beholdes som naturalisert lånord (innarbeidet i norsk sport), men «roster» er ikke innarbeidet på norsk → byttes.

## Term-beslutning (gråsone — avklart)

- **Valgt term:** `spillerliste`, hankjønn, bestemt form `-en` (`spillerlisten`).
- **Hvorfor ikke `lista`:** Eksisterende copy bruker allerede `«spillerlisten»` (no.json linje 970 + 2557, nøkkel `db_roster`). Å innføre `spillerlista` (hunkjønn) ville gi form-inkonsistens — en kjent AI-tell som humanizer fanger. Konsistens med eksisterende term vinner.
- **Preposisjon:** «lagt til **på** rosteren» → «lagt til **i** spillerlisten» (man legges til *i* en liste, ikke *på* — idiomatisk forbedring).

## Scope — eksakt (kun string-VERDIER, aldri nøkler)

Kun de 7 VERDIENE i `messages/no.json` som inneholder selve ordet endres. JSON-NØKLER (`rosterSection`, `rosterHeading`, `db_roster`, `rosterEntry`, `emptyRoster`, `rosterSearch*` osv.) er kode-identifikatorer → urørt. `en.json` er korrekt engelsk → urørt. Kode-identifikatorer (`CreatorRosterClient`, `NewGameFormData.roster`) → urørt (ikke bruker-synlige).

| # | Linje | Nøkkel | Før | Etter |
|---|-------|--------|-----|-------|
| 1 | 2614 | `notifications…invite_added` | `✓ Spilleren er lagt til på rosteren.` | `✓ Spilleren er lagt til i spillerlisten.` |
| 2 | 2706 | `…allOnRoster` | `Alle registrerte spillere er allerede på rosteren.` | `Alle registrerte spillere er allerede i spillerlisten.` |
| 3 | 2836 | `…approved` | `✓ Påmeldingen er godkjent. Spilleren er lagt til rosteren.` | `✓ Påmeldingen er godkjent. Spilleren er lagt til i spillerlisten.` |
| 4 | 2844 | `…db_players` | `Klarte ikke å legge spilleren til rosteren. Prøv igjen.` | `Klarte ikke å legge spilleren til i spillerlisten. Prøv igjen.` |
| 5 | 3769 | `cup.manage.rosterHeading` | `Lag-roster` | `Spillerliste` |
| 6 | 3771 | `cup.manage.emptyRoster` | `Ingen spillere. Rosteren fylles fra matchene.` | `Ingen spillere. Spillerlisten fylles fra matchene.` |
| 7 | 3867 | `cup.delete.rosterEntry` | `Lag-roster og master-leaderboard` | `Spillerliste og master-leaderboard` |

**Merknad:** Issue nevnte 6 (2614/2706/2836/2844 + 3769/3867). Jeg fant i tillegg #6 (`emptyRoster`, linje 3771) som har ordet i verdien. Inkludert.

**Bevisst utenfor scope:** `Lag-` prefiks droppes på rad 5/7 — `«Spillerliste»` (ikke `«Lag-spillerliste»`, som er klønete). Lag-grupperingen vises i selve innholdet (CupManagement viser team-navn), så overskriften trenger ikke ordet «lag». `master-leaderboard` (engelsk-aktig) er ikke «roster» → urørt.

## Success-kriterier

- [ ] **K1:** Alle 7 verdiene i tabellen over er endret i `messages/no.json`, eksakt som spesifisert.
- [ ] **K2:** Ingen string-VERDI i `messages/no.json` inneholder lenger ordet «roster»/«rosteren» (case-insensitivt). Nøkler kan fortsatt inneholde det.
- [ ] **K3:** `en.json` er uendret (git diff viser ingen endring i en.json).
- [ ] **K4:** JSON-nøkler i `no.json` er uendret (samme nøkkel-sett som før → catalogParity grønn).
- [ ] **K5:** Term-konsistens: kun `spillerliste`/`spillerlisten` (hankjønn), ingen `spillerlista`/`spillerliste`-hunkjønn introdusert.
- [ ] **K6:** humanizer-skill kjørt på de 7 nye strengene; ingen nye AI-tells.
- [ ] **K7:** Versjon bumpet PATCH (1.129.6 → 1.129.7) + CHANGELOG-oppføring i samme commit.

## Gates (scoped til endringen)

```bash
# G1 — JSON-validitet
node -e "JSON.parse(require('fs').readFileSync('messages/no.json','utf8')); console.log('no.json valid')"

# G2 — catalog parity (nøkkel-paritet no↔en)
npx vitest run messages/catalogParity.test.ts

# G3 — ingen 'roster'-ord igjen i no.json VERDIER (kun nøkler tillatt)
#   (grep på verdi-siden av "key": "value")
grep -nE ':\s*"[^"]*[Rr]oster' messages/no.json || echo "OK: no roster in values"

# G4 — typecheck (nøkler uendret → grønn)
npx tsc --noEmit
```

**Test-disiplin:** Dette er en ren copy-endring. Per CLAUDE.md: ingen nye tester. Ingen snapshot asserter disse verdiene (verifisert), så ingen `vitest -u` nødvendig. catalogParity holder fordi nøkler er uendret.

## Commit-plan

Én atomic commit (7 strenger, ett logisk fokus):
```
fix(i18n): replace «roster» anglicism with «spillerliste» in Norwegian UI

Refs #622
```
+ package.json 1.129.7 + CHANGELOG.md (nests under åpen tema-serie per changelog-conventions).

## Out of scope (ikke gjør)

- Endre JSON-nøkler eller kode-identifikatorer.
- Røre `en.json`.
- Endre `master-leaderboard` eller andre engelsk-aktige termer (egne issues hvis aktuelt).
- Legge til/endre tester.
- Oppdatere test-kommentarer som nevner «rosteren» (dev-facing, ikke bruker-synlig).
