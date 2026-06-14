# Kontrakt: #598 — Del leaderboard-chrome (`Shell`/`Header`) i én modul

**Issue:** [#598](https://github.com/jdlarssen/golf-app/issues/598) — Rydd format-view-duplisering + død kode
**Branch:** `claude/zealous-tesla-b15e00`
**Type:** `refactor` (behavior-preserving — ingen versjon-bump, ingen CHANGELOG)

## Scope (skåret ned fra issue per eier-instruks)

Issue #598 er bredt (Spor A dedup + Spor B død-kode + duplikat-eksporter + design-docs + test-dedup). Denne runden tar **kun det tryggeste, høyest-leverage subsettet**: rot-årsaken bak Spor A-leaderboard-klyngene — den copy-limte `Shell`/`Header`-chrome-en som ligger lokalt i ~40 filer.

### IN — det vi bygger

Trekk de delte chrome-komponentene ut i en ny co-lokalisert modul, etter mønsteret til den eksisterende `LeaderboardFooter.tsx` (samme mappe, ingen `'use client'`, `useTranslations` fra next-intl).

**`LeaderboardShell`** — én komponent med valgfri `chromeless`-prop (default `false`) erstatter **begge** lokale Shell-varianter:
- Variant `391c0b8b` (28 filer): har `chromeless`-grenen.
- Variant `c1853b6e` (12 filer: 3 matchplay-views + 9 holes-views): er *bevist identisk* med `391c0b8b` sin `chromeless=false`-gren. Disse kaller `<Shell>` uten prop → `<LeaderboardShell>` (default false) gir byte-identisk output.

**`LeaderboardHeader`** — `{ gameName, backHref }` → `SmartLink` (‹) + `Kicker` accent + spacer. Etter dypere inspeksjon folder **38 av 39** Header-kopier inn (ikke bare de 29 kanoniske): holes-view-variantene (`b05f20b0`/`8ab72d39`/`3790eb9a`) har *identisk markup* og avviker kun i hvordan back-href utledes (`/games/${gameId}`) og hvilken namespace aria-label-en hentes via (`t('common.backAriaLabel')` ≡ `tc('backAriaLabel')` i next-intl). De migreres ved å sende `backHref={`/games/${gameId}`}`. Output byte-identisk → render-tester grønne.

### OUT — bevisst utsatt (ikke i denne PR-en)

- **`State4View`s Header (`2d6d86ac`):** genuint strukturelt forskjellig — har en `onReplay`-knapp i tillegg til back-pilen. Beholder lokal Header. Eneste Header som ikke foldes inn.
- **Spor B død-kode:** `fallow` er nå npx-kjørbar (`npx fallow@2.96 dead-code` med `node_modules`) → eget oppfølgings-issue gjør det med korrekt input. Holdes tilbake (eier-instruks: «hold tilbake hvis usikkert»).
- **«Duplikat-eksporter» — droppet etter inspeksjon (ikke rene mekaniske dedups):**
  - `computeLeaderboard` i `lib/leaderboard.ts` vs `lib/scoring/index.ts` = **to forskjellige funksjoner** med ulik signatur (`opts:{}` vs `ctx:ScoringContext`), ikke en dublett.
  - `Intent` i `lib/wizard/intent.ts` (`kompis|klubb|cup|solo`) vs `lib/formats/getFormatsForIntent.ts` (`kompis|klubb|solo`) = **to forskjellige typer** (én har `cup`). Konsolidering = semantisk beslutning, ikke mekanisk.
  - `compute` i `aceyDeucey.ts` vs `ambrose.ts` = **bevisst per-modus-konvensjon** i gatet `lib/scoring/` (hver modus eksporterer `compute`). Falsk positiv.
- **`lib/scoring/`-dup** (`foursomesMatchplay`↔`greensomeMatchplay`): gatet, test-først — ikke nå.
- **Test/action-dedup** (login↔complete-profile, courses new↔edit, invite-klienter): egne områder — eget issue.
- **Format-spesifikke `PlayerRow`/`HoleRow`/`SectionBlock`:** genuint ulike data-shapes per format (Skins vs Wolf vs Nassau). Å slå dem sammen = over-abstraksjon. Ikke rør.

## Filplassering (egen beslutning, jf. eier «ingen tekniske valg til meg»)

Ny fil: `app/[locale]/games/[id]/leaderboard/LeaderboardChrome.tsx` — eksporterer `LeaderboardShell` + `LeaderboardShellProps` + `LeaderboardHeader` + `LeaderboardHeaderProps`. Co-lokalisert ved siden av `LeaderboardFooter.tsx` (presedens). Ingen `'use client'` (alle konsumenter er server-komponenter).

## Suksesskriterier

- [ ] **K1** Ny modul `LeaderboardChrome.tsx` finnes, eksporterer `LeaderboardShell` (m/ `chromeless?: boolean = false`) og `LeaderboardHeader` (`{ gameName: string; backHref: string }`). Ingen `'use client'`-direktiv. JSDoc på norsk i `LeaderboardFooter`-stil.
- [ ] **K2** Alle 40 Shell-bærende filer importerer `LeaderboardShell` og har **ingen** lokal `function Shell(`. (`grep -rl 'function Shell(' <LB>` ⇒ tom.)
- [ ] **K3** 38 av 39 Header-filer importerer `LeaderboardHeader` og har ingen lokal `function Header(`. (`grep -rl 'function Header(' <LB>` ⇒ kun `State4View.tsx`.)
- [ ] **K4** Rendret output uendret: alle 36 leaderboard-render-testene grønne **uten** `-u` (ingen snapshot-oppdatering). Hele suiten grønn.
- [ ] **K5** `npm run build` (tsc + Next) passerer rent.
- [ ] **K6** `npm run lint` rent på endrede filer.
- [ ] **K7** Atomiske `refactor(leaderboard): …`-commits, alle med `Refs #598`. Ingen versjon-bump (behavior-preserving). Ingen `--no-verify`.

## Gates (kjøres per chunk, scoped til endret)

```bash
# rask gate under bygging (scoped til leaderboard-mappa):
npx vitest run "app/[locale]/games/[id]/leaderboard"
# type-gate:
npm run build      # next build = tsc + bundling (autoritativ)
# stil:
npm run lint
# struktur-verifikasjon (K2/K3):
grep -rl 'function Shell('  "app/[locale]/games/[id]/leaderboard" || echo "OK: 0 lokale Shell"
grep -rl 'function Header(' "app/[locale]/games/[id]/leaderboard"   # skal kun liste de 10 OUT-filene
```

## Byggeplan (chunks → commit hver)

1. **Pilot:** Lag `LeaderboardChrome.tsx`. Migrér 2 pilot-filer (`SkinsView`, `WolfHolesView` — én av hver Shell-variant). Kjør scoped vitest + tsc. Commit. → beviser mønsteret for begge varianter.
2. **Views/Podiums (391c0b8b + b5261688):** migrér resten av de 28 Shell-`391c0b8b`-filene (Shell + kanonisk Header). Commit.
3. **Matchplay + holes Shell (c1853b6e):** migrér de resterende 11 filenes Shell til `<LeaderboardShell>` (behold deres lokale Header). Commit.
4. **Final gate:** hele `npm run test` + `npm run build` + `npm run lint`. Commit hvis utestående.

Den mekaniske bulk-migreringen (chunk 2–3) delegeres til én **sonnet** implementer-subagent med pilot-diffen som mal + eksakte fillister + per-chunk atomic commits (jf. CLAUDE.md modell-routing for mekanisk arbeid mot detaljert spec).

## Risiko / vaktposter

- **Over-abstraksjon:** STOPP ved `PlayerRow`/`HoleRow` — de er ikke duplikater. Kun `Shell`+`Header`.
- **Server/client:** modulen må IKKE få `'use client'`. Hvis tsc/build klager på en klient-grense, undersøk før du legger til direktiv (vil tyde på feil i en konsument, ikke i chrome-en).
- **Header-avvik:** ikke tving de 10 OUT-filene inn i `LeaderboardHeader` — output ville endret seg og K4 ryke.
- **Imports:** etter at lokale `Shell`/`Header` er borte, fjern nå-ubrukte imports (`AppShell`, `LeaderboardBackdrop`, `SmartLink`, `Kicker`) fra hver migrert fil — ellers ryker `npm run lint` (no-unused-vars). Behold dem der den lokale Header beholdes.
