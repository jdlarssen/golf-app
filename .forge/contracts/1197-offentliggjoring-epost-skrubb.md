# Spec: Offentliggjøringsprep — e-post-skrubb + staging-nøkkel (#1197)

**Issue:** #1197 · forutsetning for å gjøre repoet offentlig (jf. #1195, sikkerhetsblokker #1131 lukket)
**To STRENGT ATSKILTE leveranser:** Del A = kode-PR (autonomt byggbar). Del B = operasjonell runbook (ALDRI autonom — eier i loopen på hvert luke-punkt).

> **STATUS per 2026-07-10 (kontrakten er delvis historisk):** Del A er SHIPPET på main
> (`fb589f59` — fallback fjernet, env-guard i begge klient-buildere, 13 lifecycle-tester
> grønne). Del B steg 0–6 er UTFØRT (historikken er omskrevet og force-pushet; gammel og
> ny main deler ingen historikk). **Ingenting gjenstår for en autonom bygger.** Gjenstående
> er KUN eier-stegene 7–9: GitHub-support-purge (eller eksplisitt frafall), re-etablering
> av øvrige lokale kloner/worktrees, og synlighets-flippen. Kontrakten beholdes som
> runbook-dokumentasjon for de gjenstående stegene og som fasit for hva som ble gjort.

## Problem

Eier vil gjøre repoet offentlig (gratis ubegrenset Actions). To ting gjenstår:
1. **Del A:** `e2e/games/adversarial-role-replay.spec.ts` har staging-anon-nøkkelen (JWT, `role: anon`) hardkodet som fallback. Nøkkelen er offentlig *by design* (ligger i alle staging-besøkeres nettleser; RLS er forsvaret) — ikke en lekkasje, men den trigger secret-skannere og hører ikke hjemme i kode.
2. **Del B:** e-post-sweep fant **ekte personers adresser** i trackede filer (to plan-docs fra mai + diverse): venners gmail/hotmail, eiers gmail + e2e-aliaser. Eier valgte full historie-omskriving (`git filter-repo --replace-text`) framfor kun HEAD-redaksjon.

## Research Findings (in-repo ground truth, verifisert denne økten)

- **Hardkodet fallback:** `adversarial-role-replay.spec.ts:54-57` — `const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'eyJ…';`. Brukes i BÅDE `anonClient()` (`:63-68`) og `signedInClient()` (`:75-79`). Begge sjekker allerede `SUPABASE_URL`: `if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');` (`:64`, `:76`) — mønsteret å speile.
- **Env-mønster i naboen:** `e2e/_helpers/games.ts:20` `export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;`; `adminClient()` kaster `:45-50` når URL/service-key mangler; `envReady` (`:31`) + `skipReason` (`:34-35`) gater `test.skip`. Konsistent fiks = legg `NEXT_PUBLIC_SUPABASE_ANON_KEY` inn i samme env-gate OG kast tydelig ved bruk.
- **Force-push er hook-blokkert:** `.githooks/pre-push` blokkerer direkte push til `main`; `.claude/hooks/bash-guard.sh:13` ASK-gater `git push --force` (lease OK). Del B kan derfor ikke kjøres autonomt — force-push krever eiers eksplisitte luke.
- **filter-repo-rekkevidde:** `git filter-repo --replace-text` omskriver kun **git-innhold** (commit-diffs/trær). Adresser i issue-/PR-**tekst** på GitHub berøres IKKE (egen restrisiko — se Del B steg 8).

## Prior Decisions (carry-forward)

- Anon-nøkkel er offentlig by design (samme resonnement som `adversarial-role-replay.spec.ts:54`-kommentaren) → fjerning er hygiene mot secret-skannere, ikke incident.
- Testing = staging; disse spec-ene er `@lifecycle`, env-gated, treffer aldri prod.
- Branch + PR-flyt (post-v1.0): all kode via PR, `Refs #1197` i body, `Closes #1197` i PR.

---

## DEL A — Kode-PR (autonomt byggbar, opus/sonnet)

### Design
1. Fjern den hardkodede JWT-fallbacken i `adversarial-role-replay.spec.ts:54-57`. Les nøkkelen fra env uten fallback: `const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;`.
2. Kast tydelig feil ved bruk i BÅDE `anonClient()` og `signedInClient()` — speil `SUPABASE_URL`-sjekken: `if (!ANON_KEY) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY not set');` (ELLER en liten delt guard om det er renere).
3. **Anbefalt konsistens:** ta `NEXT_PUBLIC_SUPABASE_ANON_KEY` inn i `e2e/_helpers/games.ts` `envReady`/`skipReason`-gaten (`:31`/`:34`) slik at en manglende nøkkel gir ren `test.skip`, ikke en kastet feil — fullt speil av `SUPABASE_URL`-behandlingen. (Hvis anon-nøkkelen alt eksporteres derfra, gjenbruk den framfor lokal `process.env`-lesing i spec-en.)

### Edge Cases & Guardrails (Del A)
- CI/staging har alltid `NEXT_PUBLIC_SUPABASE_ANON_KEY` satt → spec kjører som før; kun et bart miljø endrer oppførsel (skip framfor falsk-grønn med prod-nøkkel).
- **Ikke bruker-synlig** (test-infra) → ingen version-bump, ingen CHANGELOG. Commit-prefix `test`/`chore` (passerer fritt), ELLER `fix` med `[no-changelog]` i body-en. `Refs #1197`.
- Ingen andre spec-er har samme fallback (grep-bekreftes før commit).

### Success Criteria (Del A)
1. Ingen hardkodet JWT i `adversarial-role-replay.spec.ts` (grep på `eyJ` i spec-en = tomt).
2. Manglende `NEXT_PUBLIC_SUPABASE_ANON_KEY` → tydelig feil/skip (ikke stille prod-nøkkel-bruk).
3. Spec kjører grønt mot staging med env satt (targeted Playwright-run eller `e2e:gate`).

### Gates (Del A)
- `npx tsc --noEmit` grønn · `npm run lint` grønn.
- Co-located: `npx playwright test e2e/games/adversarial-role-replay.spec.ts` grønt mot staging (env satt).
- Test-only → `[no-changelog]` (eller `test:`/`chore:`-prefix); ingen version-bump.

### Files Likely Touched (Del A)
- `e2e/games/adversarial-role-replay.spec.ts` — fjern fallback, krev env
- `e2e/_helpers/games.ts` — (anbefalt) `ANON_KEY` i env-gate

---

## DEL B — Operasjonell runbook (ALDRI autonom bygging)

> **Kritisk:** Del B kjøres ALDRI av en autonom bygger. Hvert luke-punkt krever eier fysisk i loopen. Vinduet MÅ være uten åpne PR-er (alle merget/lukket). Adressene i mappingen er ekte personers kontaktinfo — en bygger skal ikke finne opp eller gjette adresser; eier leverer/verifiserer den fulle lista.

### Steg (hvert `⛔ EIER-LUKE` stopper autonom kjøring)

0. **Forutsetning ⛔:** eier bekrefter null åpne PR-er og varsler ev. medarbeidere. Kjente kostnader (eier informert): alle commit-SHA-er endres; commit-lenker i issues/PR-er brekker; åpne PR-er må gjenskapes.
1. **Fersk klon utenfor worktrees:** `git clone <remote> torny-scrub` i en scratch-katalog — ALDRI i en arbeids-worktree (isolation-worktree-agenter går rogue her; CLAUDE.md krever fersk klon).
2. **`expressions.txt` ⛔:** eier leverer/verifiserer `literal:<adresse>==><placeholder>`-mapping for HVER funnet adresse (venners gmail/hotmail, eiers gmail, e2e-aliaser) + anon-nøkkelen. Bygger fyller ikke inn adresser fra hukommelse.
3. **Omskriv:** `git filter-repo --replace-text expressions.txt` på den ferske klonen.
4. **Dry-run-verifisering (FØR push):**
   - **Null e-post-treff i full historikk:** for hver adresse `git grep -i '<adresse>' $(git rev-list --all)` → 0 treff.
   - **Commit-antall bevart:** `git rev-list --count --all` før vs. etter er likt (replace-text dropper ikke commits).
   - **Tre-SHA-diff:** de nyeste tre commit-enes tre-innhold vs. original HEAD viser KUN erstatningene (diff filinnhold mellom original- og omskrevet HEAD).
5. **Force-push ⛔ (KUN via eiers eksplisitte luke):** omskrevet `main` + aktive branches. Force-push er ellers hook-blokkert (`.githooks/pre-push` + bash-guard ASK-gate) — eier kjører den manuelt eller åpner luken bevisst. ALDRI autonomt.
6. **Re-etabler lokale kloner/worktrees:** gamle worktrees har nå divergerte SHA-er → re-klones/resettes fra omskrevet historikk. `git log --oneline -5` matcher remote.
7. **GitHub-cache ⛔:** gamle commits er nåbare via SHA-lenker i issues/PR-er til GitHub GC-er. Eier sender GitHub Support «remove cached views» (GitHubs sensitive-data-prosedyre) ELLER frafaller restrisikoen eksplisitt (adressene er kontaktinfo, ikke credentials).
8. **Restrisiko — issue/PR-tekst:** `filter-repo` rører IKKE adresser i issue-/PR-kommentarer/-bodyer (kun git-innhold). Disse må håndteres separat (manuell redaksjon) eller aksepteres — eier beslutter.
9. **Synlighets-flipp ⛔:** eier klikker Settings → General → Danger Zone → Make public. FØRST etter at 4–8 er avklart.

### Success Criteria (Del B)
- Omskrevet historikk verifisert ren (null e-post-treff i full historikk); commit-antall bevart; tre-SHA-diff kun erstatninger.
- Force-push utført via eier-luke; lokale kloner/worktrees re-etablert (`git log --oneline -5` matcher remote).
- GitHub-support-purge sendt ELLER eksplisitt frafalt av eier; restrisiko i issue/PR-tekst notert/håndtert.
- Eier har flippet synlighet (eller bevisst utsatt).

### Gates (Del B)
- Ingen kode-gates (operasjonelt). «Gaten» er dry-run-verifiseringen i steg 4 + eier-lukene. Ingen autonom force-push.

## Out of Scope

- Selve `.github/`-Actions-oppsettet for offentlig repo (#1195).
- Rotering av staging-anon-nøkkelen (offentlig by design — fjernes fra kode, ikke roteres).
- Redaksjon av adresser i eksterne speil/gafler utenfor eiers kontroll.
- Automatisering av Del B (bevisst manuell, eier-gated).
