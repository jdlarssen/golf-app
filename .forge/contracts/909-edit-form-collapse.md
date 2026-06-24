# Contract: Edit-skjemaet er for langt — kollaps seksjoner + read-only for låst format

**Issue:** [#909](https://github.com/jdlarssen/golf-app/issues/909) — edit-skjemaet rendrer hele opprett-veiviseren flatt; kaos på mobil.
**Severity:** LOW (UX/IA-polish, ingen schema/scoring-endring). Bruker-flagget: «edit er alt for lang, helt kaos».
**Type:** Presentasjons-refactor av delt komponent (`GameForm`). Bruker-synlig → minor-bump + CHANGELOG.

## Bakgrunn

`GameForm.tsx` rendrer alle seksjoner stacked flatt og deles av to flater:
- **Edit** (`/admin/games/[id]/edit`) — eneste variant, ingen stegvis modus.
- **Create «full view»** (`new?step=5&view=full`) — power-user escape hatch (`GameWizard`-default er stegvis `view=wizard`).

To bloat-kilder:
1. **Låst format vises som full grid.** For scheduled spill er `lockGameMode=true` ([editGameInitialValues.ts:145](../blob/main/lib/games/editGameInitialValues.ts#L145): `lock_game_mode = status !== 'draft'`), men [GameForm.tsx:519-777](../blob/main/app/[locale]/admin/games/new/GameForm.tsx#L519) rendrer hele `ModeSelector` (13 kort) + `TeamSizeSelector` + setup-seksjoner — bare `disabled`/nedtonet.
2. **Sideturnering-katalogen alltid fullt utbrettet** — alle ~40 kategorier i 6 grupper ([SideCategoriesPicker.tsx:412-453](../blob/main/components/admin/SideCategoriesPicker.tsx#L412)), selv når preset = Klassisk/Full pakke.

Faktisk seksjonsstruktur i flat `GameForm`-path (viktig — avviker fra issue-ens mentale modell):
- **BasicsSection** (`showAdvancedInline=true`): navn, bane, tee, tee-off, **+ synlighet-radios + sideturnering-fieldset**.
- **PlayersSection**, **Format-blokk** (inline 519-777), **RegistrationSection**, **TeamsAssignmentSection**.
- **AdvancedSettingsSection** (`includeVisibility=false`): kun peer-approval-checkbox.
- Wizard gjør motsatt: `showAdvancedInline=false` + `AdvancedSettingsSection includeVisibility=true`.

## Beslutninger (avklart med eier)

1. **Scope: begge flater.** Kollaps + sammendragslinjer gjelder hele `GameForm` (edit + create-full-view).
2. **Låst format → read-only sammendragskort** (ikke bare én linje): format-navn + lagstørrelse + handicap-allowance + setup-parametre (Wolf/Nassau/Skins/Nines/Shamble) som lesbar tekst.
3. **Default kollaps-tilstand: Grunnoppsett åpent, resten kollapset.** Bane/tee/tid/navn synlig; Spillere/Spillform/Påmelding/Lag/Innstillinger starter kollapset med ett-linjes sammendrag. Samme default i begge flater.
4. **Sideturnering-katalog auto-utbrettes på «Egendefinert».** Bare preset-chips synlige ved Klassisk/Full pakke; full kategori-grid vises kun når `activePreset === 'custom'`.

## Sikkerhets-invariant (kritisk — kontraktens hjerte)

**Refactoren er rent presentasjonell. Mengden innsendte form-felter (navn + verdi + disabled-tilstand) MÅ være identisk før og etter, for hver `(mode, lock-state)`.** Begrunnelse fra data-flow-trace:
- `mode_config` skrives **ukondisjonelt** på hver edit-scheduled-save ([edit/actions.ts:175-181](../blob/main/app/[locale]/admin/games/[id]/edit/actions.ts#L175)); mode-lock-guarden ([actions.ts:153-158](../blob/main/app/[locale]/admin/games/[id]/edit/actions.ts#L153)) avviser kun *endring* av `game_mode`, ikke config-skriving.
- Setup-felter som mangler i FormData defaulter (f.eks. `wolf_scoring → 'net'`, [gamePayload.ts:354](../blob/main/lib/games/gamePayload.ts#L354)) → kan klobbe lagret config.
- Trygt fordi: `game_mode` + `team_size` har **ubetingede** hidden inputs på toppen ([GameForm.tsx:363-364](../blob/main/app/[locale]/admin/games/new/GameForm.tsx#L363)); matchplay-allowances har hidden inputs (445-479); setup-seksjoner er allerede `disabled` når låst (disabled = sendes ikke, samme som fraværende). `SideCategoriesPicker` sender data via separate hidden inputs ([linje 367-374](../blob/main/components/admin/SideCategoriesPicker.tsx#L367)), ikke via de synlige checkboxene — å skjule katalogen rører ikke form-data.

Konsekvens: **kollaps via `<details>` beholder alt i DOM (lukket `<details>` sender fortsatt sine inputs)** → form-trygt. Read-only-kortet er **additivt/visuelt**; reelle (submitting) kontroller forblir montert i DOM med uendret verdi/disabled-tilstand.

## Approach

1. **Ny gjenbrukbar `Disclosure`-primitiv** i `components/ui/Disclosure.tsx` — native `<details>/<summary>` (mønster fra [ModeGuideCard.tsx](../blob/main/components/ModeGuideCard.tsx), non-destruktiv → `<details>` OK). Props: `summary` (ReactNode, ett-linjes), `children`, `defaultOpen?`, evt. `id`. Tilgjengelig (tastatur via native), chevron som roterer med `group-open:`, `motion-reduce:transition-none`, tap-target ≥44px, forest/champagne/linen-tokens, `tabular-nums` der tall vises.
2. **`GameForm` restrukturert til disclosure-paneler.** Sett `showAdvancedInline={false}` på `BasicsSection` og render `AdvancedSettingsSection includeVisibility={true}` som «Innstillinger»-panel (samme felt-navn som i dag via wizard-pathen → form-data uendret). Paneler topp→bunn:
   - **Grunnoppsett** — åpent (ikke kollapset): navn/bane/tee/tee-off.
   - **Spillere** — kollapset; sammendrag «N spillere».
   - **Spillform** — kollapset; sammendrag format-label (+ lagstørrelse). Ved `lockGameMode`: read-only sammendragskort i stedet for grid; sammendrag «{format} · låst».
   - **Påmelding** — kollapset; sammendrag av registrerings-modus/type.
   - **Lag og flights** — kollapset; rendres kun når `TeamsAssignmentSection` har innhold for aktuell modus.
   - **Innstillinger** — kollapset; peer-approval + synlighet + sideturnering.
3. **Read-only format-kort** (`lockGameMode`): erstatt synlig `ModeSelector` + `TeamSizeSelector` med kompakt kort (format-navn, lagstørrelse, allowance, setup-params som tekst). Behold alle currently-submitting inputs i DOM (game_mode/team_size hidden inputs er allerede utenfor seksjonen; `hcp_allowance_pct`/`round_robin`-AllowanceField beholdes montert men visuelt skjult; disabled setup-seksjoner kan droppes siden de uansett ikke sendes når låst).
4. **`SideCategoriesPicker` auto-collapse.** Render 6-gruppe-katalogen kun når `activePreset === 'custom'`. Preset-chips alltid synlige. Hidden inputs (`side_disabled_categories`) emitteres uendret uansett synlighet.

Forkastet: egen stegvis edit-wizard (for stort for et IA-grep); ekstern accordion-lib (native `<details>` rekker).

## Success Criteria

- [ ] **`Disclosure`-primitiv** finnes i `components/ui/Disclosure.tsx`, bygger på `<details>/<summary>`, eksponerer `summary`/`children`/`defaultOpen`, roterende chevron med `motion-reduce`-guard, summary-rad er tap-target ≥44px, bruker palett-tokens. *Evidence: fil + linje.*
- [ ] **`Disclosure.test.tsx`** (én render-test): innhold er i DOM når lukket (form-trygt), klikk på summary åpner. *Evidence: `npx vitest run` grønn.*
- [ ] **`GameForm` rendrer disclosure-paneler** i rekkefølgen over; Grunnoppsett åpent, resten kollapset som default i begge flater (edit + create-full-view). `BasicsSection` får `showAdvancedInline={false}`; synlighet + sideturnering flyttet til «Innstillinger»-panelet via `AdvancedSettingsSection includeVisibility`. *Evidence: file:line.*
- [ ] **Form-data-invariant bevart (unlocked).** Test verifiserer at i flat `GameForm` (create/edit-draft) er alle form-felt-navn fra dagens render fortsatt til stede i DOM når seksjonene er kollapset (minst: `game_mode`, `team_size`, `score_visibility`, `side_tournament_enabled`, `side_disabled_categories`-hidden, `player_0_id`, `require_peer_approval`). *Evidence: vitest grønn.*
- [ ] **Låst format → read-only kort.** Ved `mode.kind === 'edit-scheduled'` (lockGameMode): den synlige 13-korts `ModeSelector`-griden + `TeamSizeSelector` vises **ikke**; et read-only sammendragskort viser format-navn + lagstørrelse + allowance + ev. setup-params. `game_mode`- og `team_size`-hidden inputs er fortsatt i DOM med riktige verdier. *Evidence: vitest-test + staging-skjermbilde.*
- [ ] **Form-data-invariant bevart (locked).** Test verifiserer at settet av submitting inputs ved låst format er identisk med dagens (ingen nye/manglende felt; setup-seksjoner var disabled = sendes ikke før og nå). *Evidence: vitest grønn.*
- [ ] **Sideturnering-katalog auto-collapse.** `SideCategoriesPicker` viser kun preset-chips når preset ≠ custom; full katalog når «Egendefinert» aktiv. `side_disabled_categories`-hidden inputs emitteres uendret i begge tilstander. *Evidence: `SideCategoriesPicker.test.tsx` grønn.*
- [ ] **Sammendragslinjer er idiomatisk norsk** (kjørt gjennom `humanizer`-skillet før commit). *Evidence: nevnt i commit/closing.*
- [ ] **Gates grønne** (se under) + **staging-klikkrunde** av edit-flyten (draft + scheduled spill): kollaps fungerer, låst kort vises, lagring av scheduled spill bevarer `mode_config` uendret. *Evidence: staging-observasjon.*
- [ ] **Version-bump + CHANGELOG** i samme commit som den bruker-synlige endringen (`feat(admin)` → minor). *Evidence: `package.json` + `CHANGELOG.md` diff.*

## Gates

Kjør etter hver chunk; scoped til det som endret seg:

```bash
npx tsc --noEmit
npm run lint -- components/ui/Disclosure.tsx app/\[locale\]/admin/games/new/GameForm.tsx components/admin/SideCategoriesPicker.tsx
npx vitest run components/ui/Disclosure.test.tsx "app/[locale]/admin/games/new/GameForm.test.tsx" components/admin/SideCategoriesPicker.test.tsx
```

Siste gate (helhet):

```bash
npm run build
npx vitest run
```

Staging (bruker-synlig — obligatorisk før merge): boot `preview_start("torny-staging")`, logg inn som admin (service-role OTP-mint), åpne edit for ett **draft**-spill (alle paneler kollapsbare/redigerbare) og ett **scheduled**-spill (read-only format-kort), lagre scheduled og bekreft `mode_config` uendret i DB.

## Out of Scope

- Egen stegvis edit-wizard / endring av `view=wizard`-flyten.
- Schema-/server-action-/scoring-endring. Form-data-kontrakten er frosset.
- **Dedup av synlighet+sideturnering-blokken** (duplisert mellom `BasicsSection` og `AdvancedSettingsSection`) — reelt smell, men egen issue (flagges, ikke fikses her).
- **Mulig latent data-tap ved edit av scheduled Wolf/Nassau/Skins/Nines/Shamble** (disabled setup-radios sendes ikke → `mode_config` kan defaulte). Verifiseres på staging; hvis reelt → eget issue, ikke fikset her (refactoren bevarer dagens oppførsel).
- Endring av andre konsumenter av `BasicsSection`/`AdvancedSettingsSection` enn `GameForm` (wizard rører vi ikke).
