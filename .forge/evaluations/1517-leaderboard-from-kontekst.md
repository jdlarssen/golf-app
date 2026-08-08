# Evaluering: #1517 — 2026-08-08

## Verdict: ACCEPT

Alt jeg kunne verifisere selv holder. Jeg gjenkjørte alle porter, leste hele diffen,
grep-et repoet for gjenværende håndbygde leaderboard-URL-er, og kjørte min egen
Playwright-runde mot staging med strengere assertions enn byggerens (22/22 PASS,
inkludert fire sikkerhetssjekker byggeren ikke gjorde). Funnene under er alle
utenfor kontraktens scope eller kosmetiske.

## Kriterie-for-kriterie

| # | Kriterium / port | Verdikt | Mitt bevis |
|---|---|---|---|
| SK1 | Type A-tester for href-helperen (kun `mode`, `mode+from`, `mode+return+n`, alt samlet, tom/ugyldig) | **PASS** | `npx vitest run lib/leaderboard/navContext.test.ts` → «Test Files 1 passed (1) / Tests 38 passed (38)». Lest testfila selv: `lib/leaderboard/navContext.test.ts:106-165` dekker de fem casene eksplisitt, pluss injeksjon (`:155`) og round-trip (`:195`). Assertions er `toBe` på hele URL-strengen — ikke selvoppfyllende. |
| SK2 | Staging-klikkrunde cup: resultater → matchkort → leaderboard → drilldown → ‹ → ‹ lander på `/cup/{id}/resultater` | **PASS** | Egen driver mot staging (`snwmueecmfqqdurxedxv`), cup `4c8e0aba…`, spill `7388d4ac…`:<br>K2.1 `…/leaderboard?from=/cup/4c8e0aba…/resultater`<br>K2.2 lag-lenke `…/holes?team=1&mode=netto&from=%2Fcup%2F4c8e0aba…%2Fresultater`<br>K2.3 drilldown-URL bærer `from=`<br>K2.4 ‹ → `…/leaderboard?mode=netto&from=%2Fcup%2F…`<br>K2.5 ‹ → `http://localhost:3000/cup/4c8e0aba…/resultater` ← selve bug-rapporten |
| SK3 | Brutto-toggle: `mode=brutto` + `from=` intakt, ‹ → cup-resultater, ingen ekstra history | **PASS** | K3.1 `…/leaderboard?mode=brutto&from=%2Fcup%2F…` · K3.2 URL-en likeså · K3.3 `history.length 10 → 10` etter to toggles (målt med `page.evaluate(() => history.length)` FØR og ETTER, altså reell måling) · K3.4 `page.goBack()` → `/cup/4c8e0aba…/resultater` |
| SK4 | `?return=hole&n=N` overlever drilldown-rundturen | **PASS** | K4.1 `…/holes?team=1&mode=netto&return=hole&n=7` · K4.2 ‹ → `…/leaderboard?mode=netto&return=hole&n=7` · K4.3 ‹ → `…/games/7388d4ac…/holes/7` |
| SK5 | `npm run build` grønn (ufiltrert) | **PASS** | `set -o pipefail && npm run build` → full rutetabell, `BUILD_EXIT=0`, `grep -iE "error\|Failed to compile"` på loggen → tom. |
| G1 | `npm run build` passerer | **PASS** | Som SK5. |
| G2 | Co-located vitest for endrede filer | **PASS** | Kjørte hele suiten: `npx vitest run` → «Test Files 449 passed (449) / Tests 5759 passed (5759)», 141 s. Ingen av `app/**`-filene i diffen har `*.test.*`-søsken (bekreftet). |
| G3 | `npm run lint` passerer | **PASS** | «✖ 55 problems (0 errors, 55 warnings)». Alle 55 er `complexity`/`max-depth` i `lib/scoring`, `lib/wizard`, `lib/notifications` — ingen i de endrede filene. 0 errors. |
| G4 | Staging-verifisering av berørt flyt FØR merge + `staging-verified`-label | **DELVIS** | Flyten er verifisert (SK2–SK4, mine egne kjøringer). Label/PR-bevis kan ikke settes: `gh pr list --head claude/forge-auto-1517-281d34` → `[]` (ingen PR ennå). Porten forfaller ved PR-opprettelse, ikke her. |
| G5 | `fix` → patch-bump + CHANGELOG-linje | **PASS** | `package.json` `1.229.0` → `1.229.1` (patch, riktig for `fix`). `CHANGELOG.md`: én linje under august-skuffen, teller bumpet 28 → 29, format matcher `docs/changelog-conventions.md` («versjon i backticks · issue-lenke — én setning om forbedret tilstand»). Ingen AI-tells i copyen. |

### Egne kontroller ut over kontrakten

| Sjekk | Verdikt | Bevis |
|---|---|---|
| E1 lag-pager i drilldown bærer `from=` (kontraktens `drilldown.tsx:577`) | **PASS** | Begge pager-lenkene: `…/holes?team=1&mode=netto&from=%2Fcup%2F…` og `…team=2…&from=%2Fcup%2F…` |
| E2 drilldown-chevronens href er leaderboard **med** `from=` | **PASS** | `/games/7388d4ac…/leaderboard?mode=netto&from=%2Fcup%2F4c8e0aba…%2Fresultater` |
| E0 «header:visible a first()» er faktisk tilbake-pila (byggerens locator kunne truffet eksport-lenka) | **PASS** | `aria-label="Tilbake"`, tekst `‹`. `ExportLink` (`State4View.tsx:207`) ligger utenfor `<header>` — locatoren er sunn. |
| S1 param-injeksjon: `from` med `&mode=brutto` lekker ikke som egen param | **PASS** | Drilldown-lenka: `mode`-verdier `["netto"]`, `from="/cup/…/resultater&mode=brutto"` (én verdi). `URLSearchParams` eier kodingen (`navContext.ts:112-122`). |
| S2 open-redirect: `//evil.example.com`, `https://evil.example.com/x`, `/evil/abc` | **PASS** | Alle tre → back-href `= /games/7388d4ac…` (fallback), og drilldown-lenka har ingen `from=` i det hele tatt. Validering skjer per request i både `page.tsx:52` og `holes/page.tsx:47`. |
| S3 dot-segment-traversal `/games/x/../..//evil.example.com` | **PASS** | Nettleser-resolusjon: `origin=http://localhost:3000`. Ingen origin-hopp. |
| `ModeToggle`-`basePath`-fjerning brøt ingen kaller | **PASS** | `grep -rn "ModeToggle" app components` → én definisjon (`formats/state3.tsx:130`) + ett kall (`:333`, oppdatert). `grep -rn "basePath" app components` → tomt. |
| `renderLeaderboardContent`-signaturendring (`returnQuery` → valgfri `navContext`) | **PASS** | `grep -rn "returnQuery"` over hele repoet → tomt. Spectate (`spectate/[token]/page.tsx`) og embed (`embed/spill/[token]/page.tsx`) droppet `returnQuery: ''` og sender ingen `navContext` → faller på `EMPTY_NAV_CONTEXT` (`leaderboardContent.tsx:121`). Samme URL-form som før for disse rutene. `npm run build` ville uansett tatt en manglende påkrevd prop. |
| Ingen gjenværende håndbygde leaderboard-interne URL-er | **PASS** | `grep -rn "href=" app/[locale]/games/[id]/leaderboard --include='*.tsx'` → alle interne lenker går via `leaderboardHref`/`drilldownHref` (`State4View.tsx:315,434,483`, `state3.tsx:155`, `drilldown.tsx:225,592`, redirect `drilldown.tsx:119`). Resten er `backHref`-props, eksport-lenka og CTA-er ut av leaderboard-universet. Treff på `?from=` utenfor er avsendersidene (cup, historikk, Hjem, admin-cup), som kontrakten eksplisitt holder utenfor scope. |
| Out-of-scope-brudd | **INGEN** | Diffen rører 10 filer + helper/test + versjon/CHANGELOG. `RevealHiddenView`-backHref-en i `holes/page.tsx:195` er eksplisitt tillatt under «Claude's Discretion». Brutto-knappen er ikke skjult noe sted (alternativ A står). Ingen `history.back()`. Ingen endringer hos avsenderne. |

## Funn

1. **nit — kodings-inkonsistens mellom avsendere og interne lenker.**
   `lib/leaderboard/navContext.ts:116` bruker `URLSearchParams.set`, som prosentkoder
   `/` → `%2F`. Avsenderne skriver ukodet (`app/[locale]/cup/[id]/resultater/page.tsx:239`:
   `?from=/cup/${id}/resultater`). Kontraktens edge-case sier «ikke bland». I praksis er
   dette ufarlig — begge dekodes identisk server-side, og jeg bekreftet at hele kjeden
   virker (SK2). Men URL-en skifter form etter første interne klikk. Å velge `URLSearchParams`
   er dessuten det tryggeste valget (S1/S2/S3 hviler på det), så jeg anbefaler å la det stå
   og heller la avsenderne kode konsekvent om noen rører dem.

2. **bør fikses (eget issue, ikke denne PR-en) — solo-formatenes «Hull for hull» har
   fortsatt hardkodet tilbake-mål.** Ni per-format-visninger sender
   `backHref={`/games/${gameId}`}`: `holes/SkinsHolesView.tsx:55`,
   `holes/WolfHolesView.tsx:60`, `holes/NinesHolesView.tsx:61`,
   `holes/RoundRobinHolesView.tsx:75`, `holes/AceyDeuceyHolesView.tsx:60`,
   `holes/BingoBangoBongoHolesView.tsx:62`, `holes/NassauHolesView.tsx:59`,
   `holes/SoloStrokeplayHolesView.tsx:59`, `holes/SoloStablefordHolesView.tsx:67`.
   `holes/page.tsx:109-186` sender ikke `navContext` inn i disse grenene.
   **Hvorfor det ikke er en blocker:** kontrakten lister uttømmende hvilke lenker som er
   berørt, og disse er ikke blant dem. De pekte heller aldri på leaderboardet — de er kun
   nåbare fra spill-hjem (`app/[locale]/games/[id]/(home)/page.tsx:1258`), ingen
   leaderboard-visning for solo-format lenker til drilldown (grep-bekreftet). Ingen
   `from=` finnes i den flyten i dag. Reell effekt: null. Men regelen «all kontekst tres
   gjennom» dekker ikke disse ennå.

3. **nit — `/games/{id}/putter` mister konteksten.**
   `app/[locale]/games/[id]/putter/page.tsx:54` og `:106` bygger
   `/games/${id}/leaderboard` for hånd. Ikke en leaderboard-intern lenke i kontraktens
   forstand (egen rute), og ikke nevnt i issuet. Kandidat for samme opprydding som funn 2.

4. **nit — `drilldown.tsx:119` (tom-drilldown-redirect) er bare kode-verifisert.**
   Den bruker helperen riktig, men jeg fant ingen staging-data som utløser grenen
   (drilldown uten lag), så den er ikke kjørt i nettleser.

## Det jeg ikke kunne verifisere

- **State 3.5-toggelen (`formats/state3.tsx:130-168`) i nettleser.** Jeg søkte opp alle
  aktive spill på staging (`status=eq.active` via read-only REST: stableford ×2,
  greensome-matchplay, singles-matchplay ×2) og drev leaderboardet deres med
  `?from=/profile/historikk`. Ingen av dem rendrer state 3.5 — `a[role=tab]` var tom på
  alle tre jeg testet (`tabs=[]`), tilbake-pila pekte riktig (`/profile/historikk`).
  Kodestien er lest og henger sammen (`leaderboardContent.tsx:515-524` sender `navContext`
  → `renderState35` → `ModeToggle`), og den bruker nøyaktig samme testede helper som
  state 4-chippen jeg beviste i nettleser. Men `replace`-atferden og `from=`-videreføringen
  i state 3.5 er ikke observert live.
- **E2E-suiten (`@gate` mot staging).** Ikke kjørt — den hører til CI/PR-porten, og
  oppgaven ba om read-only-sjekker uten å starte/stoppe servere. `grep` i `e2e/` fant
  ingen assertions på modus-toggel eller `?from=`, så jeg forventer ingen drift der.
- **`staging-verified`-labelen (#1076).** Ingen PR eksisterer ennå
  (`gh pr list --head claude/forge-auto-1517-281d34` → `[]`), så label-porten er
  ikke anvendelig på dette tidspunktet.
- **iOS PWA-oppførselen.** Hele `?from=`-modellen finnes fordi iOS PWA-shellen oppfører
  seg annerledes (#117). Jeg testet i headless Chromium på macOS. `replace`-semantikken
  antas lik, men er ikke prøvd på iPhone.
