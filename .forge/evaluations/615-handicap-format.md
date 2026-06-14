# Evaluering: #615 — Handicap-format i admin-spillerliste

**Verdikt: ACCEPT**
**Dato:** 2026-06-14
**Evaluator:** fresh-context skeptisk reviewer
**Fix-commit:** `2c8cc4bc` — `fix(admin): localize handicap format in player list`

## Sammendrag

Alle fem suksesskriterier (K1–K5) er oppfylt. Begge gates grønne (vitest 155/155, `tsc --noEmit` exit 0). Logikken er uavhengig spor-verifisert via en `node`-replikering — den produserer eksakt de kontrakt-spesifiserte strengene i begge locales. Ingen scope creep: Profil og øvrige `toFixed(1)`-flater er bevisst urørt, slik kontrakten krever.

## Gate-resultater

| Gate | Kommando | Resultat |
|------|----------|----------|
| Vitest | `npx vitest run lib/handicap/sign.test.ts lib/i18n/format.test.ts` | ✅ 2 filer, 155 tester passed |
| Typecheck | `npx tsc --noEmit` | ✅ exit 0, ingen feil |
| commit-msg-hook | `fix(...)` + bump + CHANGELOG i samme commit | ✅ package.json 1.129.0→1.129.1 + CHANGELOG i commit `2c8cc4bc` |

## Per-kriterium

| K | Krav | Bevis | Status |
|---|------|-------|--------|
| K1 | Ren helper `formatHcpDisplay(signed, locale): string` i `lib/handicap/sign.ts`: locale-bevisst desimalskille, alltid én desimal, `+`-prefiks for plusshandicap, ingen prefiks for scratch | `lib/handicap/sign.ts:50-57`. Komponerer `fromSignedHcp` + `formatNumber({min,maxFractionDigits:1})`, `+`-prefiks gated på `isPlus && magnitude !== 0`. Ingen sideeffekter, pure. | ✅ |
| K2 | Co-located Type A-tester: vanlig hcp («12,2»), plusshandicap «+8,0» (−8), scratch «0,0» (0), heltall «25,0», engelsk «12.2»/«+8.0». Alle grønne. | `lib/handicap/sign.test.ts:56-78` — dekker alle navngitte cases + 24,5 og −1,5. Vitest: alle grønne. | ✅ |
| K3 | `PlayersList.tsx` bruker `formatHcpDisplay(u.hcp_index, locale)` i stedet for `toFixed(1)`; locale via `getLocale()` | `PlayersList.tsx:5` import, `:21` `const locale = (await getLocale()) as AppLocale`, `:97` `{formatHcpDisplay(u.hcp_index, locale)}`. `toFixed(1)` er borte fra fila. | ✅ |
| K4 | Norsk «12,2»/«+8,0»; engelsk «12.2»/«+8.0». (Helper-test + build grønn beviser.) | Uavhengig node-trace av logikken: no → 12,2 / 24,5 / +8,0 / +1,5 / 0,0 / 25,0; en → 12.2 / +8.0 / 0.0. Eksakt match. `tsc` grønn beviser wiring. Build allerede verifisert grønn av builder. | ✅ |
| K5 | Versjonsbump (PATCH) + CHANGELOG i samme commit | `git show 2c8cc4bc`: package.json 1.129.0→1.129.1, CHANGELOG-oppføring [1.129.1] med tagline-blockquote + Teknisk-details. Begge i fix-commiten. | ✅ |

## Skeptiske kontroller

- **«+8,0» for lagret −8, begge locales:** Verifisert ved node-replikering av nøyaktig helper-logikken (ikke bare test-navn). `nb-NO` gir komma, `en-GB` gir punktum, `minimumFractionDigits:1` tvinger én desimal. ✅
- **Scratch (0) → ingen pluss:** `isPlus = signed < 0` er false for 0, så ingen prefiks; output «0,0» / «0.0». ✅ Plusshandicap-gaten har også redundant `magnitude !== 0`-vakt.
- **Faktisk wiret inn:** `toFixed(1)` erstattet i PlayersList; locale er den ekte aktive locale via `getLocale()` fra `next-intl/server` (etablert mønster). ✅
- **Bump i samme commit (hook-disiplin):** Ja — alt i `2c8cc4bc`, ingen `--no-verify`. ✅
- **Scope creep / gold-plating:** Ingen. Profil (`ProfileFormBody.tsx`, `profile/page.tsx`, `OnboardingHcpField.tsx`) bruker fortsatt `formatGolfboxHcp` — bevisst utenfor scope per kontrakt. Andre `toFixed(1)`-flater (liga, cup, games new, InviteToGameClient) er urørt og var ikke i scope. ✅
- **Worktree-hygiene:** Edits ligger i worktree-stien, commit på branch `claude/stupefied-wright-a3d703`, tree clean — ingen phantom-edit i feil tre. ✅

## Funn

Ingen blokkerende funn. Latent i18n-rest (Profil + liga/cup/games `toFixed(1)`) er korrekt flagget som utenfor scope i kontrakten og bør spores som eget issue hvis ønskelig — men er ikke en mangel ved #615.
