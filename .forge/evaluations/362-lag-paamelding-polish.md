# Forge-evaluering: #362 — Lag-påmelding (signup/team) polish

**Dato:** 2026-06-03
**Evaluator:** Forge (skeptisk, uavhengig verifikasjon)
**Branch:** `claude/epic-hamilton-b530aa` (base `origin/main`)
**Verdikt:** **ACCEPT**

Alle seks akseptkriterier (K1–K6) er uavhengig verifisert mot kode og kjørte gates. Ingen blokkerende funn. Ett benignt edge-case og noen ikke-blokkerende observasjoner er notert nedenfor.

---

## Per-kriterium

| Krit. | Status | Evidens |
|-------|--------|---------|
| **K1 — Inline-validering** | **PASS** | `teamFormValidation.ts:20-35` har `validateTeamName` (3–40, trim) + `validateSlotEmail` (EMAIL_RE). On-blur i `TeamRegistrationForm.tsx`: team-navn linje 253 (`onBlur` → `validateTeamName`), slot linje 352-361 (`onBlur` → `validateSlotEmail`, setter/sletter `slotErrors[idx]`). Inline-feil rendres per felt (linje 264-268, 417-421). Data bevares: alt er React-state (`teamName`, `slots`), ingen reset ved feil. Test «viser inline-feil for ugyldig e-post on-blur og blokkerer submit» grønn. |
| **K2 — Submit-blokkering** | **PASS** | `handleSubmit` (linje 116-162) validerer navn + slot-format + `findSlotConflicts` FØR `submitTeamRegistration`, og `return`-er ved feil uten å kalle action. Fokus til første ugyldige felt (`teamNameRef.current?.focus()` linje 138 / `slotRefs.current[firstBadSlot]?.focus()` linje 145). Dup/self fanges via `findSlotConflicts` (Type A-testet, 5 cases grønne). To UI-tester asserter eksplisitt `submitTeamRegistrationMock` **ikke** kalt (TeamRegistrationForm.test.tsx:126 og :143). |
| **K3 — Autocomplete** | **PASS** | `suggestionsFor` (linje 105-114) substring-matcher på `name`+`nickname`+`email`. Dropdown viser `candidateLabel` (navn + «kallenavn», linje 50-53) + `maskEmail(c.email)` (linje 407). Valg via `onMouseDown` (linje 385, før blur lukker lista) → chip med maskert e-post (linje 315-332). Test «foreslår co-players i lookup-modus og fyller slot ved valg» verifiserer forslag, maskert `ka•••@example.com`, chip (`Fjern Kari Nordmann`) OG submit-payload `{mode:'lookup', value:'kari@example.com'}`. |
| **K4 — Personvern + fallback** | **PASS** | `getTeamCandidates.ts` er ENESTE `from('users')`-kallet (linje 66) og scopes hardt: `.in('id', coPlayerIds)` der `coPlayerIds` kun stammer fra `game_players`-rader i kapteinens egne spill (`.neq('user_id', userId)`, linje 53). Aldri ufiltrert all-users-fetch. Modulen er `import 'server-only'` (linje 1). Runtime-verdien importeres KUN i `page.tsx` (server-komponent, linje 12+119); klient-komponenten bruker `import type { TeamCandidate }` (TeamRegistrationForm.tsx:7) — type-only, erased ved kompilering, lekker ikke server-modul til klient-bundelen (grønn prod-build bekrefter). `getTeamCandidates` kalles kun når `willRenderTeamForm` er sann (page.tsx:112-120). Email-modus («Inviter via e-post») beholdt (linje 308). |
| **K5 — Mode-aware «bli med»** | **PASS** | `joinEffect` ('instant'\|'approval') utledet i `team/page.tsx:55-56` fra `registration_mode === 'open'`, sendt til klienten i begge render-grenene (invited_unknown linje 127, captain/member linje 209). `TeamDashboardClient.tsx`: invited_unknown nextStep (linje 119-122) + suksess-melding (linje 134-135) + member-aksept-copy (linje 224-227 / 234-237) varierer på `joinEffect`. 3 render-tester (TeamDashboardClient.test.tsx) grønne. |
| **K6 — Gates + versjon** | **PASS** | Se Gate-resultater under. `package.json` 1.69.3 → 1.70.1. CHANGELOG har 1.70.0 (minor, Added: maskEmail/getTeamCandidates/teamFormValidation; Changed: form + page) og 1.70.1 (patch, «bli med»-copy), med tagline-blockquote + Teknisk-details og forrige serie wrappet i `<details>`. Commit-rekke: `chore(signup)` (helpers) → `feat(signup)` (K1–K4) → `feat(signup)` (K5) → `docs(forge)`. |

---

## Gate-resultater (faktisk kjørt)

| Gate | Kommando | Resultat |
|------|----------|----------|
| **ESLint** | `npx eslint <11 endrede .ts/.tsx>` | **EXIT 0** — rent, ingen advarsler. |
| **tsc** | `npx tsc --noEmit` | **2 feil, begge pre-eksisterende** i `app/complete-profile/actions.test.ts:84` og `app/profile/ProfileFormBody.test.tsx:51`. Bekreftet: `git diff origin/main...HEAD --name-only` inneholder IKKE disse filene. **Null feil i endrede filer.** |
| **Vitest** | `npx vitest run app/signup lib/users` | **86 passed (8 filer)**, 0 failed. Targeted re-run av de 4 nye/endrede test-filene: 42 passed. |
| **Build** | `npm run build` | **✓ Compiled successfully in 2.6s**, EXIT 0. `/signup/[shortId]` + `/signup/[shortId]/team` kompilerer. Eneste output er benign «inferred workspace root»-advarsel (lockfile-plassering, urelatert). |

---

## Funn

### Blokkerende
Ingen.

### Ikke-blokkerende / nits

1. **Benignt edge-case i submit-fokus ved konflikt på valgt co-player.** I `handleSubmit` kjører `findSlotConflicts` over ALLE slot-verdier inkl. `selected`. Hvis en valgt co-player kolliderer (f.eks. samme person valgt i to slots), peker `firstBadSlot` på den slot-en, men input-feltet rendres ikke for en valgt slot (chip vises i stedet), så `slotRefs.current[firstBadSlot]` er null og `?.focus()` no-op-er trygt (ingen crash). Konflikt-feilen rendres uansett under chip-en via `errorFor` → `conflicts[idx]` (linje 417), så submit blokkeres korrekt og feilen er synlig — kun fokus-hoppet uteblir. Lav sannsynlighet (kaptein ekskluderes fra kandidatene via `.neq('user_id', userId)`, så self-via-autocomplete er ikke mulig; dup krever å velge samme person to ganger). Ikke verdt et eget issue.

2. **`errorFor`-presedens (linje 99): `slotErrors[idx] ?? conflicts[idx]`** — format-feil vinner over konflikt-feil. Korrekt prioritering: en malformert e-post kan ikke samtidig være en gyldig duplikat, og bruker bør fikse formatet først. `findSlotConflicts`-testen «prioriterer egen-e-post over duplikat» dekker intern presedens. Ingen handling nødvendig.

### Scope / gold-plating
Ingen scope-kryp observert. Implementasjonen holder seg til kontraktens «Innenfor»-liste: ingen friends-system, ingen `RegistrationForm.tsx`-endring, ingen DB-migrasjon, ingen endring av `submitTeamRegistration`-kjernelogikk (slot-payload `{mode, value}` uendret — verifisert i page.tsx + handleSubmit). Inline suksess-oppsummering + mixed-result-banner er pre-eksisterende oppførsel (bevart, ikke ny).

### Regresjoner
Ingen. Honeypot bevart (linje 230-239). Pre-eksisterende tester for suksess-banner («viser suksess-banner og oppsummering»), mixed-result («viser warning for feilede slots i blandet resultat») og payload-kontrakt («submitter med riktig payload») er alle grønne.

---

## Kjent begrensning (vurdert, ikke auto-fail)

Sandkassen har ingen Supabase-env (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), så `/signup/[shortId]`-rutene kaster i `proxy.ts`/`getGameByShortId` før den nye koden nås. Live Playwright/browser-verifikasjon av den auth-gatede UI-en er derfor umulig her — og jeg har ikke oppfunnet credentials.

**Vurdering:** Enhets-test- + build-evidensen er tilstrekkelig for UI-kriteriene gitt denne harde begrensningen. Begrunnelse: (a) on-blur/submit-validering, autocomplete-valg → chip → submit-payload, og mode-aware copy er alle ren klient-logikk drevet av props, fullt dekket av jsdom-render-testene (som kjører de faktiske komponentene, ikke mocks av dem); (b) server/klient-personverngrensa (K4) er en kompilerings-egenskap — `import type` + `server-only` — som den grønne prod-build-en beviser holder; (c) `joinEffect`-utledningen (K5) er ren server-deriverings-logikk verifisert ved kode-lesing + 3 render-tester. Den eneste tingen som gjenstår for live-sjekk er ren visuell layout (dropdown-posisjonering, chip-styling), som Vercel preview-deploy dekker etter merge. Ingen funksjonell oppførsel er uverifisert.

---

## Anbefaling

**ACCEPT.** Alle seks kriterier oppfylt med konkret evidens. Alle fire gates grønne (eslint rent, tsc kun 2 urelaterte pre-eksisterende feil, 86 vitest grønne, build kompilerer). Versjon korrekt bumpet (1.70.0 minor + 1.70.1 patch) med riktig formaterte CHANGELOG-oppføringer. Ingen blokkerende funn, ingen regresjoner, ingen scope-kryp. Klar for PR/merge.
