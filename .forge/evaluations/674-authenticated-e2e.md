# Evaluering #674 — Autentiserte e2e: kjerneløkka + cup/liga-livssyklus-smoke

**Issue:** [#674](https://github.com/jdlarssen/golf-app/issues/674) · **Branch:** `claude/relaxed-brahmagupta-ee8cb3`
**Kontrakt:** `.forge/contracts/674-authenticated-e2e.md`

## Verifikasjons-grense

Spec-ene kan IKKE kjøres i denne worktreen (ingen `.env.local`/service-role/test-brukere — `envReady=false`, alle 3
spec-er `test.skip()`). Korrekthet verifiseres derfor **ved konstruksjon**: selektorer krysset mot faktiske
render-trær + i18n-katalog, seed-shapes mot scoring-logikken, pluss `tsc`/`playwright --list` for at koden
kompilerer og laster. «Grønt»-kjøring skjer i eiers miljø (GH Actions-secrets + `RUN_E2E`).

---

## Første evaluering — NEEDS WORK

Tre funn på de autentiserte spec-ene:

- **F1 (BLOKKER):** `signInViaOtp` (begge kopier — `e2e/_helpers/games.ts` + `e2e/auth/invitation-flow.spec.ts`)
  ventet på `getByRole('heading', { name: 'Logg inn' })`. `/login` har INGEN slik heading: `BrandHero` rendrer
  `<h1>Tørny</h1>`, og «Logg inn» finnes bare som verify-stegets knapp. Asserten ville time-out FØR noen spec
  kjørte — slo ut alle autentiserte spec-er (golden-path, cup, liga, signup-familien).
- **F2:** `scoring-golden-path.spec.ts` brukte `not.toHaveText('—')` på `score-number`. Elementet viser par som
  spøkelse i utgangstilstand (aldri «—»), så asserten var vakuøst sann og beviste ingenting om at +1 registrerte.
- **F3:** `liga.spec.ts` finished-flight seedet kun score for hull 1–5. `roundScoring` filtrerer bort runder der
  `holesPlayed !== holeCount`, så en delvis runde ⇒ tom standings-tabell ⇒ asserten på `liga-standings-row`
  ville feilet (eller bevist ingenting).

---

## Re-evaluering — 2026-06-17 (fix-commit `8c2d66ef`)

Skeptisk fresh-context re-verifisering av at fix-commiten løser hvert funn, uten regresjon.

### F1 — RESOLVED ✅

Begge kopier venter nå på `page.getByLabel('E-post')`. Verifisert at markøren finnes på `/login`:

- `app/[locale]/(auth)/login/page.tsx`: default-steg = `email` ⇒ rendrer `<SendCodeForm>`.
- `SendCodeForm.tsx`: `<Input id="email" label={t('emailLabel')}>`.
- `components/ui/Input.tsx`: rendrer `<label htmlFor={id}>{label}</label>` + `<input id={id}>` ⇒ ekte
  label-assosiasjon ⇒ `getByLabel('E-post')` treffer.
- `messages/no.json` `auth.sendCode.emailLabel` = **"E-post"** (linje 2371). ✓

Resten av helperen matcher fortsatt ekte elementer: «Send meg kode» (`submitButton`, l.2373) → verify-steg →
«Kode» (`codeLabel`, l.2380, på `<Input id="token">`) → «Logg inn»-knapp (`submitButton`, l.2381).
Bekreftet at `/login` ikke har noen «Logg inn»-heading (eneste `<h1>` = «Tørny» i `BrandHero.tsx`) — den gamle
asserten var genuint umulig å oppfylle. Begge kopier identisk endret.

### F2 — RESOLVED ✅

Ny assert leser `before = textContent()` FØR +1-klikket, så `not.toHaveText(before)`. Bekreftet meningsfullt mot
`components/hole/ScoreCard.tsx`:

- `isGhost = score == null; displayedNumber = isGhost ? par : score` (l.87–88) ⇒ utgangstilstand viser `par`,
  aldri «—» (bekrefter at gammel `≠ '—'`-assert var vakuøs).
- `onStepperPlus` setter `clamp((score ?? par) + 1, …)` (l.105) ⇒ etter klikk = `par + 1`, alltid forskjellig fra
  ghost-`par` (par+1 < `MAX_STROKES`). +1-knappens `aria-label="+1"` (l.282) matcher `getByRole('button',{name:'+1'})`.

Endrings-asserten beviser nå faktisk at slaget registrerte.

### F3 — RESOLVED ✅

Spec-en spør nå `course_holes` for banens `course_id` og seeder én score per hull for begge spillere
(+ `expect(holeNumbers.length).toBeGreaterThan(0)` sanity-guard). Bekreftet at dette gjør runden tellende:

- `lib/league/getLigaSnapshot.ts` bygger `holes` fra `course_holes` per `course_id` (l.180–183, 289) ⇒
  `holeCount = holes.length` = samme sett spec-en spør.
- `lib/scoring/modes/soloStrokeplay.ts`: `holesPlayed` += 1 per hull med non-null gross (l.51–62) ⇒ score på
  alle hull ⇒ `holesPlayed === holeCount`.
- `lib/league/roundScoring.ts` l.73 `if (line.holesPlayed !== holeCount) continue;` ekskluderer ikke lenger ⇒
  begge spillere får `LeagueRoundPlayerScore` ⇒ `liga-standings` rendrer tall, ikke tomme celler.

### Regresjon — INGEN

Den delte `signInViaOtp`-endringen påvirker alle autentiserte spec-er. Alle kallere er på `/login` når helperen
kjører:

- Direkte `goto('/login?next=…')`: liga-create (l.39), liga-public (l.109), liga-finished (l.288),
  cup-lifecycle (l.153), golden-path (l.59, 98), manual-approval admin (l.81).
- Via proxy-bounce fra `/signup/[shortId]` med `await expect(page).toHaveURL(/\/login/)` før helperen:
  open-register, manual-approval (spiller), self-withdraw, invite-only.

`getByLabel('E-post')` finnes på alle disse ⇒ strikt forbedring. (Den gamle heading-asserten ville faktisk ha
brutt ALLE disse eksisterende spec-ene også — fixen reparerer dem på kjøpet.)

### Gates

- `npx tsc --noEmit` → **exit 0**
- `npx playwright test --list` → **exit 0**, 59 tester / 28 filer; alle 3 nye spec-er lastet
  (`scoring-golden-path`, `cup-lifecycle`, `liga … finished-flight #647`).

## Verdikt: **ACCEPT**

Alle tre funn (F1 blokker, F2, F3) er løst ved konstruksjon, begge `signInViaOtp`-kopier er identisk fikset,
ingen regresjon på eksisterende kallere, typer + playwright-load grønt. Ingen nye funn. Gjenstår kun eiers
grønt-kjøring + CI-aktivering (per kontraktens verifikasjons-grense).
