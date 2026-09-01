# Forge-kontrakt: Ryder Cup-skala — hevede tak + matchantall per økt — #1883

**Branch:** `claude/ryder-cup-format-b137cd`
**Issue:** [#1883](https://github.com/jdlarssen/golf-app/issues/1883)
**Type:** enhancement · area: admin (cup) · størrelse: small-to-medium
**Spec:** `docs/superpowers/specs/2026-09-01-ryder-cup-kaptein-uttak-design.md` (etappe 1)
**Plan:** `docs/plans/2026-09-01-ryder-cup-skala-implementation.md` — ferdig task-for-task-plan med kode, tester og commit-meldinger. Byggeren følger planen; avvik fra den begrunnes eksplisitt i PR-en.

## Problem

Bruker-innsendt idé (pull per hva-er-nok §5): Ryder Cup-oppsett med 16 spillere per lag + kapteiner — 8 foursomes, 8 four-ball, 12 singler. Cup-systemet har allerede strukturen («Klassisk»-preset, matchantall derivert av lagstørrelse), men to ting stopper oppsettet: personlig-cup-takene (16 matcher / 24 deltakere — oppsettet trenger 28/34) og at singles-økta alltid setter alle i spill (16 per lag ⇒ 16 singler, aldri 12). Kapteinsrollen er etappe 2 (#1884) og inngår IKKE her.

Ingen ny bibliotek-flate — alt bygger på mønstre lest fra repoet i spec-økta 2026-09-01 (`generateCupPlan` respekterer allerede `session.matchCount`; ingen DB-endring).

## Designbeslutninger (avklart med eier 2026-09-01)

- **Tak til Ryder-skala med slingring, ikke ubegrenset:** 36 matcher / 40 deltakere. Frikobler spiller-taket fra Kompis-runde-taket (#525) det delte verdi med.
- **Justerbart matchantall per økt, alle formater, kun NED:** derivert antall er tak og default; klamp [1, derivert]. Aldri opp — flere matcher enn spillere krever dobbeltbooking-logikk vi ikke bygger.
- **Overstyringen er engangs-input i Generer-rommet** (ground truth-avvik fra spec-en, dokumentert i planens header): derivert antall avhenger av lagdelingen som først skjer der, og matchene er det persisterte artefaktet. Ingen lagring på `tournament_plans`; regenerering starter fra derivert antall.
- **Klamp i helper i stedet for valideringsfeil** (avvik nr. 2): stepper-UI kan ikke produsere ugyldige verdier; `buildSessionCountRows` klamper defensivt.
- **Benking styres etterpå** med eksisterende `swapCupMatchPlayer` — hvem som sitter over er ikke ny funksjonalitet.
- **Splittet-cup-dag-preseten røres ikke** (buntstruktur uten øktbaserte matchantall).

## Suksesskriterier

- [ ] **SK1 — Tak:** `MAX_PERSONAL_CUP_MATCHES = 36`, `MAX_PERSONAL_CUP_PLAYERS = 40` i `lib/cup/limits.ts`; grensetester 36/37 og 40/41 (+ 28- og 34-radene for innsenderens oppsett) grønne i `lib/cup/limits.test.ts`. Kommentaren begrunner Ryder-skalaen og frikoblingen fra #525.
- [ ] **SK2 — Klampe-regel:** `buildSessionCountRows(sessions, teamSize, overrides)` + `buildSessions(…, overrides?)` i `lib/cup/cupTemplates.ts`: klassisk @ 16 med `{2: 12}` → 8/8/12; override klampes [1, derivert]; derivert-0-økter droppes uansett override; nøkling på posisjon (duplikatformater i tilpasset liste); ikke-endelige verdier ignoreres; uten overrides identisk med dagens oppførsel. Verifisert av `lib/cup/cupTemplates.test.ts`.
- [ ] **SK3 — Veiviser-UI:** Generer-rommets steg 1 viser én rad per økt (ikke splittet-cup-dag) med −/+-steppere (≥44px tap-targets, `tabular-nums`), disabled på grensene, testid-kontrakt `cup-session-count-<i>` / `cup-session-minus-<i>` / `cup-session-plus-<i>`. `plannedTotal`, cap-gaten og genereringen leser den justerte planen.
- [ ] **SK4 — Splittet cup-dag uberørt:** ingen steppere når `isSplitDay`; `generateSplitDayPlan`-løypa uendret; eksisterende bunt-tester grønne.
- [ ] **SK5 — i18n + copy:** nye nøkler under `cup.generate` i BÅDE `messages/no.json` og `messages/en.json` (paritetstester grønne); `humanizer:humanizer` kjørt på de norske strengene før commit.
- [ ] **SK6 — Versjonsnotater:** `.changes/1883-ryder-cup-tak.md` + `.changes/1883-matcher-per-okt.md` gyldige — `node scripts/weekly-release.mjs --dry-run` godtar begge.
- [ ] **SK7 — Tester:** planens ene interaksjonstest i `GenerateMatchesWizard.test.tsx` grønn (stepper ↔ visning-wiring; ingen re-assert av Type A-tall); hele suiten grønn.
- [ ] **SK8 — Staging-bevis:** klikkrunde på torny-staging FØR merge: cup-kladd med klassisk preset → Generer → del lag → skru ned singler → Neste → forhåndsvisning har nedjustert antall → generer. Bevis-kommentar + `staging-verified`-label på PR-en.

## Gates

- `npx tsc --noEmit` — grønt
- `npx eslint <endrede filer>` — grønt
- `npx vitest run lib/cup "app/[locale]/admin/cup/[id]/generer" messages` — grønt
- `npm run build` — grønt (ingen «pre-existing»-unnskyldning)
- `node scripts/weekly-release.mjs --dry-run` — begge 1883-notatene gyldige

## Filer som berøres

| Fil | Endring |
|---|---|
| `lib/cup/limits.ts` | Konstanter 16→36 / 24→40 + omskrevet doc-kommentar |
| `lib/cup/limits.test.ts` | Nye grenseverdier + 28/34-radene |
| `lib/cup/cupTemplates.ts` | NY `SessionCountRow` + `buildSessionCountRows`; `buildSessions` får valgfri `overrides` |
| `lib/cup/cupTemplates.test.ts` | Klampe-/posisjons-/dropp-tester |
| `app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.tsx` | `sessionCountOverrides`-state, `Step1SessionCounts`-komponent, justert `getSessionPlan` |
| `app/[locale]/admin/cup/[id]/generer/GenerateMatchesWizard.test.tsx` | Én interaksjonstest (#1883) |
| `messages/no.json` + `messages/en.json` | 5 nye nøkler under `cup.generate` |
| `.changes/1883-ryder-cup-tak.md` + `.changes/1883-matcher-per-okt.md` | NYE versjonsnotater |

## PR-regler for denne kontrakten

- Draft-først (#1516): `gh pr create --draft`, all bokføring pushet, `ls-remote` = lokal HEAD, `gh pr ready` som øktas siste handling.
- Body: `Closes #1883` + Fordeler/ulemper-blokk. **Ingen produktvalg-heading** — alle reelle valg er tatt av eieren i spec-økta (tak-nivå, kun nedjustering, to-etappe-deling); PR-en er auto-merge-kvalifisert når portene er grønne og SK8 er bevist.
- N6c-økta (#1856, native) kjører parallelt — rebase på fersk main før push hvis main har flyttet seg.
- Closing-kommentar på #1883 etter merge: `## Teknisk` (inkl. de to spec-avvikene over) + `## Funksjonell`.

## Ikke i scope

- Etappe 2 (#1884): kapteinsrolle, uttaksflyt, hemmelighold, avdekking — egen kontrakt senere.
- Kaptein-flyt for splittet cup-dag; uttaksfrister med nedtelling (parkert i #1884).
- Oppjustering av matchantall (flere matcher enn spillere per økt).
- Lagring av overstyringer på `tournament_plans`.
- Endringer i klubb-cup-/admin-takene (fortsatt uncapped).
