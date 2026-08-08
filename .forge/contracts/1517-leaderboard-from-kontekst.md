# Spec: Leaderboard-interne lenker mister `?from=`-tilbakekonteksten (#1517)

## Problem

Tilbake-pilene i leaderboard-universet er hierarkiske lenker styrt av `?from=`-parameteren
(bevisst valg, #117 — referrer-heuristikk er upålitelig i iOS PWA). Inngangspunktene sender
konteksten riktig inn, men alle interne lenker i leaderboardet (lag-drilldown, tilbake-chevron
fra drilldown, lag-pager, Netto/Brutto-toggle) bygger URL-er uten å ta `from` med videre.
Etter ett internt klikk faller serveren tilbake til `defaultBackHref = /games/{gid}` — brukeren
sendes til spillsiden i stedet for dit de kom fra. Eier-rapportert 2026-08-07 fra cup-flyten,
men fem inngangspunkter rammes: cup-resultater, cup-hjem, admin-cup, historikk og Hjem
(`grep "leaderboard?from="`). I tillegg pusher Netto/Brutto-lenkene history-oppføringer, så
gestus-/hardware-back må gjennom alle toggle-tilstander.

Søsken-mønster: `?return=hole&n=N`-konteksten (tilbake-til-hull) droppes i drilldowns på
samme måte — `leaderboardContent.tsx:530` har allerede `void returnQuery; // reserved for
future drilldown forwarding (no-op today)`.

## Research Findings

- Next 16 bundled docs (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`
  §replace): `replace={true}` erstatter gjeldende history-oppføring i stedet for å pushe.
  `SmartLink` sprer `...rest` videre til `Link`, så `replace` går rett gjennom uten endring.
- `?from=` valideres server-side per request (`validateFromParam`,
  `app/[locale]/games/[id]/leaderboard/page.tsx:40-61`, allowlist av rute-prefikser) — å
  videresende parameteren fra klient-lenker er trygt; valideringen skjer uansett på nytt.

## Prior Decisions

- **#117:** eksplisitt `?from=` framfor referrer/history-heuristikk — lenkebasert tilbake
  beholdes, IKKE `history.back()`.
- **#1456/#1468 (kontrakt 1468-cup-resultatside):** cup-matchkort lenker hele cup-publikummet
  til kamp-leaderboardet med `?from=` — det er disse lenkene som nå skal overleve intern
  navigasjon.
- **Eier 2026-08-07 (denne kontrakten):** Netto/Brutto-knappen BEHOLDES på cup-kamper
  (alternativ A). Ingen cup-forgrening i delt leaderboard-chrome.

## Design

Tré tilbake-konteksten gjennom alle leaderboard-interne lenker:

1. **Én href-helper, ett hjem** (ren funksjon, Type A-testet): bygger leaderboard-interne
   URL-er (leaderboard-rot og `holes`-drilldown) og tar alltid med kontekst-parametrene
   `from`, `return`, `n` når de finnes, pluss `mode`/`team` som i dag. Plassering og signatur
   er builder-skjønn (naturlig kandidat: ved `lib/leaderboard/` eller co-located i
   leaderboard-mappa).
2. **Rørlegging:** `page.tsx` (leaderboard) og `holes/page.tsx` sender konteksten ned via
   `renderLeaderboardContent` / drilldown-props til visningene — rørleggingen
   `void returnQuery`-kommentaren allerede reserverer. Prop-form er builder-skjønn.
3. **Berørte lenker** (stier relative til `app/[locale]/games/[id]/leaderboard/`):
   - `State4View.tsx:295` — `ModeChip` (Netto/Brutto)
   - `State4View.tsx:330` og `:444` — drilldown-lenker (`holes?team=…&mode=…`)
   - `holes/formats/drilldown.tsx:214` — tilbake-chevron, `:577` — lag-pager, `:112` —
     tom-drilldown-redirect
   - `formats/state3.tsx:126-166` — `ModeToggle` i state 3.5 (aktivt spill, samme mønster)
4. **Netto/Brutto får `replace`:** `ModeChip` (state 4) og `ModeToggle` (state 3.5) rendres
   med `<SmartLink replace …>` så toggling bytter URL uten å stable history.

Ingen endring i tilbake-modellen (fortsatt eksplisitte `backHref`-lenker), ingen endring hos
avsenderne (`?from=`-lenkene fra cup/historikk/Hjem står som de er).

## Edge Cases & Guardrails

- `from` fraværende eller ugyldig → dagens fallback (`defaultBackHref`) uendret. Helperen
  skal aldri produsere `from=`-tomstreng.
- Kombinasjonen `from` + `return=hole&n=N` + `mode` + `team` må overleve samlet — `from`
  vinner over `return` i back-target (dagens serverlogikk, uendret).
- `from`-verdier inneholder `/` (f.eks. `/cup/{id}/resultater`) — behold dagens ukodede form
  konsistent med avsenderne, eller URL-encode konsekvent i helperen; ikke bland.
- Ikke-deltakere (cup-publikum) uten `from`: default back er `/` (#752) — uendret.
- E2E/staging-verifisering: bruk `data-testid`/rolle, aldri norsk copy (D-regelen).

## Key Decisions

- **Brutto-knappen beholdes overalt** — eier valgte A i kontraktsøkten; skjuling på cup var
  alternativ B (ombyggingskostnad liten: én synlighetsbetingelse).
- **Lenkebasert tilbake beholdes** (#117) — ingen `history.back()`.
- **Netto/Brutto = `replace`** — toggling skal ikke legge igjen history-oppføringer.

**Claude's Discretion:**

- Helper-plassering, signatur og prop-form for kontekst-trådingen.
- Testplassering (co-located `.test.ts` ved helperen).
- Om `holes/page.tsx` sin `RevealHiddenView`-backHref (`:185`) også skal tres — gjør det hvis
  det faller naturlig ut av samme rørlegging.

## Success Criteria

- [x] Type A-tester for href-helperen dekker: kun `mode`, `mode+from`, `mode+return+n`,
      alle samlet, og tom/ugyldig kontekst → `npx vitest run <helper-test>` grønn.
      **Bevis:** `lib/leaderboard/navContext.test.ts` — `npx vitest run
      lib/leaderboard/navContext.test.ts` → «Test Files 1 passed (1) / Tests 38 passed (38)».
      Dekker i tillegg injeksjons-casen (`from` med `&`/`=` → prosentkodet) og en
      round-trip gjennom `parseLeaderboardNavContext`.
- [x] Staging-klikkrunde (cup-flyten): cup-resultater → matchkort → leaderboard →
      lag-drilldown → ‹ → ‹ lander på `/cup/{id}/resultater`. Bevis: URL-sjekk per steg
      (drilldown-URL og leaderboard-URL inneholder `from=`).
      **Bevis** (cup `RyderTest2`, spill «Best ball 1» `7388d4ac…`, staging-ref
      `snwmueecmfqqdurxedxv`):
      - K2.1 matchkort → `…/leaderboard?from=/cup/4c8e0aba…/resultater`
      - K2.2 lag-lenka → `…/leaderboard/holes?team=1&mode=netto&from=%2Fcup%2F4c8e0aba…%2Fresultater`
      - K2.3 drilldown-URL bærer `from=`
      - K2.4 ‹ → `…/leaderboard?mode=netto&from=%2Fcup%2F…%2Fresultater`
      - K2.5 ‹ → `http://localhost:3000/cup/4c8e0aba…/resultater` ← selve bug-rapporten
- [x] Staging: trykk «Brutto» på samme leaderboard → URL har `mode=brutto` OG `from=` intakt;
      ‹ går til cup-resultatene. Toggling frem/tilbake etterlater ingen ekstra
      history-oppføringer (gestus-back fra leaderboardet går til cup-resultater, ikke til
      forrige toggle-tilstand).
      **Bevis:** K3.1 lenka bærer `mode=brutto&from=…`; K3.2 URL-en likeså; K3.3
      `history.length 10 → 10` etter to toggles (`replace`); K3.4 gestus-back →
      `/cup/4c8e0aba…/resultater`; K3.5 ‹ fra brutto-visningen → samme.
- [x] `?return=hole&n=N`-konteksten overlever drilldown-rundtur: leaderboard åpnet fra
      hull-skjermen → drilldown → ‹ → leaderboard med `return=hole&n=N` i URL, ‹ → hull N.
      **Bevis:** K4.1 `…/holes?team=1&mode=netto&return=hole&n=7`; K4.2 ‹ →
      `…/leaderboard?mode=netto&return=hole&n=7`; K4.3 ‹ → `…/games/7388d4ac…/holes/7`.
- [x] `npm run build` grønn (ikke filtrert `tsc` — build-gaten).
      **Bevis:** `set -o pipefail && npm run build` → rute-tabell + `EXIT=0`.

## Gates

- [x] `npm run build` passerer — `EXIT=0`.
- [x] Co-located vitest for endrede filer passerer. Ingen av de endrede
      `app/**`-filene har `*.test.*`-søsken (glob-sjekket); kjørte hele suiten i stedet:
      `npx vitest run` → «Test Files 449 passed (449) / Tests 5759 passed (5759)».
- [x] `npm run lint` passerer — «✖ 55 problems (0 errors, 55 warnings)», alle warnings
      pre-eksisterende (complexity/max-depth i `lib/scoring`, `lib/wizard`, `lib/notifications`).
- [x] Staging-verifisering av berørt flyt FØR merge + `staging-verified`-label (#1076) —
      14/14 steg PASS, prod-vakt: ingen Supabase-kall utenom staging-ref.
- [x] Versjon: `fix` → patch-bump + CHANGELOG-linje (bruker-synlig fix) — `1.229.0` →
      `1.229.1`, én linje under august-skuffen i `CHANGELOG.md`.

## Files Likely Touched

Relative til `app/[locale]/games/[id]/leaderboard/`:

- `page.tsx` — send `from`/`return`-kontekst inn i `renderLeaderboardContent`
- `leaderboardContent.tsx` — erstatt `void returnQuery`-no-op-en med reell tråding til visningene
- `State4View.tsx` — `ModeChip` + drilldown-hrefs via helper; `replace` på `ModeChip`
- `formats/state3.tsx` — `ModeToggle`-hrefs via helper + `replace`
- `holes/page.tsx` + `holes/formats/drilldown.tsx` — tilbake-chevron, lag-pager,
  tom-redirect via helper
- Ny helper + test (plassering builder-skjønn)
- `package.json` + `CHANGELOG.md` — patch-bump + Feilrettinger-linje

## Out of Scope

- Skjule Brutto-knappen på cup-kamper (alternativ B — eier valgte A; liten ombygging om det
  gjenåpnes senere).
- Bytte tilbake-modell til `history.back()` (#117-beslutningen står).
- Endringer hos `?from=`-avsenderne (cup-/historikk-/Hjem-sidene) — de virker i dag.
- `?fra=`-parameteren på revansje-flyten (annet navn, annen mekanisme).
