# Spec: Smart defaults i spill-wizarden — forhåndsutfyll tee-off + verdi-preview på publiser-CTA (#1171)

## Problem
UX Peak-prinsippet **smart defaults**: ikke gi folk blanke felt (70–90 % endrer aldri en default og leser den som anbefaling), og la CTA-en vise verdi. Wizarden gjør allerede mye riktig (4 spillere, 100 % allowance, auto-navn, lag-størrelse per format). To hull igjen:
1. **Tee-off dato/tid starter blankt** — admin må åpne date-pickeren og fylle alt fra null.
2. **Publiser-knappen er nøytral** («Publiser») — den oppsummerer ikke hva som lages.

To **uavhengige** deler; kan leveres hver for seg (egne commits/PR-er om ønskelig).

## Research Findings (in-repo, verifisert)
- Tee-off-state: `app/[locale]/admin/games/new/useGameFormState.ts:344` — `useState<string>(initialValues?.scheduled_tee_off_at ?? '')`. Tom streng = «ikke satt».
- **Hydration-felle (#928):** `useGameFormState.ts:347-356` — `canPublish` SSR-rendres inn i `disabled`; `Date.now()` under render gir hydration mismatch. Repoet bruker `useSyncExternalStore`-mount-flagg (`hasMounted`) og unngår `useState+useEffect` fordi lint-regelen `react-hooks/set-state-in-effect` er aktiv (kommentar `:350`).
- `min`-nudge settes **imperativt** i en effekt etter mount, aldri som render-prop, nettopp for å unngå hydration mismatch: `BasicsSection.tsx:98-103` (`getLocalDatetimeMin()`, `:41-46`). Inline past-error: `BasicsSection.tsx:192` (`state.teeOffInPast`).
- Create-flyten: server-komponenten `new/page.tsx` (`GameFormBody`) sender `initialValues={cupContext ? buildCupInitialValues(cupContext) : undefined}` til `GameWizard`. **Edit/utkast er egen rute** — `GameFormBody` brukes ikke der; persistert verdi kommer via `initialValues.scheduled_tee_off_at` (`GameForm.tsx:69`).
- Publiser-knappen bor i `sections/ReadyStep.tsx:466-478` (`t('publishButton')`). Alt for en verdi-preview finnes allerede i scope: `modeSummaryLabel(gameMode)` (`:187`), `selectedCourse?.name`, `selectedPlayerIds.length`, `teamsSummary()`.
- Oslo-tid: `lib/format/teeOff.ts osloParts(date)` gir `{ weekday, hour, day, month(0-idx), year }` TZ-stabilt (Vercel = UTC).

## Prior Decisions
- #928 (`.forge/contracts/928-teeoff-entry-validation.md`): tee-off-past-vakt lever i state-maskinen; client = nudge, server = autoritet. Defaulten må aldri sette en tee-off i fortid (den ville selv trigge `teeOffInPast` og blokkere publisering).
- «Client-state fra initialData trenger key for remount» (MEMORY) — vi rører ikke det; defaulten leveres som ren initial-verdi, ikke live-push.

## Design

### Del 1 — forhåndsutfyll tee-off (server-beregnet default, hydration-trygt)
- **Beregn defaulten på serveren, aldri i render/effekt.** Ny ren helper `defaultTeeOffAt(now: Date): string` (foreslått `lib/games/defaultTeeOff.ts`, Type A / TDD): returnerer **førstkommende lørdag kl. 09:00 Oslo** som tidssone-naiv `datetime-local`-streng `YYYY-MM-DDTHH:mm` via `osloParts`. Er det allerede lørdag men før 09:00 → i dag 09:00; ellers neste lørdag.
- I `new/page.tsx GameFormBody`: flett defaulten inn i `initialValues.scheduled_tee_off_at` **kun for fresh create** (behold cup-prefyll: `{ scheduled_tee_off_at: defaultTeeOffAt(new Date()), ...(cupContext ? buildCupInitialValues(cupContext) : {}) }`). `useState`-initialisereren leser da en deterministisk prop → **SSR og klient rendrer samme streng, ingen mismatch, ingen set-state-in-effect**.
- **Ikke overskriv edit/utkast:** create-ruten er isolert fra edit-ruten (egen server-komponent), så persistert verdi røres aldri. Beholder eksisterende `?? ''`-fallback for alle andre kall-steder.
- `min`-nudge (`BasicsSection.tsx`) står urørt; lørdag 09:00 > now, så defaulten passerer både `min` og `teeOffInPast`.

### Del 2 — verdi-preview på publiser-CTA
- I `ReadyStep.tsx`: bytt knapp-labelen til en verdi-oppsummering når nok er kjent, f.eks. «Publiser — 4 spillere · Best ball · Byneset». Gjenbruk `selectedPlayerIds.length`, `modeSummaryLabel(gameMode)`, `selectedCourse?.name`. Mangler bane → utelat det segmentet (graceful). Fall tilbake til dagens `t('publishButton')` når roster er tomt / bane uvalgt.
- Ny i18n-nøkkel `wizard.ready.publishButtonWithSummary` (ICU, nb+en) med `{count}`, `{mode}`, `{course}`. Draft-knappen (`:507`) uendret.

## Edge Cases & Guardrails
- Default tee-off må være i **fremtiden** (lørdag 09:00) — verifiser at den ikke trigger `teeOffInPast`/blokkerer publish rett etter mount.
- Hydration: defaulten er en server-prop, ikke `Date.now()` i render → ingen mismatch. Legg en kort kode-kommentar som siterer #928/#1171 så ingen «forenkler» til en render-side-beregning senere.
- Cup-link-create beholder sitt prefyll (navn/mode/allowance) + får tee-off-defaulten på toppen.
- CTA-preview: unngå tom «· ·»-kjede; bygg segmentene betinget. Ingen tall uten `tabular-nums`-behov (ren tekst-label).
- Admin som bevisst tømmer tee-off-feltet: mount-effekten kjører ikke på nytt (default er initial-verdi, ikke effekt) → feltet forblir tomt slik brukeren valgte.

## Key Decisions
- **Server-beregnet default via `initialValues`** (ikke client effekt) — eneste måten som samtidig unngår hydration-mismatch OG `react-hooks/set-state-in-effect`-lint-regelen repoet håndhever.
- **Lørdag 09:00 som default** — helgerunde er det klart vanligste for kompis/klubb-turneringer; 09:00 er en typisk første start-tid.
- **CTA-preview i ReadyStep, ingen ny komponent** — all data finnes allerede i steg 5-scope.

**Claude's Discretion:**
- Eksakt copy/segment-rekkefølge på preview-labelen (humanizer-vasket); om «spillere» forkortes.
- Om default-tidspunktet er 09:00 eller 10:00, og om «i dag hvis lørdag før 09:00» beholdes eller alltid = neste lørdag.
- Filplassering for `defaultTeeOffAt` (egen fil vs. tillegg i `lib/format/teeOff.ts`).
- Om del 1 og del 2 blir én PR eller to.

## Success Criteria
- [ ] Fersk «opprett spill» viser tee-off forhåndsutfylt til førstkommende lørdag 09:00 (Oslo) uten hydration-warning i konsollen (verifiser på staging + `npm run build`-render).
- [ ] Defaulten trigger ikke `teeOffInPast`; «Publiser» er ikke blokkert av tee-off rett etter mount.
- [ ] Rediger/utkast-flyten viser fortsatt den lagrede tee-off-en (ikke overskrevet av defaulten).
- [ ] Publiser-knappen viser en verdi-oppsummering («Publiser — N spillere · <format> · <bane>») når roster ≥ 1 og bane valgt; faller pent tilbake ellers.
- [ ] `defaultTeeOffAt` har Type A-test (lørdag-før/etter-09:00, søndag, midt i uka) som asserterer Oslo-wall-clock-strengen.

## Gates
- [ ] `npx tsc --noEmit` grønn
- [ ] `npm run lint` grønn (ingen ny `set-state-in-effect`)
- [ ] `npx vitest run` for berørte co-located tester: `defaultTeeOff` (ny, Type A) + `useGameFormState`/`GameWizard`/`ReadyStep`-konsumenter forblir grønne
- [ ] Ny norsk copy → `humanizer:humanizer` før commit; nb+en next-intl-nøkler
- [ ] Bruker-synlig → `feat`, **minor** bump + CHANGELOG-linje (Funksjoner)
- [ ] Staging-klikkrunde av opprett-spill-flyten (tee-off forhåndsutfylt + CTA-preview) FØR merge

## Files Likely Touched
- `lib/games/defaultTeeOff.ts` (+ `.test.ts`) — ren default-helper
- `app/[locale]/admin/games/new/page.tsx` — flett default inn i create-`initialValues`
- `app/[locale]/admin/games/new/sections/ReadyStep.tsx` — verdi-preview på publiser-knappen
- `messages/no.json` + `messages/en.json` — `wizard.ready.publishButtonWithSummary`
- `package.json` (+ lock) + `CHANGELOG.md`

## Out of Scope
- Endring av `min`-nudge, `teeOffInPast`-logikken eller server-guarden (#902/#928 — uendret).
- Andre wizard-defaults (allerede gode: spillerantall, allowance, auto-navn).
- Liga-oppsett (#1178) og ankereffekt (#1175) — egne kontrakter.
- Rediger-sidens IA/lengde (#909).
