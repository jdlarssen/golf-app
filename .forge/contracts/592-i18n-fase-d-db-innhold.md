# Spec: i18n Fase D — spillformat-innhold på engelsk (#592)

> Del av epic #60. Følger Fase 0/1/2a–2f. Master-arkitekturen ligger i
> `.forge/contracts/60-engelsk-ui-i18n.md`; denne kontrakten avgrenser og
> **avviker bevisst** fra epic-spec-ens Fase D på ett punkt (se «Avvik»).

## Problem

Etter Fase 2f er hele UI-grenseflaten tospråklig, men spillformat-**innholdet**
rendres fortsatt kun på norsk uansett `locale`, fordi det bor i databasen / i
norsk-låst kode:

- `formats.short_description` (22 rader, NO) → veiviser-kortene
  (`FormatGrid`) + cup-format-velgeren (`CupSetup`), via `getFormatsForIntent`
  / `getCupEligibleFormats`.
- `formats.rules_long` + `rules_example` (22 rader hver, NO) → detaljsidene
  `/spillformater/[slug]`, via `getModeContentMap` + `mergeModeContent`.
- `MODE_GUIDE` (kode, `lib/formats/modeGuide.ts`, NO) → sammendrag + punkter i
  formatoversikten. DB-feltene `rules_summary`/`rules_points` er tomme (0/22),
  så `MODE_GUIDE` er den faktiske live-kilden via `mergeModeContent`-fallback.
- `buildFormatGuide` bygger formatoversiktens etikett fra den norske
  `MODE_LABELS`-konstanten / `formatDisplayLabel`, ikke fra `modes.*`-katalogen
  (som detaljsiden allerede bruker). På `/en` viser lista altså norske navn.

Formatnavnene finnes allerede tospråklig i `modes.*`-katalogen (verifisert: alle
22 + `modeVariants.*`, byte-matcher dagens `display_name`).

## Avvik fra epic-spec-ens Fase D (eier-beslutning 2026-06-13)

Epic-spec-en (`60-...md`, Phase D) foreskrev en **`format_translations`-tabell**
+ locale-aware DB-lesninger + en per-locale innholds-editor i Sekretariatet.

**Eier valgte i stedet:** «Vi trenger ikke redigerbare beskrivelser slik vi
støtter nå. Vi kan ta bort det og hardkode tekstene — da blir de enklere å
oversette også.»

Vi følger eierens retning. Innholdet er statisk (golf-regler endres ikke),
version-controlled, humanizer-/test-bart uten migrasjon — nøyaktig
begrunnelsen `MODE_GUIDE` allerede bruker for å ligge i kode. Å flytte resten
til **meldingskatalogen** (`messages/{no,en}.json`) gir samme mekanisme som hele
resten av epicen, fjerner en duplisert innholds-sti og en admin-editor eieren
ikke trenger. N-locale-kriteriet er fortsatt oppfylt: nytt språk = ny
katalog-fil, ingen DB-rader, ingen kodeendring.

## Design

### Katalog

Nytt under den eksisterende `formatGuide`-namespacen:
`formatGuide.content.<key>` med felt `{ shortDescription, summary, points[],
long, example }`.

- `<key>` = `buildFormatGuide`-katalogens `entry.key`: de 22 modus-slug-ene +
  varianten `stableford-4bbb`.
- 22 base-formater: alle fem felt.
- `stableford-4bbb` (kun i oversikts-lista, ikke detaljside): bare `summary` +
  `points` (= dagens `STABLEFORD_4BBB_GUIDE`).
- **Navn gjenbrukes fra `modes.<slug>`** (+ `modes.modeVariants.*` for
  varianten) — ingen duplisering av `display_name`.
- NO-verdier kopieres **byte-identisk** fra dagens kilder (DB-rader +
  `MODE_GUIDE`/`STABLEFORD_4BBB_GUIDE`). EN-verdier er ny, idiomatisk engelsk
  golf-copy (NO→EN, så `no-nb` gjelder ikke; ingen ny norsk → ingen humanizer-
  runde utover å bevare eksisterende NO uendret).
- `messages/catalogParity.test.ts` håndhever no/en-symmetri.

### Kode

- **`lib/formats/buildFormatGuide.ts`** — `getFormatGuideEntries()` leser
  innhold fra katalogen (`getTranslations`/`t.raw` for `points`) i stedet for
  `getModeContentMap` + `mergeModeContent`. Etikett fra `modes.*` /
  `modeVariants.*`. Ikke lenger cache-avhengig (ren katalog-lesning).
- **`lib/formats/getModeContent.ts`** — SLETT (`getModeContentMap`,
  `mergeModeContent`, `MergedModeContent`).
- **`lib/formats/modeGuide.ts`** (+ `.test.ts`) — SLETT (`MODE_GUIDE`,
  `STABLEFORD_4BBB_GUIDE`, `resolveModeGuide`). Ingen scoring-konsument
  (`gruesomeMatchplay` har bare en kommentar-referanse).
- **`lib/formats/parsePointsTextarea.ts`** (+ `.test.ts`) — SLETT (eneste
  konsument var `updateFormatContent`).
- **`app/[locale]/spillformater/[slug]/page.tsx`** — innhold (summary, points,
  long, example) fra katalogen i stedet for `getModeContentMap`. `long`/
  `example` rendres fortsatt kun når satt; bruk `t.has()`-guard.
- **`lib/formats/getFormatsForIntent.ts`** — `FormatForIntent` /
  `CupEligibleFormat` mister `display_name` + `short_description`. Behold
  `slug`, `icon_key`, `is_primary`, `sort_order`. Query slutter å selecte de to
  innholds-feltene. (Disse forblir `unstable_cache` med tag `format-mapping` —
  innholdet de leser nå er locale-uavhengig, så ingen cache-key-endring nødvendig.)
- **`FormatGrid.tsx` + `CupSetup.tsx`** — render navn via `useTranslations('modes')`
  på `f.slug`, beskrivelse via `formatGuide.content.<slug>.shortDescription`.
- **`lib/formats/getAllFormatsWithMappings.ts` + `types.ts`** —
  `FormatWithMappings` mister `display_name`, `short_description`, `rules_*`.
  Query slutter å selecte dem. Sortering flyttes fra `display_name` (DB) til
  lokalisert navn klient-side (eller slug-rekkefølge).
- **`FormatsManager.tsx`** — fjern hele `ContentEditorSection` +
  `ContentEditorRow`. Navn-visning via `modes.*`-katalog. Matrise (synlig/
  primær/cup/aktiv) uendret.
- **`app/[locale]/admin/formats/actions.ts`** — fjern `updateFormatContent` +
  import av `parsePointsTextarea`. Toggle-actions uendret.
- **`messages/{no,en}.json`** — fjern `admin.formats.contentEditor.*` (ikke
  lenger brukt).
- **Migrasjon** `supabase/migrations/00XX_drop_format_content_columns.sql` —
  `ALTER TABLE formats DROP COLUMN display_name, short_description,
  rules_summary, rules_points, rules_long, rules_example`. **Appliseres
  POST-DEPLOY** (per `[[project_format_migration_post_deploy]]` — koden må
  slutte å selecte kolonnene før de droppes). Regenerer `database.types.ts`
  etter applisering (folder inn i #488-sporet hvis nødvendig).

## Edge Cases & Guardrails

- **Byte-identisk NO:** alt norsk innhold kopieres ordrett fra DB/`MODE_GUIDE`;
  ingen omskriving. Spesialtegn (`–`, `«»`, `→`, `÷`, `×`) bevares.
- **`points` er array:** lagres som JSON-array i katalogen, leses med `t.raw()`
  server-side. Detaljside + oversikt itererer som i dag.
- **`stableford-4bbb`-varianten:** egen content-nøkkel (summary+points), eget
  etikett-oppslag (`modeVariants.stableford_team`). Ikke slå sammen med
  `stableford`-nøkkelen (4BBB-teksten er bevisst ulik solo-teksten).
- **`long`/`example` valgfrie:** detaljsiden viser seksjonene kun når nøkkelen
  finnes/er ikke-tom. `t.has()`-guard (per epicens feilkode-mønster), aldri rå
  nøkkel.
- **Slug ↔ modus:** de 22 DB-slug-ene er alle base-`GameMode`-verdier (ingen
  variant-slug i `formats`-tabellen), så `tModes(f.slug)` er trygt i veiviseren.
- **Drop-migrasjon post-deploy:** PR-en kompilerer mot dagens
  `database.types.ts` (kolonnene finnes ennå); koden slutter bare å selecte dem.
  Ingen brutt mellomtilstand så lenge migrasjonen kjøres etter deploy.
- **Matrise-styringen røres ikke** — `format_intent_mapping` + `is_active` /
  `is_cup_eligible` / `icon_key` på `formats` er operasjonelle, ikke innhold.

## Key Decisions

- **Hardkode i katalog, ikke `format_translations`-tabell** (eier) — statisk
  innhold, samme mekanisme som resten av epicen, fjerner editor + DB-duplikat.
- **Gjenbruk `modes.*` for navn** (min vurdering) — allerede tospråklig og
  byte-matcher `display_name`; null duplisering.
- **Drop innholds-kolonnene** (eier: «ta bort det») — post-deploy migrasjon.
- **Behold matrise-editoren** — eieren bruker synlighet/primær/cup/aktiv aktivt;
  bare den frie-tekst-editoren fjernes.

**Claude's Discretion:**
- Eksakt katalog-nøkkel-struktur (`formatGuide.content.<key>` valgt).
- Sorterings-detalj i admin-matrisen etter at `display_name` forsvinner.
- Om `database.types.ts` regenereres i samme PR eller etter drop-migrasjon.

## Success Criteria

- [ ] **Veiviser på `/en`:** format-kortene (FormatGrid) + cup-format-velgeren
      viser engelsk navn + engelsk kort beskrivelse; på `/` (no) byte-identisk
      med dagens norske tekst.
- [ ] **Formatoversikt `/en/spillformater`:** etikett, sammendrag og punkter er
      engelske for alle 22 + 4BBB-varianten; norsk uendret på `/spillformater`.
- [ ] **Detaljside `/en/spillformater/[slug]`:** sammendrag, punkter, «slik
      funker det» (long) og eksempel er engelske; norsk uendret.
- [ ] **Editor fjernet:** Sekretariatets format-side har ingen fri-tekst-
      innholds-editor lenger; matrise-styringen (synlig/primær/cup/aktiv)
      fungerer som før.
- [ ] **Ingen DB-innholds-lesning igjen:** `getModeContent`/`modeGuide`/
      `parsePointsTextarea` slettet; ingen `select('... display_name ...
      rules_* ...')` mot `formats` for innhold.
- [ ] **Katalog-paritet:** `catalogParity.test.ts` grønn (no/en symmetriske).
- [ ] **Drop-migrasjon** finnes som fil, dokumentert som post-deploy.
- [ ] Ingen rå katalog-nøkkel og ingen norsk-på-`/en` synlig i de berørte
      flatene (spot-check).

## Gates (per chunk)

- [ ] `npx tsc --noEmit` passerer.
- [ ] `npm run build` passerer (fanger exhaustive-switch / `[locale]`-rute-feil).
- [ ] Co-lokaliserte `*.test.ts(x)` for endrede filer passerer + slettede
      testers konsumenter ryddet.
- [ ] `npx vitest run messages lib/formats` (katalog-paritet + format-helpere).
- [ ] Versjonsbump (MINOR — bruker-synlig: engelsk format-innhold) + CHANGELOG-
      oppføring (commit-msg-hook håndhever).

## Files Likely Touched

- `messages/no.json`, `messages/en.json` — `formatGuide.content.*` lagt til,
  `admin.formats.contentEditor.*` fjernet.
- `lib/formats/buildFormatGuide.ts` — katalog-drevet.
- `lib/formats/getModeContent.ts`, `modeGuide.ts` (+`.test`),
  `parsePointsTextarea.ts` (+`.test`) — slettet.
- `lib/formats/getFormatsForIntent.ts`, `getAllFormatsWithMappings.ts`,
  `types.ts` — innholds-felt fjernet.
- `app/[locale]/spillformater/[slug]/page.tsx` — katalog-drevet.
- `app/[locale]/admin/games/new/FormatGrid.tsx`, `CupSetup.tsx` — katalog-navn
  + -beskrivelse.
- `app/[locale]/admin/formats/FormatsManager.tsx`, `actions.ts` — editor fjernet.
- Diverse `*.test.tsx` for de berørte komponentene.
- `supabase/migrations/00XX_drop_format_content_columns.sql` (post-deploy).

## Out of Scope

- `gd`/`ga`-utkast (Fase G).
- Mail-innhold (Fase M).
- Matrise-styringen (synlighet/primær/cup/aktiv) — uendret.
- Lokalisering av rute-slugs (`/en/spillformater` beholder norsk slug).
