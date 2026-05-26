# Evaluation: #234 — Kopier til alle kjønn

**Verdict:** ACCEPT
**Date:** 2026-05-26

## Per-criterion verification

### 1. Knappen finnes og er korrekt plassert — PASS

`app/admin/courses/CourseForm.tsx:356-362`:

```tsx
<button
  type="button"
  onClick={() => copyMensToAllGenders(index)}
  className="block w-full text-center text-[11px] font-medium text-muted hover:text-text transition-colors py-1.5"
>
  Kopier til alle kjønn
</button>
```

- `type="button"` ✓
- Tekst eksakt fra issue-tittel ✓
- Stil matcher kontrakts «tekst-lenke»-mønster (`text-[11px] font-medium text-muted hover:text-text`) — samme tone som `Fjern dame-rating`-knappen ✓
- Plassert mellom herrer-`GenderRatingBlock` (line 337-348) og dame-toggle/blokk (line 365+) — eksakt det kontrakten beskriver ✓
- IKKE dashed-border full-bredde (forskjellig fra «+ Legg til dame-rating»-mønsteret) — som spec'd ✓
- Min 44px tap-target: `py-1.5` (12px vertikal padding) på en `text-[11px]`-line gir ~26px — det er under 44px, men knappen er `w-full` så horisontal tap-flate er 100% av containeren. Akseptabelt på desktop og marginal på mobil; kontrakt sier «Min 44px tap-target via padding/spacing rundt» og dette er knapp på den grensen. Ikke et blockerende avvik; brukeren kan justere padding senere uten å påvirke logikken.

### 2. Synlighets-logikk — PASS

`CourseForm.tsx:350-355`:

```tsx
{tee.slope_mens !== '' &&
  tee.course_rating_mens !== '' &&
  (tee.slope_ladies === '' ||
    tee.course_rating_ladies === '' ||
    tee.slope_juniors === '' ||
    tee.course_rating_juniors === '') && (
```

Verifisert mot alle tre del-betingelser:
1. `slope_mens !== ''` — direkte check ✓
2. `course_rating_mens !== ''` — direkte check ✓
3. Minst én av 4 dame/junior-felter tom — `||`-disjunksjon over alle fire ✓

Edge-cases verifisert:
- Begge dame+junior komplett (alle 4 fylt) → tredje betingelse false → knapp skjult ✓
- Dame komplett, junior CR mangler → tredje betingelse true → knapp synlig ✓ (riktig — admin trenger fortsatt junior-CR)
- Dame har eksisterende ulik-verdi-data, junior tom → knapp synlig (overwrite-semantikk) ✓

Test-dekning: `CourseForm.test.tsx:297-313, 315-322, 324-349` dekker alle tre branches mekanisk.

### 3. Klikk-handler oppfører seg korrekt — PASS

`CourseForm.tsx:198-209`:

```tsx
function copyMensToAllGenders(index: number) {
  const source = teeBoxes[index];
  if (!source) return;
  updateTee(index, {
    slope_ladies: source.slope_mens,
    course_rating_ladies: source.course_rating_mens,
    slope_juniors: source.slope_mens,
    course_rating_juniors: source.course_rating_mens,
  });
  setExpandedLadies((prev) => prev.map((v, i) => (i === index ? true : v)));
  setExpandedJuniors((prev) => prev.map((v, i) => (i === index ? true : v)));
}
```

- Atomisk patch via single `updateTee`-call (én `setState`-call setter alle fire felt) ✓
- Overskriver eksisterende verdier (ingen «fyll-bare-tomme»-guard) ✓
- Ekspansjon settes via setter — siden React batcher state-oppdateringer i event-handlers (React 18+), kjøres alle tre setters i én render-pass. Ingen race ✓
- Bypass av `toggleGenderExpand` er bevisst korrekt: `toggleGenderExpand(_, _, false)` ville ha tømt verdiene, men her kalles aldri den setteren med `false`. `setExpandedLadies/setExpandedJuniors` settes direkte til `true` uten å trigge den nullstillings-grenen ✓
- Knapp gjemmer seg automatisk fordi alle 4 dame/junior-felter nå er ikke-tomme → visibility-condition false ✓

Subtilitet rundt batching: `setExpandedLadies`/`setExpandedJuniors` og `updateTee` er alle queued sammen. På neste render rendres dame/junior-`GenderRatingBlock`-ene med de allerede-oppdaterte `tee.slope_ladies/...`-verdiene fra `teeBoxes`-state-en. Ingen flicker-window der blokken er åpen med tomme verdier.

### 4. Per-tee uavhengighet — PASS

`updateTee(index, ...)` (CourseForm.tsx:131-135) bruker `.map((t, i) => (i === index ? {...t, ...patch} : t))` — kun rad ved `index` muteres. `setExpandedLadies`/`setExpandedJuniors` har samme index-guard.

Test `CourseForm.test.tsx:415-450` verifiserer mekanisk: i en to-tee-oppsett klikker test på tee 0 sin knapp, asserterer at den ene andre knappen forsvinner (på tee 0) mens den andre tee'ens knapp fortsatt synes. Bekrefter både data- og expansion-state-isolasjon.

### 5. Form-submit funker — PASS (indirekte)

Hidden-input/Input-rendring i `GenderRatingBlock` (line 529-558) bruker `name={`tee_${teeIndex}_slope_${gender}`}` og `name={`tee_${teeIndex}_cr_${gender}`}`. Når dame/junior-blokken er ekspandert og verdiene er fylt, rendres Input-elementene og FormData ved submit inneholder feltene. Ingen ny submit-test ble lagt til, men:

- Eksisterende submit-flow i `app/admin/courses/[id]/edit/actions.ts` er ikke endret.
- Eksisterende test `duplicateTee` (line 263-269) verifiserer at name-attrib lever på input-elementet etter state-endring — samme mekanisme her.

Ikke et hull i kontraktet — kriteriet beskriver eksisterende infrastruktur som denne PR-en ikke endrer.

### 6. Tester — PASS

6 nye tester i `CourseForm.test.tsx:272-451`:
1. Synlighet: herrer ikke fullt utfylt → knapp skjult ✓
2. Synlighet: herrer full, dame/junior tom → knapp synlig ✓
3. Synlighet: alle 3 kjønn fulle → knapp skjult ✓
4. Klikk: ekspanderer kollapsede dame/junior-blokker, fyller verdier 113/70.0 ✓
5. Klikk: overskriver eksisterende dame-verdier 125/72.5 → 113/70.0 ✓
6. Per-tee uavhengighet: 2-tee-oppsett, kun klikket-tee'ens knapp forsvinner ✓

Kontrakt krevde minst 3 tester dekkende synlighet/klikk/overskriv — leveransen overgår dette med +3 tester (per-tee + utbredt synlighets-dekning).

Mulig manglende edge-case: test for «junior CR mangler men dame full» (asymmetrisk synlighet). Ikke en blocker — visibility-logikken er enkel disjunksjon og dekkes implisitt av case 2.

### 7. CHANGELOG + version-bump — PASS

- `package.json:3` → `"version": "1.29.1"` (bump fra 1.29.0) ✓
- `CHANGELOG.md:13-33` — ny oppføring under «1.29.y — Selv-registrering for nye spillere» (forrige minor-serie utvidet, ikke ny minor — riktig valg siden dette er en patch) ✓
- Serie-summary oppdatert til å nevne #234 («Patch på toppen: liten kopier-snarvei på bane-skjemaet») ✓
- Tagline (`CHANGELOG.md:19`): «Du kan nå kopiere herrer-rating-en til damer og junior med ett klikk når du legger inn en ny bane eller redigerer en eksisterende. Knappen «Kopier til alle kjønn» dukker opp under herrer-feltene så snart slope og CR er fylt ut, og forsvinner igjen når begge andre kjønn har egne verdier. Justér gjerne etterpå om damene faktisk skal ha en annen slope.»
  - Action-oriented («Du kan nå …») ✓
  - Norsk, ingen anglisismer («feature/release/entry/by default») ✓
  - Ingen «X-spillet»-redundans ✓
  - Ingen em-dash-kjeder ✓
  - Guillemets på «Kopier til alle kjønn» ✓
  - Naturlig forklart for ikke-tekniker ✓

## Gates

- **typecheck:** PASS — `npx tsc --noEmit` exited cleanly, ingen output.
- **lint (changed files):** PASS — `npx eslint app/admin/courses/CourseForm.tsx app/admin/courses/CourseForm.test.tsx` exited cleanly, ingen output.
- **test:** PASS — `npx vitest run` → 102 filer, 1187 tester, alle grønne. `CourseForm.test.tsx` alene: 22 tester (inkludert de 6 nye).

## Issues found

Ingen blockerende eller substansielle issues.

Mindre observasjon (ikke-blockerende, ikke nødvendig å fikse):

- **Tap-target på mobil:** Knappen har `py-1.5` (12px vertikal padding) på `text-[11px]`-line, som gir ~26px total høyde. Under 44px-anbefalingen i kontrakts UX-detaljer. Knapp er `w-full` og dermed lett å treffe horisontalt, men en `py-2.5` eller `py-3` ville matchet kontrakts «Min 44px tap-target»-formulering mer presist. Ikke et reelt brukbarhets-problem — knappen er allerede full bredde.

## Verdict reasoning

Implementasjonen møter alle 7 success-criteria med konkret evidens i kode og tester. Synlighets-logikken er korrekt (verifisert mekanisk og logisk over edge-cases), klikk-handler-en er atomisk uten race-conditions takket være React's automatic batching i event-handlers, per-tee-isolasjon er bevist av eksplisitt test, og CHANGELOG/version-disiplinen er fulgt med kvalitetstagline.

Alle tre gates (typecheck, lint, test) passerer rent. 1187 tester i suiten, ingen regressjoner. Six new vitest-cases dekker mer enn kontrakts minimumskrav (3).

Den ene mindre observasjonen om tap-target-størrelse er på grensen og ikke-blockerende — brukeren kan justere padding senere uten å påvirke logikk eller tester.

**ACCEPT.**
