# Evaluation: #546 — Matchplay-familien duellkort i leaderboarden

**Verdict: ACCEPT**

Branch: `claude/infallible-lovelace-ecae08` · Commits: 65f5768, 31991cf, eb3479b (+ ada808c forge-meta)
Evaluator: skeptisk fresh-context review, kodelesing + gates kjørt selvstendig fra worktree-roten.

---

## Sammendrag

Arbeidet leverer det kontrakten ber om: et delt `MatchplayDuelCard` (client island) konsumert av alle tre matchplay-views, en ren TDD-helper `runningMatchStatus` som driver den nye «Stilling»-kolonnen, meta-raden fjernet, og Out-of-Scope-filene urørt. Viewene er konvertert til server-komponenter med all client-state isolert i kortet — verifisert trygt. tsc og scoped vitest grønne. Eneste delvis-kriterium (dark-mode/mobil) er forsvarlig på kodenivå og korrekt markert DEFERRED til Vercel-preview, ikke en blocker.

---

## Per success-kriterium

### 1. Alle tre views rendrer duellkort i stedet for banner + side-kort — **PASS**

- `MatchplayDuelCard.tsx` (ny, 368 linjer) inneholder alle fem anatomi-deler: versus-header med `score-num text-[40px]` hull-vunnet-tall i `--player-a`/`--player-b` (SidePanel, linje 194–239), dragkamp-bar (`*-duel-bar`, linje 128–142), momentum-strip (`*-duel-strip`, linje 144–156), tegnforklaring (LegendDot, linje 158–163), og dom (Verdict, linje 272–368).
- Konsumert i alle tre: `MatchplayMatchView.tsx:140`, `FourballMatchplayView.tsx:125`, `FoursomesMatchplayView.tsx:135` — hver med eget `testIdPrefix` og `storagePrefix`.
- `*-side-1`/`*-side-2`-testids flyttet til versus-panelene (MatchplayDuelCard.tsx:110, 117). Gammelt singles-view hadde ikke disse på side-kortene; nå finnes de på panelene per kontrakt.
- Evidens for hull-vunnet-tall = `holeResults.filter(side1_wins/side2_wins).length` (linje 87–88), ikke `holesUp`. Konsistent med strip og verdict (holesUp ≡ holesWonA − holesWonB i matchplay).

### 2. Dommen bruker matchplay-terminologi i alle fem tilstander — **PASS**

Verdict-komponenten (linje 272–368) dekker eksakt fem grener i riktig prioritet:
- Avgjort vinner: «{label} vant {formatted}» + «Avgjort på hull {decidedAtHole}» (`*-banner-decided`, linje 304–317).
- AS etter 18: «Matchen endte AS» + «All square etter 18 hull» (`*-banner-tied`, linje 288–300).
- Live 0 hull: «Matchen er ikke startet ennå» (`*-banner-live`, linje 320–335).
- Live AS: «Alt likt etter {holesPlayed} hull» (linje 337–350).
- Live leder: «{leaderLabel} leder {margin} up» + «Etter {holesPlayed} hull» (linje 352–366), `leaderLabel = holesUp > 0 ? sideA : sideB` — korrekt side-tilordning.

Banner-testid-ene `*-banner-decided/-tied/-live` bevart; eksisterende banner-tekst-tester består uendret (del av 991 grønne).

### 3. Per-hull-tabellen har Stilling-kolonne; uspilte hull viser «—» — **PASS**

- Ny kolonne «Stilling» lagt etter «Vinner» i alle tre HoleGrid-er (MatchplayMatchView.tsx:289–294, Fourball:280–285, Foursomes:286–291).
- `StatusCell` (alle tre views): `runningStatus === null` → «—»; `>0` → `text-player-a`; `<0` → `text-player-b`; `0` → muted «AS» (MatchplayMatchView.tsx:380–403). Farge-semantikk stemmer med kontrakten (positiv = side 1 = `--player-a`).
- Helper `runningMatchStatus` (matchplayRunningStatus.ts): akkumulerer +1/−1, holder stilling på tied, returnerer `null` for unplayed uten å endre `holesUp` — også midt i sekvensen (linje 12–30). Verifisert mot test `[s1, u, s2, u] → [1, null, 0, null]` (matchplayRunningStatus.test.ts:24–26).
- Eierens eksempelsekvens dekket: `[s1,s1,s1,s2,s2,s2] → [1,2,3,2,1,0]` (test linje 18–22).
- Render-assertions i singles + fourball test-filer bekrefter «1up»/«AS»/«—» i faktiske hull-rader.

### 4. Meta-raden fjernet fra alle tre views — **PASS**

- `grep MetaCell|*-meta|Spilt|Igjen` → 0 treff i alle tre views.
- Gammelt `matchplay-meta`-testid + MetaCell eksisterte i origin/main (verifisert via `git show origin/main:...`), så `queryByTestId('matchplay-meta').not.toBeInTheDocument()`-testene er meningsfulle, ikke vakuøse.

### 5. Konfetti-oppførsel uendret — **PASS**

- Fyrer kun ved `hasDecidedWinner = matchResult !== null && winner !== 'tied'` (MatchplayDuelCard.tsx:71–85) — aldri AS, aldri live.
- Én gang per sesjon via `sessionStorage.getItem(key) === '1'`-gate; try/catch faller gjennom og fyrer uansett om storage er utilgjengelig.
- Nøkkel-konstruksjon `${storagePrefix}${gameId}` er **bit-identisk** med origin/main (`${STORAGE_PREFIX}${gameId}`), og de tre historiske prefiksene (`torny-matchplay-result-confetti-seen-`, `torny-fourball-...`, `torny-foursomes-...`) er bevart per view. → ingen regresjon i «seen»-state for prod-brukere etter deploy.
- Alle fire konfetti-tester (fyrer ved vinner, ikke live, ikke AS, distinkt key fra stableford-podium, hopper over ved sett) finnes i MatchplayMatchView.test.tsx og består.

### 6. Greensome/chapman/gruesome får samme visning automatisk — **PASS**

- Kun `leaderboard/page.tsx` konsumerer FoursomesMatchplayView; page.tsx er ikke i diffen.
- Alle foursomes-familiens kinds returnerer `FoursomesMatchplayResult` og rendres av samme view (formatLabel skiller navnet). Ingen scoring/page-endring kreves — bekreftet at diffen ikke rører dem.

### 7. Dark mode + 380px mobilbredde uten horisontal overflow — **DEFERRED** (forsvarlig)

- **Dark mode: kodemessig PASS.** Ingen hardkodede hex i `MatchplayDuelCard.tsx`. Alle farger via theme-tokens med dark-varianter: `--color-player-a/b` (globals.css:306–307, dark-override 159–160/247–248), `--color-muted/border/text/accent/score-under-fg` (globals.css:294–309). Strip bruker class-utilities (`bg-player-a/b`, `bg-muted/40`, `border-border`), bar/tall bruker inline `var(--player-a)` — begge løser samme token.
- **380px: DEFERRED.** Strip er `flex-wrap` (kan ikke overflowe horisontalt). 6-kolonners tabell med `text-[12.5px]` og knappe paddinger (`px-1`/`px-2`); innholdet er smalt (tall, «1up», «S1»). Ingen åpenbar overflow-risiko, men fysisk render kreves for endelig dom. Korrekt markert i kontrakten som blokkert lokalt (ingen `.env.local`/service-key) → tas på Vercel-preview før merge. Dette er ikke en accept-blocker.

---

## Gates (kjørt selvstendig fra worktree-roten)

| Gate | Resultat |
|------|----------|
| `npx tsc --noEmit` | **EXIT 0** (ren) |
| `npx vitest run "app/[locale]/games/[id]/leaderboard" lib/scoring` | **67 filer / 991 tester grønne** (9.30s) |
| `npx vitest run` (full) | Ikke kjørt på nytt — builder dokumenterte 255/3097 grønt; ingen grunn til tvil (endringen er innkapslet, scoped suite + tsc grønt) |
| `npm run build` | Ikke kjørt på nytt — builder dokumenterte grønt; tsc-grønt + server/client-grense verifisert reduserer risiko |

Out-of-Scope verifisert via `git diff origin/main...HEAD --name-only`: `HeadToHeadResult.tsx`, `singles/fourball/foursomesMatchplay.ts`, `leaderboard/page.tsx`, `leaderboard/holes/` — **ingen** i diffen.

---

## Funn utenfor kriteriene

### SHOULD-FIX
*(ingen)*

### BLOCKER
*(ingen)*

### NIT

- **NIT-1 — Versus-panel sublines mangler `break-words`.** SidePanel-`label` har `break-words` (MatchplayDuelCard.tsx:219), men `sublines` (linje 232–236) har ikke. For fourball/foursomes er sublinene «{langt navn} · HCP {n}» / «Lag-HCP: …». Et veldig langt spillernavn i en `grid-cols-2`-celle på 380px kan presse bredden uten ombrekking på lange ord. Lav sannsynlighet (norske fornavn er korte; firstName brukes ikke her men full formatRevealName-navn er typisk korte). Vurder `break-words` på subline-spanene som forsikring. Ikke blokkerende.

- **NIT-2 — `formatRevealName` brukes for sublines i foursomes/fourball-paneler, ikke fornavn.** Bevisst valg (panel har mer plass enn tabell-headeren som bruker `firstName`), men verdt å bekrefte visuelt på preview at to fulle navn + lag-HCP-linje ikke blir for høyt på smal skjerm. Kosmetisk.

Begge er rene polish-observasjoner som naturlig fanges i den utsatte Vercel-preview-sjekken (kriterium 7). Ingen krever issue.

---

## Begrunnelse for verdiktet

Seks av syv success-kriterier er PASS ved selvstendig kodelesing; det syvende er korrekt klassifisert som DEFERRED (dark-mode kode-PASS, 380px-render utsatt til preview slik kontrakten eksplisitt tillater). Gates jeg kjørte er grønne (tsc EXIT 0, 991/991 scoped tester). Out-of-Scope er respektert til punkt og prikke. Server/client-grensen er trygg: viewene mistet `'use client'` men har null gjenværende hooks/event-handlers/`window`/`sessionStorage` (kun JSDoc-omtaler), og all interaktivitet bor i `MatchplayDuelCard` som beholder `'use client'`. Konfetti-nøkkelen er bit-identisk med før, så ingen «seen»-regresjon. De to funnene er rene NITs som dekkes av den planlagte preview-sjekken.

**ACCEPT** — klar for Vercel-preview-verifisering (dark-mode + 380px) og deretter merge.

---

## Live prod-verifisering (2026-06-11, etter merge av PR #547)

Verifisert på tornygolf.no via Claude in Chrome mot eneste matchplay-spill i prod («Byneset North 10. juni», singles, ferdigspilt 18 hull):

- **Duellkort rendrer korrekt i dark mode:** ★ + «Karl "Jussa"» 8 HULL VUNNET (petrol) mot «Jørgen "J"» 6 HULL VUNNET (terracotta), HCP-sub-linjer, dragkamp-bar proporsjonert 8:6, momentum-strip med alle 18 celler i riktig sekvens (4 grå delte + 8 petrol + 6 terracotta), tegnforklaring, dom «VINNER / Karl "Jussa" vant 2up / Avgjort på hull 18».
- **Stilling-kolonnen:** full sekvens AS → 1up(S2, terracotta) → AS → 1up → 2up → 3up → 4up → 5up → 4up → 5up → 5up → 6up → 5up → 5up → 4up → 3up → 3up → **2up** — ender nøyaktig på dommens «2up». Farge følger leder (terracotta da side 2 ledet, petrol resten).
- **Ingen horisontal overflow:** `document.documentElement.scrollWidth === window.innerWidth`. Innholdskolonnen (AppShell) er ~408px bred — kortet 408px, tabellen 378px, dvs. reell mobil-bredde. C7 (DEFERRED) er dermed lukket for dark mode + smal bredde.
- Merk: første screenshot fanget reveal-up-animasjonen midt i stagger (kort/celler så tomme ut) — DOM-inspeksjon bekreftet opacity 1 og korrekte computed backgrounds; neste screenshot viste alt.

C7: DEFERRED → **PASS**.
