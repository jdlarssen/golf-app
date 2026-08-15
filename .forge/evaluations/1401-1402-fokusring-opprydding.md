# Evaluering: Fokusring-opprydding (#1402 + #1401)

**Kontrakt:** `.forge/contracts/1401-1402-fokusring-opprydding.md`
**Branch:** `claude/fokusring-1401-1402` @ `7da69aef` (2 commits over `origin/main`)
**Evaluert:** 2026-08-16, fersk kontekst, ingen produkt-/testfiler endret av evaluator
**Miljø:** Node 22.x · staging `snwmueecmfqqdurxedxv` · `next dev -p 3148` fra denne worktreen

**VERDICT: ACCEPT**

---

## Kriterier

| # | Akseptansepunkt (fra kontrakten) | Bevis | Status |
|---|---|---|---|
| 1 | #1402: alle 13 wrappere har `data-focus-inset` | `grep -rn "data-focus-inset" app components` → 13 nye wrappere + de 2 fra #1386 (LocaleSwitcher, ThemeSwitcher). NotificationCard har attributtet på begge layout-grenene (`:159`, `:207`); `historikk` og `FinishedRoundsSection` går via `<Card>` som videresender `...rest` (`components/ui/Card.tsx:19`) | ✅ |
| 2 | globals.css-selektoren dekker hele elementlista | Programmatisk sammenlikning av hovedregelen (`app/globals.css:406–421`) og inset-regelen (`:432–447`): begge 11 elementer, `IDENTICAL: True` | ✅ |
| 3 | Staging: Tab viser synlig ring på hver rad, lys + mørk | 9 av 13 wrappere kjørt live med tastatur, 0 avvik i 7 Tab-runder. Alle inset-treff: `outline: solid 2px`, `outline-offset: -2px`, settled farge `rgb(27,67,50)` = `--focus-ring` (lys) / `#d4b870` (mørk) | ✅ |
| 4 | #1401: `grep -rn "focus:outline-none\|ring-accent/40" app components` = 0 | 3 treff igjen, alle ren prosa: `app/globals.css:381`, `:384` (kommentar som forklarer hvorfor regelen står utenfor `@layer`) og `app/__tests__/focus-ring-contrast.test.ts:141` (samme forklaring). Null i className-strenger | ✅ |
| 5 | #1401: bevisst beholdte listet i commit-body | Commit-body `7da69aef` lister `focus:ring-primary/20\|/30\|/40`, `focus:ring-danger/20`, `focus:ring-primary`, `ring-1 ring-border` og prosa-referansen. Grep bekrefter at nøyaktig disse står igjen (27 linjer, alle input/select/textarea) | ✅ |
| 6 | #1401: ingen visuell regresjon | Se «Beholdte input-ringer» under — målt, ikke antatt | ✅ |
| 7 | `.changes/1402-*.md` parser | `node scripts/weekly-release.mjs --dry-run` → exit 0, `#1402`-linja rendres i Feilrettinger under `1.233.0` | ✅ |
| 8 | Ren token-fjerning i commit 2 | `git show 7da69aef --numstat` utenom `globals.css`: **111 insertions / 111 deletions / 59 filer** — hver endret linje er 1:1. Programmatisk token-diff: kun `focus:outline-none` (111), `focus-visible:ring-2` + `focus-visible:ring-accent/40` (44 par), `focus:ring-2` + `focus:ring-accent/40` (35 par + 2 bare). Ingen andre tokens tapt | ✅ |
| 9 | Ingen ødelagte className-strenger | Ingen `className=""`, ingen dobbelt-mellomrom i `className="…"`, ingen etterlatt `ring-accent`/`ring-offset`, ingen brutte template-literals. Manuell gjennomgang av 10+ filers hunks | ✅ (én kosmetisk rest, se F2) |
| 10 | Tellingene i commit-body stemmer | `git grep -o -h "focus:outline-none" origin/main -- app components` = **111** (påstått 111) · `ring-accent/40` = **81** (påstått 44+35+2 = 81) | ✅ |

---

## Porter

| Port | Kommando | Resultat |
|---|---|---|
| Typer | `npx tsc --noEmit -p .` | exit 0, ingen utskrift |
| Lint | `npm run lint` | **0 errors**, 56 warnings — alle `complexity`/`max-depth` i `lib/`-filer branchen ikke rører (pre-eksisterende) |
| Tester | `npx vitest run` (hele suiten) | **485 filer / 6307 tester passert**, exit 0, 351 s. Ingen snapshot måtte oppdateres |
| Bygg | `npm run build` (etter `rm -rf .next`) | exit 0, full rute-tabell generert |
| Versjonsrutine | `node scripts/weekly-release.mjs --dry-run` | exit 0, `#1402` med i diffen, ingenting skrevet |
| Arbeidstre | `git status --short` | Kun `?? .forge/contracts/…` — ingen utilsiktede endringer |

---

## Staging-bevis

Alle rundene kjørt mot `torny-staging`, admin-innlogging via service-role OTP-mint (`loginStatus: 303`).
Oraklene: `console.error`, `requestfailed` (ignorert `ERR_ABORTED`), og en prod-vakt som fanger
**hver** request mot `*.supabase.co`.

**Prod-vakt:** samtlige Supabase-kall i alle 5 kjøringene gikk til
`snwmueecmfqqdurxedxv.supabase.co`. `prodViolations: []` i hver runde. Ingen skriving mot
prod, ingen skriving i det hele tatt — runden er ren lesing + tastatur.

| Akseptansepunkt | Struktur-orakel | Feillogg | SQL-orakel |
|---|---|---|---|
| `/no/profile` — SettingList-radene (lys) | 23 Tab-stopp; 9 inset-treff, alle `outline-offset: -2px`, `solid 2px`; øvrige 14 `2px` | 0 console-errors, 0 requestfailed | — (kun visning) |
| `/no/profile` — samme, mørk modus | 23 Tab-stopp, 9 inset-treff `-2px`, ringfarge `#d4b870` | 0 / 0 | — (kun visning) |
| `/no/admin` — ActionItemsStripe + ActivityLedger | 27 Tab-stopp; 9 inset-treff `-2px` (1 handlingsrad + 8 aktivitetsrader) | 0 / 0 | — (kun visning) |
| `/no/innboks` — NotificationCard (lys) | 5 Tab-stopp; 2 inset-treff `-2px` (tapp-knapp + arkiv-knapp inne i kortet) | 0 / 0 | — (kun visning) |
| `/no/innboks` — samme, mørk modus | 5 Tab-stopp, 2 inset-treff `-2px`, ringfarge `#d4b870` | 0 / 0 | — (kun visning) |
| `/no/profile/historikk` → «Runder»-fanen | 7 Tab-stopp, **alle 7** inset-treff `-2px`, settled farge `rgb(27,67,50)` | 0 / 0 | — (kun visning) |
| Veiviseren steg 2 (FormatGrid, klikket framover) | 20 Tab-stopp: 2 inset `-2px` (valgt tile + «Slik funker det»), 18 ikke-inset `2px` | 0 / 0 | — (kun visning) |
| `/no/admin/spillere` — PlayersListClient | 28 inset-treff `-2px`, 0 avvik | 0 / 0 | — (kun visning) |
| `/no/admin/games` — ledger-body | 29 inset-treff `-2px`, 0 avvik | 0 / 0 | — (kun visning) |
| `/no/admin/courses` — CoursesLedgerClient | 4 inset-treff `-2px`, 0 avvik | 0 / 0 | — (kun visning) |
| Beholdte input-ringer (musklikk) | `<input>`, `<select>`, `<textarea>` klikket med mus matcher alle `:focus-visible` = `true` og får `solid 2px rgb(27,67,50) off 2px` | 0 / 0 | — (kun visning) |

**Aggregert avviksteller:** 0 ekte brudd. De 5 «bruddene» runde 1 flagget var alle
`<nextjs-portal>` — Next.js sitt dev-overlay, ikke app-kode; utelatt i runde 2–5.

### Skjermbilder

Katalog: `/private/tmp/claude-501/-Users-jdl-Dokumenter-GitHub-golf-app--claude-worktrees-forge-auto-issue-0715fa/e6633aef-0eff-4d82-903e-85aeddc43c86/scratchpad/`

| Fil | Hva den viser |
|---|---|
| `K-light-profile.png` | «Min historikk»-raden i SettingList, lys — mørkegrønn ring rett innenfor kortkanten |
| `K-dark-profile.png` | Samme rad, mørk — champagne-ring, tydelig mot forest-flaten |
| `K-light-innboks.png` | Varselkortets tapp-knapp, lys — ring følger knappens venstre/topp/bunn inne i kortet |
| `K-dark-innboks.png` | Samme, mørk |
| `K-light-admin.png` | ActionItemsStripe-raden «1 spill med uleverte scorekort» |
| `K-light-historikk.png` | Runde-lista i `Card p-0` — nederste rad har ringen, klart adskilt fra `divide-y`-linjene |
| `K-light-spillere.png` · `K-light-games.png` · `K-light-courses.png` | Ledger-radene i Klubbhuset |
| `K-light-formatgrid.png` | Valgt format-tile med fokus |
| `K-formatgrid-unfocused.png` / `K-formatgrid-focused.png` | 3× DPR, samme utsnitt, uten/med fokus — grunnlaget for F1 |
| `K-formatgrid-control-unselected.png` | Kontroll: en *uvalgt* tile med fokus (positiv offset, ring på linen) |

### Klipp-resonnementet (målt, ikke antatt)

`outline-offset: -2px` tegner ringen **innenfor** elementets egen border-boks. Målt på
`/no/profile`: fokusert `<a>` har `elRect.top = 437.5`, wrapperen `wrapperRect.top = 436.5` —
elementet ligger 1 px inne i wrapperen (wrapperens border). Ringen tegnes da fra y ≈ 439.5,
altså 3 px innenfor wrapperens ytterkant og godt innenfor klippeflaten. En `overflow: hidden`
på forelderen kan per definisjon ikke kutte den, siden hele ringen ligger i barnets eget
innhold-rektangel. Skjermbildene bekrefter det visuelt: ringen er lukket hele veien rundt
i alle ti utsnittene.

---

## Funn

### F1 — FormatGrid: ringen er bare merkbar på én av fire kanter (oppfølging, ikke blokker)

**Fil:** `app/[locale]/admin/games/new/FormatGrid.tsx:70–77`
**Kriterium:** #1402 success criterion — «viser **synlig** ring på hver rad»

Wrapperen rundt den valgte format-flisen har `border border-primary` (1 px) **pluss**
`shadow-[inset_0_0_0_1px_var(--primary)]` (1 px). Målt i økten: `--primary` = `#1b4332` og
`--focus-ring` = `#1b4332` — **samme farge**. Med `-2px` offset lander ringen rett inntil de
to like-fargede 1 px-linjene på topp, venstre og høyre → 1,00:1 der. Sammenlikner man
`K-formatgrid-unfocused.png` mot `K-formatgrid-focused.png` (samme utsnitt, 3× DPR), er den
eneste synlige forskjellen **underkanten**: den bleke `border-primary/25`-skillelinja blir en
solid mørkegrønn 2 px-strek. Kontrollen (`K-formatgrid-control-unselected.png`, uvalgt flis)
viser hvordan en normal ring ser ut til sammenlikning — kritt-tydelig hele veien rundt.

Dette er **ikke en regresjon**: før denne branchen hadde flisen ingen fokusmarkering i det
hele tatt (positiv offset ble klippet vekk av `overflow-hidden`). Den er strengt bedre nå.
Men den er svakere enn overalt ellers, og repoet har allerede mekanismen for nøyaktig denne
kollisjonen fra #1386: `data-focus-surface="strong"` bytter ringfargen for et helt subtre der
`--focus-ring` kolliderer med flaten under (`app/globals.css:456–465`). Byggeren flagget
selv forholdet. **Anbefaling:** eget oppfølgings-issue, ikke omarbeid i denne PR-en.

### F2 — Tre tomme strenger igjen der en utility ble fjernet (kosmetisk)

**Filer:** `app/[locale]/admin/liga/[id]/LigaEmbedControl.tsx:91` ·
`app/[locale]/games/[id]/(home)/LiveFollowControl.tsx:120` ·
`app/[locale]/games/[id]/leaderboard/RowReactions.tsx:21`
**Kriterium:** #1401 steg 2 — «fjern kun tokens, ikke bryt strengen»

I disse tre var hele array-elementet fokus-utilities, og elementet ble tømt til `''` i stedet
for å bli slettet. `.join(' ')` legger da igjen et dobbelt mellomrom i className-strengen.
Ingen funksjonell effekt (`tsc`, `lint`, hele vitest-suiten grønn, og Tailwind bryr seg ikke),
men det er akkurat den «tomme plassen som ser ut som noe» #1401 satte seg fore å bli kvitt —
neste leser ser en mystisk blank luke i en klasse-liste. Kan ryddes i en oppfølger eller ved
neste berøring; ikke verdt en ny runde alene.

### F3 — Byggerens flagg om at ~15 input/select mistet musklikk-ringen: avkreftet

Byggeren varslet at fjerningen av `focus:ring-2 focus:ring-accent/40` på input/select ville
gjøre at de kun får den globale `:focus-visible`-ringen, altså ikke ved musklikk. **Målt på
staging:** musklikk på `<input type=text>`, `<select>` og `<textarea>` gir alle
`el.matches(':focus-visible') === true` og full `solid 2px rgb(27,67,50) off 2px`. Chromium
behandler tekstfelt (og her også `<select>`) som alltid-`:focus-visible`. Det som ble fjernet
målte dessuten 1,32:1 (#1386s egen beregning) — altså usynlig uansett. **Ingen brukersynlig
endring.** Se forbehold under.

### F4 — Beholdte `focus:ring-primary/*` er i tråd med #1401, ikke en glipp

#1401 avgrenser seg eksplisitt til `focus:outline-none` og `ring-accent/40` — både i tittelen
og i brødteksten. De 27 gjenværende linjene er `focus:ring-primary/20|/30|/40`,
`focus:ring-primary` og `focus:ring-danger/20`, alle på input/select/textarea, alle parret med
`focus:border-primary`/`focus:border-danger`, og alle med en farge som faktisk rendres
(primærgrønn, ikke den blasse gullringen). De er ikke død kode, ikke accent, og ligger utenfor
#1401s ordlyd. Beholdingen er dokumentert i commit-body-en. **Riktig avgjørelse.**

---

## Dekningshull og forbehold

1. **4 av 13 wrappere er kun struktur-verifisert** (grep + den ene delte CSS-regelen), ikke
   tastatur-kjørt live: `GettingStartedChecklist` (rendres bare for en fersk admin med
   ufullført oppsett), `GenerateMatchesWizard` steg 1 (krever en cup i generer-flyten),
   `TeamRegistrationForm` sitt forslags-`<ul>` (krever åpen lag-påmelding),
   `FinishedRoundsSection`. Risikoen er lav: mekanismen er ett attributt + én global
   CSS-regel, og den er bevist live på 9 andre wrappere og på tre ulike elementtyper
   (`a[href]`, `button`, `button[role=radio]`). Men det er ikke observert.
2. **VERIFICATION GAP — kun Chromium.** All nettleser-evidens er Playwright/Chromium.
   Eierens plattform er iPhone Safari. At `<select>` matcher `:focus-visible` ved musklikk er
   en UA-heuristikk som kan avvike i Safari. Konsekvensen er uansett liten (det fjernede
   båndet målte 1,32:1), men den er ikke verifisert der.
3. **Ingen SQL-orakel.** Hele endringen er ren presentasjon — attributter og CSS. Ingen
   migrasjon, ingen skriving, ingen RPC. Derfor «—» i hele SQL-kolonnen over.
4. Kontraktens steg 3 for #1402 åpnet for én `data-focus-inset`-assert i både
   `SettingRow.test.tsx` og `NotificationCard.test.tsx`. Byggeren la den bare i
   NotificationCard. Ordlyden er tillatende («… er OK»), ikke påbudt — ikke et avvik.

---

## Konklusjon

Begge issues er levert etter kontrakten. #1402 er verifisert live på ni av tretten wrappere i
både lys og mørk modus med null avvik, og klipp-resonnementet er målt, ikke antatt. #1401 er
en bevislig 1:1 token-fjerning — 111 in / 111 ut over 59 filer, tellingene i commit-body-en
stemmer mot `origin/main`, og hele testsuiten er grønn uten en eneste snapshot-oppdatering.
Alle fem portene er grønne. De to funnene (F1 FormatGrid-kontrast, F2 tre tomme strenger) er
begge oppfølgingsmateriale — F1 er en forbedring som kunne vært større, ikke en feil, og F2 er
kosmetikk. Ingen av dem rettferdiggjør en ny byggerunde.

**VERDICT: ACCEPT**
