# Kontrakt: BBB-leaderboard-polish ved 2 spillere + vokabular (#600 + #601)

**Issues:** [#600](https://github.com/jdlarssen/golf-app/issues/600) + [#601](https://github.com/jdlarssen/golf-app/issues/601)
**Branch:** `claude/pensive-lewin-00180e`
**Type:** `fix` (bruker-synlig) → PATCH-bump
**Område:** `area:leaderboard`

## Bakgrunn

To beslektede polish-funn på samme skjerm — `/games/[id]/leaderboard`, fanen **Hovedturnering** — for poeng-formater som kan spilles med nøyaktig 2 deltakere (duell → `HeadToHeadResult`-kort).

**#600 — dobbelt resultat ved 2 spillere.** Når et spill er `finished` med nøyaktig 2 spillere viser BBB-grenen både duellkortet (vinner, `28–26`, fordeling, 18-hulls-strip) OG den fulle `BingoBangoBongoView`-leaderboarden rett under, med nøyaktig samme tall. Ved 2 deltakere tilfører den fulle leaderboarden ingenting.

**#601 — to vokabular for samme tre tall.** På samme skjerm bruker `BingoBangoBongoView`-raden kryptisk «B1 10 · B2 8 · B3 10» mens duellkortet over bruker hele ord «10 bingo · 8 bango · 10 bongo». «B1/B2/B3» sier ingenting for en spiller.

## Funn fra kode-utforskning (gray-area avklart)

Duellkortet (`HeadToHeadResult`) rendres kun i `game.status === 'finished'`-grenen, og kun ved `result.players.length === 2`. Tre H2H-at-2-formater rendrer i tillegg den fulle view-en rett under kortet — **identisk redundans-mønster**:

| Format | Render-funksjon | 2p-gren | View under kortet |
|---|---|---|---|
| BBB | `renderBingoBangoBongo` (page.tsx ~L2938) | ja | `BingoBangoBongoView` ✗ |
| Nassau | `renderNassau` (page.tsx ~L2537) | ja | `NassauView` ✗ |
| Skins | `renderSkins` (page.tsx ~L2740) | ja | `SkinsView` ✗ |

**Presedens i samme fil:** Stableford (`renderStableford` ~L1256) og Solo Strokeplay (`renderSoloStrokeplay` ~L2097) rendrer ved 2 spillere **bare** duellkortet — ingen view under. Fiksen bringer BBB/Nassau/Skins i tråd med den etablerte presedensen.

**Eier-beslutning (2026-06-14):** skjul-regelen gjelder **alle tre** (BBB + Nassau + Skins). Én konsistent regel: ved nøyaktig 2 spillere viser Hovedturnering-fanen kun duellkortet.

**#601 er BBB-spesifikt** — kun BBB-leaderboarden bruker B1/B2/B3-forkortelsen. Nassau/Skins har ingen tilsvarende.

## Scope

### Inkludert
1. **#600:** I `finished` + `result.players.length === 2`-grenen til `renderBingoBangoBongo`, `renderNassau` og `renderSkins`: fjern `<XView>`-søsknet under `<HeadToHeadResult>` slik at `mainContent` ved 2 spillere rendrer **kun** duellkortet. Side-tournament-stien (`renderSideTournamentTabs` med `mainContent(true)`) og 3+-grenen (`Podium` + `View`) er uendret.
2. **#601:** I `BingoBangoBongoView` `PlayerRow` (BingoBangoBongoView.tsx ~L248–252): bytt synlig tekst fra `B1 {bingos}` / `B2 {bangos}` / `B3 {bongos}` til `{bingos} bingo` / `{bangos} bango` / `{bongos} bongo` — samme vokabular som duellkortet (page.tsx:2952). Behold `title`-tooltipsene (`firstOnGreen`/`nearestPin`/`firstInHole`).

### Ekskludert (ikke gold-plating)
- Active/scheduled-stien (standalone `XView` uten duellkort) — uendret for alle tre.
- 3+ spillere — uendret (Podium + View).
- Stableford / Solo Strokeplay — gjør allerede det riktige.
- Nassau/Skins-vokabular — ingen B1/B2/B3 der.
- Ingen nye i18n-nøkler: «bingo/bango/bongo» er ikke-oversettbare format-termer (byte-identisk no/en), hardkodet som i duellkortet.

## Designbeslutninger
- **bingo/bango/bongo hardkodes** (ikke ny i18n-nøkkel): duellkortet (page.tsx:2952) hardkoder dem allerede; ordene er identiske i begge språk. `title`-tooltipsene beholder de eksisterende `bingoBangoBongo.*`-nøklene.
- **2p = kun duellkort** matcher Stableford/Strokeplay-presedensen — ingen ny UX, kun konsistens.

## Akseptkriterier

- [ ] **#600-BBB:** `finished` + nøyaktig 2 spillere → `mainContent` rendrer kun `<HeadToHeadResult>`; ingen `<BingoBangoBongoView>` under. (file:line i page.tsx)
- [ ] **#600-Nassau:** samme — `<NassauView>` fjernet fra 2p-grenen.
- [ ] **#600-Skins:** samme — `<SkinsView>` fjernet fra 2p-grenen.
- [ ] **#600-uendret:** 3+ spillere rendrer fortsatt `Podium` + `View`; active/scheduled standalone `View` uendret; side-tournament-stien (`mainContent(true)`) kompilerer og rendrer kortet alene ved 2p.
- [ ] **#601:** BBB-leaderboard-raden viser synlig «{n} bingo · {n} bango · {n} bongo» (ikke B1/B2/B3); `title`-tooltips beholdt.
- [ ] **Tester:** eksisterende view-tester (BingoBangoBongoView/NassauView/SkinsView) grønne; ingen nye render-tester lagt til (copy/komposisjons-endring, ikke ny ren logikk).
- [ ] **Versjon:** `package.json` PATCH-bumpet + CHANGELOG-oppføring i samme commit som fiksen.

## Gates (kjør scoped til det som endres)

```bash
npx tsc --noEmit
npx vitest run "app/[locale]/games/[id]/leaderboard/BingoBangoBongoView.test.tsx" \
  "app/[locale]/games/[id]/leaderboard/NassauView.test.tsx" \
  "app/[locale]/games/[id]/leaderboard/SkinsView.test.tsx" \
  "app/[locale]/games/[id]/leaderboard/HeadToHeadResult.test.tsx"
npm run build   # fanger exhaustive-switch / Vercel-build-feil i den store page.tsx
```

## Disiplin-noter (CLAUDE.md)
- Atomiske commits, `Refs #600 #601` i body; `Closes #600` + `Closes #601` (separate linjer) i PR-body.
- Bruker-synlig fix → PATCH-bump + CHANGELOG i samme commit (hooken blokkerer ellers).
- Norsk copy uendret (vokabular = format-termer); ingen humanizer-behov, ingen no-nb (ingen ny oversettelse).
- Post denne kontrakten som kommentar på BEGGE issues.
