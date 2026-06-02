# Evaluering: #401 — Profil-revamp v2

VERDICT: ACCEPT

Evaluert av uavhengig, skeptisk reviewer mot kontrakten `.forge/contracts/401-profil-revamp-v2.md`.
Branch `issue-401-profil-revamp-v2` @ `294b13a`. Merge-base mot origin/main = `6f0747c`.

## Auth-gate-begrensning (eksplisitt)

`/profile` og `/complete-profile` redirecter til `/login` før body-render (linje `app/profile/page.tsx:67-69`, `app/complete-profile/page.tsx:43-45`). Det finnes ingen test-credentials, så Playwright/preview kan IKKE eksersere de innloggede sidene. UI-kriterier (K1, K2, K3-visuelt, K5, K6, K8) er derfor verifisert **strukturelt** (JSX + Tailwind-klasser) + via `npm run build`. Eier verifiserer visuelt live i prod-Chrome etter deploy, per kontrakt-note.

## Per-kriterium

### K1 — Profil-header — PASS
`app/profile/page.tsx:204-214`: initial-sirkel (`displayName.trim().charAt(0).toUpperCase() || '?'`, linje 188) + navn (`font-serif text-lg`) + hcp i Golfbox-format. `hcpDisplay` (linje 189-195) bruker `fromSignedHcp(profile.hcp_index)` + `formatGolfboxHcp` → lagret −1.5 vises «+1,5», 25.5 vises «25,5», `tabular-nums` på hcp-linja (linje 212). E-post flyttet til grå skrivebeskyttet linje nederst i kortet: `ProfileFormBody.tsx:269-271` («E-post: … · kan ikke endres»).

### K2 — Kallenavn + Handicap på samme rad — PASS
`ProfileFormBody.tsx:158-207`: `<div className="flex items-start gap-3">` med Kallenavn i `flex-1` (placeholder «Valgfritt», linje 159/165) + Handicap i `w-[148px] shrink-0` (linje 171). Full-bredde ferskhets-linje under raden (linje 212-228): «Handicap oppdatert {nb-dato}» via `toLocaleDateString('nb-NO', {day,month})`, og stale-varsel «⚠ Handicap ikke oppdatert på over en måned» via `isHandicapStale(handicapUpdatedAt)` (`lib/handicap/staleness.ts:16` finnes).

### K3 — Plusshandicap-chip — PASS (kritisk, traced)
«+»-chip (`ProfileFormBody.tsx:179-191`, `aria-pressed={isPlus}`, ren toggle uten fortegn-tasting). Ingen statisk hjelpetekst. Live «Lagres som +1,5 · plusshandicap» (linje 212-219) via `formatGolfboxHcp(magnitudeNum, true)`. Innlasting via `splitInitialHcp`→`fromSignedHcp` (linje 75-83/92). Onboarding-paritet: `OnboardingHcpField.tsx` identisk mønster, `hcp_plus` hidden input til stede (linje 57). `min={0}` på magnitude-input begge steder.

Full sti-trase (verifisert med kjørt harness, ikke builderens påstand):
- Golfbox «+1,5» (chip på, «1,5») → submit `hcp_index=1.5, hcp_plus=on` → server `toSignedHcp(1.5,true)` = **−1.5** ✓
- Normal «12,4» (chip av) → **+12.4** ✓
- Lagret −1.5 → chip ON + magnitude 1.5 ✓; lagret −10 → chip ON + 10 ✓
- Scratch 0 + chip på → 0 (Object.is(...,−0)===false) ✓ — ingen −0-lekkasje
- **Ingen sti der plusshandicap stille blir positiv:** magnitude er alltid ≥0 klient-side, fortegn settes utelukkende fra `hcp_plus`-flagget. Eneste avvik er REJECT.

### K4 — Fortegns-logikk testet + boundary — PASS
`lib/handicap/sign.ts` + `sign.test.ts`: 21 assertions (toSigned/fromSigned/format/round-trip; 0, ±10, 54, −0-edge). Server-boundary verifisert med harness:
- magnitude 0..54 sjekkes, deretter signert −10..54 sjekkes (begge actions, `HCP_MIN=-10`, `HCP_MAX=54`).
- Plus magnitude 12 → −12 → **REJECT(signed)** = `hcp_invalid` ✓ (ingen ugyldig plus-hcp slipper gjennom)
- Plus magnitude 10 → −10 akseptert (boundary) ✓; 10,5 → REJECT ✓
- Negativ tastet «-3» (selv om `min=0` klient) → REJECT(magnitude) server-side ✓
- 55 → REJECT(magnitude) ✓

### K5 — Segmenterte felt + FormData-wiring — PASS (traced)
`components/ui/SegmentedField.tsx` brukt for kjønn+klasse (`ProfileFormBody.tsx:248-265`). Kontrollert state → skjulte input:
- `hcp_plus` (linje 210, top-level — alltid i DOM)
- `gender` (linje 256) + `level` (linje 265) — inne i `profile-more-settings`-div-en som bruker Tailwind `hidden` (=`display:none`) ved kollaps (linje 246). Felt med `display:none` forblir montert og serialiseres i FormData → gender/level droppes ALDRI ved lagring uavhengig av disclosure-tilstand.
- Server leser alle tre via `formData.get(...)` (`actions.ts:21-24`).
`dirty` (linje 122-128) derivert fra alle seks state-deler inkl. `isPlus`, `gender`, `level`. Build grønn ⇒ FormData/hidden-input-typer OK.

### K6 — «Golfprofil»-omdøping + anker — PASS
Disclosure-knapp med tekst «Golfprofil» (`ProfileFormBody.tsx:238-240`). `showMore` default `initial.gender === null` (linje 104) → åpen når kjønn mangler. `SegmentedField id="kjonn"` (linje 249) legger id-en på `<fieldset id="kjonn">` (`SegmentedField.tsx:38`) — anker-mål treffer synlig felt. Ekstra robusthet: `useEffect` hashchange-handler force-åpner + scroller (linje 106-120). `GenderSoftPrompt` lenker til `#kjonn` (`page.tsx:253-258`), vises kun når gender null (linje 241). Hint én linje (linje 254). Tester dekker aria-expanded + åpen-når-null + segmenterte radio-knapper.

### K7 — Månedsbrev flyttet + decoupling — PASS (kritisk, regression-sjekket)
**Decoupling bekreftet:** Gammel `app/profile/actions.ts` (origin/main) hadde `const productUpdatesOptIn = formData.get('product_updates_opt_in') === 'on'` + `product_updates_unsubscribed_at: productUpdatesOptIn ? null : now`. Den nøyaktige regresjons-faren (manglende checkbox → opt-out → hver profil-lagring avmelder bruker) er borte: `grep product_updates app/profile/actions.ts` gir kun en kommentar (linje 58), ingen lese/skrive-logikk. Ny eier `toggleProductUpdates` i `app/innboks/actions.ts:37-47` (`null`=på, timestamp=av). `app/innboks/page.tsx:30-35` leser `product_updates_unsubscribed_at` → `monthlyOptIn = (... == null)` → sendes som `initialOptIn`. `MonthlyDigestToggle.tsx` har optimistisk `useState` + `useTransition`-wrappet action-kall (linje 11-22) — wiring korrekt. Copy «Månedsbrev» / «Nytt i Tørny på e-post», ingen «maks én mail».

### K8 — Logg ut + personvern — PASS
`page.tsx:149-159` `AccountActions`: `<Button type="submit" variant="secondary" className="w-full">Logg ut</Button>` i `<form action="/logout" method="post">`. Personvern-`<p>`-prosa slettet (ingen forekomst i page.tsx eller ProfileFormBody.tsx).

### K9 — Ingen funksjonalitet tapt — PASS
Alle felt kontrollert + submittes (verifisert under K5). Gammel test-garanti «verdier sendes fortsatt med ved lagring når kollapset» bevart strukturelt (display:none-felt serialiseres). «Invitér en venn»-kort + MER-/konto-lista (Min historikk, Klubbstatistikker, InstallButton, Eksporter data, Slett konto) urørt (`page.tsx:121-137`, `281-312`). Build grønn. Onboarding beholder navn/kallenavn/kjønn/spillerklasse-felt + `next`-round-trip (test bevart).

### K10 — Gater grønne — PASS
Se gate-output under.

## Gate-output (tails)

```
$ npx vitest run app/profile app/innboks app/complete-profile components/ui lib/handicap
 Test Files  11 passed (11)
      Tests  84 passed (84)
```
(Kontrakten oppga 144/144 — det var over bredere scope; den scope-ede gate-kommandoen gir 84, alle grønne.)

```
$ npx eslint app/profile app/innboks app/complete-profile components/ui/SegmentedField.tsx lib/handicap
app/profile/statistikk/page.tsx
  226:27  warning  'userId' is defined but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (0 errors, 1 warning)   EXIT: 0
```
(0 errors; den ene warning-en er pre-eksisterende i statistikk/page.tsx — akseptabel per oppdrag.)

```
$ npm run build
✓ Compiled successfully in 3.0s
✓ Generating static pages using 9 workers (29/29) in 199ms
FINAL BUILD EXIT: 0
```

## Scope / kvalitet

- **Utenfor scope respektert:** ingen «din aktivitet»-teaser, ingen `lib/scoring/`-endring, ingen andre varsel-innstillinger enn månedsbrev.
- Ingen død kode funnet. Hidden-input `hcp_plus` til stede i BÅDE profil og onboarding.
- `min={0}` på magnitude-input + server-validering avviser negative/out-of-range korrekt (verifisert med harness).

## Funn

### Lav (merge-hygiene, IKKE builder-defekt) — pre-rebase-note
`git diff origin/main..HEAD` viser `.claude/settings.json` som **slettet** (17 linjer, en PreToolUse README-freshness-hook). Dette er et main-flyttet-frem-artefakt, ikke en branch-endring:
- Merge-base = `6f0747c`; fila fantes IKKE der.
- Branchen rørte aldri fila (`git diff 6f0747c..HEAD -- .claude/settings.json` er tom).
- Fila ble lagt til på main ETTERPÅ i `ad24332` (`chore(tooling): remind to refresh README`).

Konsekvens: hvis branchen merges uten rebase, kunne den re-introdusere sletting av en hook som finnes på main. **Anbefaling:** rebase branchen på `origin/main` før merge (per prosjektets «rebase-after-merge»-disiplin) — da forsvinner slettingen fordi fila allerede er på plass og branchen ikke berører den. Ingen kode-defekt i selve #401-arbeidet.

Ingen andre funn.
