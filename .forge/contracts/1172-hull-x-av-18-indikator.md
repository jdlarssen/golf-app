# Spec: Fremdrift under runden — «hull X av 18»-indikator (#1172)

## Problem

Hull-siden viser hull-nummeret isolert i `HoleHero`: kicker «HULL», stort 44px-tall,
«Par X», «indeks Y». Ingen «av 18», ingen fremdrift. Serveren regner `myCompletedHoles`,
men det rendres aldri. Interessant nok har *demoen* allerede en teller («Hull X av 3»),
mens den ekte runden mangler den. Prinsipp fra UX Peak-videoen: **goal-gradient /
synlig fremdrift** — å se hvor langt man er kommet skaper driv mot mål. Flyt 3 (spille
en runde), kjernesløyfa.

## Research Findings

- `components/hole/HoleHero.tsx:105-140` — header-raden er en `space-between`-flex: venstre
  (`leftStyle`, `alignItems:'baseline'`) = kicker «HULL» + `holeNumber` (44px); midt = valgfri
  `contextLine` (#639); høyre = `puttsToggle` (#939) + Par/indeks. Fil-kommentarene (26-40, 58-59)
  dokumenterer at midt/høyre-slottene er en bevisst plasskamp for å unngå en full-bredde rad som
  dytter 4. spillerkort under folden. → «av 18» må tuckes inn ved tallet, ikke som egen rad.
- Kicker `holes.entry.hullKicker` = «HULL» (`messages/no.json:1875`); par/indeks `hullPar`/`hullIndex`.
- **Demoen** har alt telleren: `DemoGame.tsx:100` bruker `demo.holeKicker` = «Hull {number} av {total}»
  (`no.json:4889`). Copy-mønster å gjenbruke: «... av {total}».
- **Runder er alltid 18 hull.** `lib/games/deliveryStatus.ts:13` `TOTAL_HOLES = 18`; `HoleClient.tsx:730`
  `roundComplete = ... >= 18`; scores gated `hole_number between 1 and 18` (#376). Ingen
  `games.hole_count`-kolonne; `courses.holeCount` er bane-oppsett, ikke rundelengde. → **N = 18 konstant**,
  ingen 9-hulls-forgrening.
- Kallsted `HoleClient.tsx:899-907` sender `holeNumber={currentHole}` (+ par/index/contextLine/puttsToggle).
  `myCompletedHoles` finnes i `HoleClient` (prop, `page.tsx:262`/`:756`) men trådes IKKE inn i `HoleHero`.

## Prior Decisions

- **#639 (kontekst-banner) + #939 (putter-toggle):** begge tucket inn i header-radens
  ledige høyde nettopp for å slippe en egen rad. Ny indikator MÅ følge samme disiplin.
- **#376 Out of Scope:** «9-hulls spill — appen er 18-hull.» Bekreftet fortsatt sant.
- **Demo (#1042):** teller-copy «Hull {number} av {total}» er allerede etablert mønster.

## Design

Legg en liten, muted «av {total}»-suffiks rett etter det store hull-tallet, inne i
`leftStyle`-kolonnen (som alt er `alignItems:'baseline'`, så suffikset legger seg pent på
grunnlinja ved siden av 44px-tallet). Ingen ny rad, ingen fremdriftslinje i v1 — kun
tydeliggjøringen issuet ber om.

- Ny i18n-nøkkel i `holes.entry`, f.eks. `hullTotalSuffix` = «av {total}» (no) /
  «of {total}» (en). Alternativt «/ {total}» — eksakt glyf/ordlyd = Claude's Discretion.
- `HoleHero` får ny valgfri prop `totalHoles?: number`; når satt rendres suffikset.
  `HoleClient.tsx:899` sender `totalHoles={TOTAL_HOLES}` (importert fra
  `lib/games/deliveryStatus.ts`, single source of truth — ikke ny hardkodet 18).
- Styling: `fontVariantNumeric:'tabular-nums'`, `color:'var(--text-muted)'`, mindre
  fontstørrelse enn hull-tallet. On-brand, diskret.

## Edge Cases & Guardrails

- Ingen `contextLine` (individuelle slag-/stableford-format) → suffikset står alene ved
  tallet; verifiser at det ikke kolliderer med `puttsToggle` til høyre (de er i hver sin
  flex-ende, så trygt).
- Lang `contextLine` (Round Robin-konstellasjon) → midt-kolonnen har `minWidth:0` og
  wrapper; suffikset i venstre-kolonnen er `flexShrink:0` på tallet, så det klemmes ikke.
- Verifiser på mobil (375px) at header-raden ikke wrapper til to linjer med suffikset på.

## Key Decisions

- **N = 18 konstant**, hentet fra `TOTAL_HOLES` (ikke ny magisk 18) — appen er 18-hull.
- **Suffiks ved tallet, ikke egen rad** — respekterer #639/#939-plasskampen.
- **Ingen fremdriftslinje / prosent i v1** — issuet ber om «liten tydeliggjøring»;
  match effort til vurderingen «moderat, ikke kritisk».

**Claude's Discretion:**
- Eksakt glyf/ordlyd: « av 18» vs «/18» vs superskript — velg det som ser roligst ut på
  mobil; kjør copy gjennom humanizer.
- Om suffikset skal sitte i `leftStyle` etter tallet eller som en egen liten linje under
  kicker-en — velg minst påtrengende.
- **Spillerens egen fremdrift («X hull igjen» fra `myCompletedHoles`):** vurder om det
  hører hjemme her. Anbefaling: HOLD DET UTE av v1 (annet konsept enn posisjon-i-runden,
  krever å tråde `myCompletedHoles` inn i `HoleHero`, og risikerer scope-kryp). Hvis
  bygget: eget, tydelig avgrenset tillegg — ikke bland med «av 18»-tallet.

## Success Criteria

- [ ] `HoleHero` viser «hull-tall + av {total}» der `total` avledes av `TOTAL_HOLES` (18) —
      verifisert i browser på staging.
- [ ] Indikatoren tar INGEN egen full-bredde rad; header-raden ellers visuelt uendret — mobil 375px.
- [ ] i18n-nøkkel i både `no.json` og `en.json` (catalogParity grønn); humanizer kjørt.
- [ ] Ingen regresjon i `contextLine`/`puttsToggle` — Round Robin- og individuelt-stableford-hull OK.

## Gates

- [ ] `npx tsc --noEmit` grønn (ny valgfri prop treffer alle `HoleHero`-kall).
- [ ] `npm run lint` grønn (endrede filer).
- [ ] `npx vitest run components/hole app/[locale]/games/[id]/holes` (co-located; ingen
      NY render-test — HoleHero-endringen er additiv, maks én test per komponent gjelder).
- [ ] `npm run build` grønn.
- [ ] Bruker-synlig → staging-klikkrunde av hull-flyten før merge.
- [ ] `feat` → MINOR-bump + CHANGELOG Funksjoner-linje.

## Files Likely Touched

- `components/hole/HoleHero.tsx` — ny valgfri `totalHoles`-prop + muted suffiks.
- `app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx` — send `totalHoles={TOTAL_HOLES}`.
- `messages/no.json` + `messages/en.json` — ny `holes.entry.hullTotalSuffix`-nøkkel.
- `package.json` + `CHANGELOG.md` — MINOR-bump + linje.

## Out of Scope

- Fremdriftslinje / prosent-bar (issuet nevner «evt.» — ikke i v1).
- «X hull igjen»-fremdrift fra `myCompletedHoles` (Claude's Discretion; anbefalt utsatt).
- 9-hulls runder (appen er 18-hull; egen større endring hvis det noen gang blir aktuelt).
- Endring i demoens teller (`demo.holeKicker` — allerede korrekt).
