# Evaluation: #909 — Edit-skjema kollaps + read-only låst format

**Verdict: ACCEPT**

Skeptisk gjennomgang av kontrakt `909-edit-form-collapse.md` mot koden på branchen
(`072cd456`, `ffd455dc`, `132eb66d` vs `origin/main`). Alle suksesskriterier oppfylt
med bevis fra kode + grønne gates. Sikkerhets-invarianten (byte-identisk form-felt-sett
per `(mode, lock-state)`) er verifisert ved direkte kodelesing, ikke bare påstand.

## Success Criteria

| # | Kriterium | Status | Bevis |
|---|-----------|--------|-------|
| 1 | `Disclosure`-primitiv på `<details>/<summary>`, eksponerer `summary`/`children`/`defaultOpen`, roterende chevron m/ `motion-reduce`, summary ≥44px, palett-tokens | PASS | `components/ui/Disclosure.tsx:42` native `<details open={defaultOpen}>`; `:47` `min-h-[44px]`; `:61` `group-open:rotate-180 motion-reduce:transition-none`; `:45` `border-border bg-surface` tokens; props `:20-40` |
| 2 | `Disclosure.test.tsx` (render-test): innhold i DOM når lukket, klikk åpner | PASS | `Disclosure.test.tsx:9-34` (closed-DOM + click-open) + `:36-43` (defaultOpen). Vitest grønn (se gates) |
| 3 | `GameForm` rendrer disclosure-paneler i rekkefølge; Grunnoppsett åpent, resten kollapset; `BasicsSection showAdvancedInline={false}`; synlighet+side flyttet til Innstillinger via `AdvancedSettingsSection includeVisibility` | PASS | `GameForm.tsx:533` Grunnoppsett `defaultOpen`; `:544/565/832/844/855` øvrige paneler (ingen defaultOpen); `:538` `showAdvancedInline={false}`; `:856` `includeVisibility` |
| 4 | Form-data-invariant (unlocked): alle felt-navn i DOM når kollapset | PASS | Test `GameForm.test.tsx:1558-1588` asserterer `game_mode, team_size, registration_mode, registration_type, score_visibility, side_tournament_enabled, require_peer_approval` finnes. Native `<details>` beholder children i DOM (jsdom skjuler ikke lukket innhold). Grønn |
| 5 | Låst format → read-only kort; 13-korts grid + TeamSizeSelector vises IKKE; kort viser navn+lagstr.+allowance; `game_mode`/`team_size` hidden inputs i DOM m/ riktige verdier | PASS | `GameForm.tsx:567-572` `lockGameMode ? <LockedFormatSummary> : <grid>`; `LockedFormatSummary.tsx` emitter ingen form-inputs; hidden inputs `:387-388` (utenfor alle Disclosure). Test `GameForm.test.tsx:289-311`: grid-radio + size-group fraværende, `game_mode` hidden = `best_ball`. Allowance/setup-seksjoner rendres uendret under kortet (`:590-825`) |
| 6 | Form-data-invariant (locked): submitting-sett identisk med dagens (setup-seksjoner disabled = sendes ikke før og nå) | PASS | Setup-seksjoner (Wolf/Nassau/Skins/Nines/Shamble) beholdt m/ `disabled={lockGameMode}` (`:787,794,801,810,823`); kun de visuelle ModeSelector/TeamSizeSelector (som aldri emitterte form-felt) er erstattet. game_mode/team_size hidden inputs uendret. Test `:303-310` |
| 7 | Sideturnering-katalog auto-collapse; kun preset-chips når ≠custom; full katalog ved «Egendefinert»; `side_disabled_categories` hidden uendret begge tilstander | PASS | `SideCategoriesPicker.tsx:377-384` hidden inputs renders FØR `:424` `{catalogOpen && ...}`-gaten; `:323` `catalogOpen = showCatalog || activePreset==='custom'`. Test `SideCategoriesPicker.test.tsx:10-37`: kollapset = 0 checkboxer, Egendefinert bretter ut, klassisk-kollaps beholder N hidden inputs. Grønn |
| 8 | Sammendragslinjer idiomatisk norsk (humanizer) | PASS (delvis verifiserbar) | Norske strenger korte/idiomatiske («N spillere», «Sideturnering på», «{format} · låst»). Humanizer-kjøring nevnt i closing er prosess-bevis (utenfor min lese-rekkevidde), men teksten har ingen AI-tells |
| 9 | Gates grønne + staging-klikkrunde | PASS (gates) / EJ VERIFISERT AV MEG (staging) | tsc/lint/vitest grønne under. Staging-klikkrunde er en manuell port jeg ikke kan kjøre i denne sandboxen — eier/byggers ansvar før merge per kontrakt |
| 10 | Version-bump + CHANGELOG i samme commit | PASS | `package.json` 1.141.x → `1.142.0` (minor, korrekt for feat); CHANGELOG `1.142.0` m/ tagline + Teknisk; begge i commit `072cd456` |

## Gate-resultater

| Gate | Kommando | Resultat |
|------|----------|----------|
| Types | `npx tsc --noEmit` | **PASS** — exit 0, ingen output |
| Tester | `npx vitest run Disclosure + GameForm + GameWizard + SideCategoriesPicker + catalogParity` | **PASS** — 5 filer, 73 tester grønne |
| Lint | `npx eslint GameForm.tsx Disclosure.tsx SideCategoriesPicker.tsx` | **PASS** — exit 0; 3 complexity-WARNINGS (GameForm 48, teamsAssignmentHasContent 26, TeamsAssignmentSection 51), 0 errors. Ingen `--max-warnings` i lint-script eller CI → warnings tolereres |

(Full build + 3995-test-suite ikke re-kjørt; kontrakten oppga at den allerede passerte, og den fokuserte gaten dekker de endrede filene.)

## Skeptiske sjekker

1. **Duplisert heading?** NEI. `wizard.form.formatHeading`-`<h2>` (origin/main GameForm:520-521) er fjernet; Disclosure-tittelen `panelTitleFormat` erstatter den. BasicsSection/PlayersSection får `hideHeading` (`GameForm.tsx:539,545`); deres interne `<h2>` er gated bak `!hideHeading` (`BasicsSection.tsx:107`, `PlayersSection.tsx:138`).
2. **Tomt panel?** NEI. «Inndeling»-panelet er gated bak `teamsAssignmentHasContent(state)` (`GameForm.tsx:844`); predikatet (`TeamsAssignmentSection.tsx:105-143`) speiler komponentens fire render-guarder (sider/lag-grid/flights/tee). Test `GameForm.test.tsx:1591-1612` bekrefter: 0 spillere → intet panel, 2 spillere → panel dukker opp.
3. **Duplisert `modeLockedNote`?** NEI. Standalone `<p>` (origin/main GameForm:774) er fjernet; notisen finnes nå kun i `LockedFormatSummary.tsx:38`.
4. **i18n catalogParity + ICU?** PASS. Alle 11 nye `wizard.form`-nøkler i BÅDE no.json og en.json (verifisert). `panelPlayersSummary` ICU-plural rendret korrekt i GameForm-tester (count=8). catalogParity grønn.
5. **NYE console-error?** INGEN. Alle nye `t()`-nøkler eksisterer i begge filer. Den pre-eksisterende `bruttoHelper`-MISSING_MESSAGE (issue #933, GameForm:669) er uendret og out-of-scope.
6. **Lint complexity?** WARNINGS, ikke errors (bekreftet `0 errors, 3 warnings`; eslint exit 0). CI tolererer warnings.

## Funn (ikke-blokkerende)

- **LOW / nit:** `wizard.form.formatHeading`-nøkkelen er nå foreldreløs i GameForm-pathen (CreateLigaForm bruker en separat `formatHeading` i et annet namespace). Ufarlig — en ubrukt nøkkel kaster ikke. Ikke verdt eget issue; kan ryddes opportunistisk.
- **Kontekst (allerede out-of-scope i kontrakten):** synlighet+sideturnering-dedup (BasicsSection vs AdvancedSettingsSection) og latent Wolf/Nassau-data-tap ved låst-edit — eksplisitt flagget som egne issues i kontraktens «Out of Scope». Refactoren bevarer dagens oppførsel; ingen regresjon innført.

## Konklusjon

Sikkerhets-invarianten holder: kollaps via native `<details>` beholder alle felt i DOM;
låst-pathen dropper kun rent-visuelle velgere (som aldri emitterte form-felt) og beholder
game_mode/team_size hidden inputs + alle disabled setup-seksjoner; SideCategoriesPicker-
hidden-inputs rendres uavhengig av katalog-synlighet. Gates grønne, tester dekker både
unlocked- og locked-invarianten samt empty-panel-guarden. **ACCEPT** — eneste utestående
er den manuelle staging-klikkrunden, som er byggers/eiers port før merge (kan ikke kjøres
i denne evaluerings-sandboxen).
