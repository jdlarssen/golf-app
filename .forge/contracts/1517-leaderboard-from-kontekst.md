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

- [ ] Type A-tester for href-helperen dekker: kun `mode`, `mode+from`, `mode+return+n`,
      alle samlet, og tom/ugyldig kontekst → `npx vitest run <helper-test>` grønn.
- [ ] Staging-klikkrunde (cup-flyten): cup-resultater → matchkort → leaderboard →
      lag-drilldown → ‹ → ‹ lander på `/cup/{id}/resultater`. Bevis: URL-sjekk per steg
      (drilldown-URL og leaderboard-URL inneholder `from=`).
- [ ] Staging: trykk «Brutto» på samme leaderboard → URL har `mode=brutto` OG `from=` intakt;
      ‹ går til cup-resultatene. Toggling frem/tilbake etterlater ingen ekstra
      history-oppføringer (gestus-back fra leaderboardet går til cup-resultater, ikke til
      forrige toggle-tilstand).
- [ ] `?return=hole&n=N`-konteksten overlever drilldown-rundtur: leaderboard åpnet fra
      hull-skjermen → drilldown → ‹ → leaderboard med `return=hole&n=N` i URL, ‹ → hull N.
- [ ] `npm run build` grønn (ikke filtrert `tsc` — build-gaten).

## Gates

- [ ] `npm run build` passerer
- [ ] Co-located vitest for endrede filer passerer (`npx vitest run <endrede filers tester>`)
- [ ] `npm run lint` passerer
- [ ] Staging-verifisering av berørt flyt FØR merge + `staging-verified`-label (#1076)
- [ ] Versjon: `fix` → patch-bump + CHANGELOG-linje (bruker-synlig fix)

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
