# Kontrakt: Vercel-funksjonene flyttes til Stockholm (arn1)

**Issue:** [#1815](https://github.com/jdlarssen/golf-app/issues/1815)
**Type:** perf (konfigurasjon, én linje), lav blast-radius, ingen produktvalg
**Berører:** `vercel.json` (+ én linje i `CLAUDE.md` «Hosting», + `.changes/`-notat)
**Branch:** `claude/webapp-page-switch-perf-fe688e`
**Versjon:** `perf`-commit → notatfil under `.changes/` (aldri bump/CHANGELOG, jf. #1562)

## Problem

Hvert sidebytte i webappen føles som en sidelasting: skallet kommer raskt, men
innholdet lar vente på seg i 0,7–0,9 s. Målt 2026-09-02 mot staging i
prod-servermodus (Chromium, 390×844, touch), tap → innhold synlig:

| Sidebytte | Skjelett (ms) | Innhold (ms) |
|---|---|---|
| Hjem → hull 1 (første gang) | 230–350 | 715–1020 |
| Hull 1 → leaderboard | 150–460 | 775–940 |
| Hull 1 → spillside (første gang) | 300–580 | 790–1130 |
| Spillside → hull 1 (andre gang) | 55 | 845–870 |
| Tilbake-knapp leaderboard → hull 1 | 5 | 15 |

Med simulert 4G (80 ms RTT, 10 Mbit) og 4× CPU-throttling ble tallene nesten
identiske → verken JS-størrelse (First-Load-JS rå: hjem 363 KB, spillside 500,
hull 537, leaderboard 595) eller nettet til telefonen er flaskehalsen. RSC-
navigasjonsrequesten svarer på 86–176 ms (skallet), og deretter bruker serveren
~700 ms på 3–7 sekvensielle databaserunder før innholdet strømmer.

Rotårsaken til at hver runde er dyr: **Vercel kjører app-funksjonene i
Washington (`iad1`), mens Supabase (prod OG staging) står i Stockholm
(`eu-north-1`).** Bekreftet 2026-09-02 via Vercel MCP `get_deployment` på
produksjons-deployen (`tornygolf.no` → `"regions": ["iad1"]`) og Supabase MCP
`get_project` (`region: eu-north-1` for både `glofubopddkjhymcbaph` og
`snwmueecmfqqdurxedxv`). `vercel.json` har ingen `regions`-nøkkel, så `iad1` er
Vercels standardverdi — ikke et bevisst valg. Hver server→DB-runde koster dermed
~100 ms tur-retur over Atlanteren; i Stockholm koster den noen få ms.

Hva grepet IKKE løser: tallene over er målt fra en Mac i Norge mot Stockholm
(~100 ms per runde), altså omtrent samme geografi som `iad1`→Stockholm. Antall
sekvensielle runder per side er uendret av dette grepet; det er prisen per runde
som faller. Anslag: 0,3–0,6 s kortere ventetid per sidebytte i prod.

## Research

- **Vercel-docs (`/docs/functions/configuring-functions/region`, lest 2026-09-02
  via Vercel MCP):** `"regions": ["<id>"]` øverst i `vercel.json` setter standard
  kjøreregion for ALLE funksjoner i prosjektet. `functionFailoverRegions` og
  flere primærregioner er Pro/Enterprise — brukes ikke. Region-ID for Stockholm
  er `arn1`.
- **Prosjektet er Hobby-tier.** Docs-utdraget sier ikke eksplisitt om Hobby kan
  velge én region. ASSUMPTION: Hobby kan velge én primærregion (fler-region er
  Pro-funksjonen). K2 under er den empiriske testen; feiler den, se «Fallback».
- **Ingen kodefiler er berørt.** `proxy.ts` (Routing Middleware) kjører på Vercels
  edge-nett uavhengig av funksjonsregion — røres ikke. `next.config.ts` har ingen
  region-innstilling og trenger ingen (`cacheComponents` forbyr `runtime`-
  eksporter per side, og `preferredRegion` er unødvendig når prosjektnivået er
  satt).
- **Data Cache / `unstable_cache`** (`lib/games/getGameWithPlayers.ts`) følger
  funksjonsregionen automatisk — ingen endring.
- **Cron-jobben** (`/api/cron/product-update-digest`, `vercel.json` `crons`) kjører
  også i den nye regionen. Ufarlig; den snakker med samme Supabase.

## Tidligere beslutninger

- #502-kontrakten: «`vercel.json` røres IKKE» gjaldt cron-frekvens (Hobby = 1×/dag).
  Ikke i konflikt — `crons`-blokka beholdes uendret.
- #1277-kontrakten: www→apex-redirecten bor i Vercel-dashbordet, ikke i
  `vercel.json`. Ikke berørt.
- #797-læringen: bundle-splitting via `next/dynamic` senker ikke First-Load-JS
  under Turbopack. Skal ikke forsøkes igjen (og målingene over viser at JS ikke er
  flaskehalsen uansett).
- #1815 eier-krymp 2026-08-30 + eiervalg 2026-09-02: KUN dette grepet bygges.
  Router-cache-tuning (`experimental.staleTimes`) og View Transitions er parkert —
  native-appen (#1816) løser det.

## Design

1. **`vercel.json`:** legg til `"regions": ["arn1"]` som toppnivå-nøkkel ved siden
   av `$schema` og `crons`. Ingenting annet endres i fila. JSON tillater ikke
   kommentarer — begrunnelsen bor i commit-meldingen og i CLAUDE.md-linja under.
2. **`CLAUDE.md` «Hosting»-linja** (linje 10) utvides til:
   `**Hosting:** Vercel (Hobby tier) — funksjonene kjører i Stockholm (`arn1`, satt i `vercel.json`), samme by som Supabase (`eu-north-1`). Ikke fjern `regions` uten å måle: standardverdien er Washington.`
3. **`.changes/1815-vercel-region-stockholm.md`** (`type: perf`, `issue: 1815`),
   brødtekst i sporty du-form, f.eks.: «Serveren står nå i Stockholm i stedet for
   Washington, så hvert sidebytte i appen venter mindre på data.»
4. **Commit:** `perf(infra): run Vercel functions in Stockholm next to Supabase`
   med `Refs #1815` og målingene fra Problem-seksjonen kort gjengitt i body-en.
5. **PR** (draft først per #1516): tittel «Vercel-funksjoner til Stockholm»,
   body med `Closes #1815`, Fordeler/ulemper-blokk (obligatorisk for perf-PR-er),
   og en eksplisitt setning om at staging-klikkrunden er N/A for denne endringen
   (se K4). Ingen produktvalg → auto-merge-policyen gjelder når portene er grønne.

**Fallback hvis K2 viser at Hobby ignorerer `regions`:** ikke gjett. Post på
issuet hva preview-deployen rapporterte, og be eieren sette regionen manuelt:
«Gå til Vercel → golf-app → Settings → Functions → Function Region → velg
Stockholm (arn1) → Save. Forventet: neste deploy viser arn1.» Behold
`vercel.json`-linja (den er harmløs og dokumenterer intensjonen) med mindre
Vercel-byggeloggen advarer mot den.

**Rollback:** fjern `regions`-linja. Ingen data, ingen tilstand.

## Kanttilfeller og vern

- **Cold start blir ikke bedre.** Første kall etter stillstand koster fortsatt
  0,3–1,4 s (målt på prod 2026-09-02). Skal ikke selges som fikset.
- **Klient→server-RTT-en består.** Brukeren i Norge → `arn1` er faktisk kortere
  enn → `iad1` (edge-PoP-en er allerede `arn1`), men gevinsten der er sekundær.
- **Preview-deploys får samme region** — de er også `vercel.json`-styrte. Bra:
  K2 kan verifiseres FØR merge.
- **Ingen effekt lokalt.** `next start` på en Mac har ingen region; lokal måling
  før/etter er meningsløs. Derfor er staging-klikkrunden N/A (K4).
- **`vercel.json` må forbli gyldig JSON** — ett komma feil stopper hele deployen.
  Gate under.
- **Ikke rør `crons`.** Digest-cronen skal stå som før.

## Nøkkelbeslutninger

- **Region = `arn1` (Stockholm), ikke `fra1`/`dub1`:** Supabase står fysisk i
  Stockholm. Nærmest mulig.
- **Konfig i repoet, ikke i dashbordet:** repoet er sannhetskilden og endringen
  blir synlig i git-historikken; dashbordet er fallback.
- **Kun dette grepet:** eiervalg 2026-09-02. Router-cache og View Transitions
  parkeres (se Ikke i scope).

**Claude avgjør under bygging:** nøyaktig ordlyd i `.changes`-notatet og
CLAUDE.md-linja (humanizer-skillet før commit); PR-tekstens fordeler/ulemper.

## Suksesskriterier

- [ ] **K1 — Konfig.** `vercel.json` har toppnivå `"regions": ["arn1"]`; `crons`
  er uendret; `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"`
  går gjennom uten feil.
- [ ] **K2 — Preview-deployen kjører i Stockholm.** Etter push: finn PR-ens
  Vercel-preview (`gh api repos/jdlarssen/golf-app/commits/<sha>/status` →
  deployment-URL, eller Vercel MCP `list_deployments`), og
  `get_deployment <url>` viser `"regions": ["arn1"]`. Lim inn feltet som bevis i
  PR-en. (Viser den `iad1` → Fallback-seksjonen, ikke merge.)
- [ ] **K3 — Produksjonen kjører i Stockholm.** Etter merge + deploy: Vercel MCP
  `get_deployment tornygolf.no` viser `"regions": ["arn1"]` og
  `target: "production"`. Bevis i closing-kommentaren.
- [ ] **K4 — Staging-klikkrunde erklært N/A med begrunnelse.** PR-body-en sier
  eksplisitt at endringen ikke kan observeres lokalt/på staging (ingen region
  utenfor Vercel) og at K2/K3 er verifikasjonen. Ingen `staging-verified`-label
  påkreves; ingen falsk klikkrunde.
- [ ] **K5 — Bokføring.** `.changes/1815-vercel-region-stockholm.md` finnes med
  `type: perf` og `issue: 1815`; `node scripts/weekly-release.mjs --dry-run`
  aksepterer notatet. CLAUDE.md «Hosting»-linja er oppdatert.
- [ ] **K6 — Eierens tapptest (etter deploy, VERIFICATION GAP til den er gjort).**
  Closing-kommentarens «Funksjonell»-del ber eieren åpne `tornygolf.no/?perf=1`
  på iPhone, trykke inn i et spill og lese HUD-tallet «data» nederst. Forventning:
  merkbart lavere enn før (før-tall finnes ikke — HUD-en var ikke på; be eieren
  om et før-tall er ikke mulig lenger, så «kjennes raskere?» er kriteriet).

## Gates

```bash
# vercel.json er gyldig JSON og har regions=arn1 + crons intakt
node -e "const c=JSON.parse(require('fs').readFileSync('vercel.json','utf8')); if(JSON.stringify(c.regions)!=='[\"arn1\"]'||!Array.isArray(c.crons)||c.crons.length!==1) process.exit(1); console.log('vercel.json OK', c)"

# .changes-notatet valideres av ukerutinen (fail-closed)
node scripts/weekly-release.mjs --dry-run
```

Ingen `tsc`/`vitest`/`build`-port er relevant (ingen TS-/app-kode endres), men
pre-push-hooken kjører sine porter uansett — la den.

## Filer som trolig berøres

- `vercel.json` — `"regions": ["arn1"]`
- `CLAUDE.md` — én linje under «Hosting»
- `.changes/1815-vercel-region-stockholm.md` — perf-notat

## Ikke i scope

- `experimental.staleTimes` / router-cache-levetid (grep 2, parkert — stale-
  scorer etter tilbake-hopp er et produktvalg native-appen gjør overflødig)
- View Transitions (grep 3, parkert — kosmetikk, skjuler ikke ventetid, Safari
  ufullstendig)
- Prefetch-tuning i `SmartLink` (67–73 prefetch-requests på hjem med 14 aktive
  testspill; i prod er tallet langt lavere — ikke verdt egen sak nå)
- Færre sekvensielle DB-runder per side (ekte gevinst, men kodearbeid i hver
  varme rute — hører til native-appens datalag, ikke skall-perioden)
- `functionFailoverRegions` (Pro-funksjon)
- Bundle-splitting via `next/dynamic` (#797: virker ikke under Turbopack)
