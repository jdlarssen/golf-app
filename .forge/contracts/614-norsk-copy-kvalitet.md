# Spec: Norsk copy-kvalitet — fjern engelske ord og anglismer i veiviser/admin (#614)

## Problem
Etter i18n-epicen (#60) lekker engelske ord og anglismer inn i den ellers gjennomførte norske copyen i veiviseren og admin (Klubbhuset). Det mest synlige: admin-kortet heter rett og slett «Formats» midt blant «Spillere», «Baner», «Cuper». «Tap et spill» bruker en *eksplisitt forbudt* anglisme (`docs/copy-style.md`: «Tap» = loss/tap, ikke trykk). Under scouting viste det seg at samme klasse lekkasje stikker dypere enn issuets 6 kulepunkter: en 2. «Tap» på baner-kortet, «Primary»/«Cup-eligible formats»/«Demote»/«Format-mapping» i admin-format-flaten, og hele «gross»-klyngen (~40 hjelpetekster) + «strokes»/«alternate shot»/«point» i scoring-hjelpetekstene. Dette er den norske flaten alle nåværende brukere ser.

**Alt arbeid er i `messages/no.json`. `messages/en.json` er korrekt engelsk og røres IKKE.**

## Prior Decisions
- **i18n #60-serien:** `no.json` er sannhetskilde; `en.json` speiler nøkler (ikke verdier). `catalogParity.test.ts` vokter at hver no-nøkkel finnes i en — den sjekker NØKLER, ikke verdier, så verdi-endringer er trygge mot den.
- **#594 (mail Fase M):** `gameFinished`-mail har byte-identiske NO-snapshot-tester. Linjene 4262/4263 (`bodySoloStrokeplay`/`bodyTexasScramble`) bruker `({gross} brutto)` — **rør dem ikke**.
- **Fase D:** format-tekster er hardkodet i `no.json` (ikke DB) — fritt å rette der.
- `docs/copy-style.md`: «Tap»→«Trykk» er mekanisk håndhevet anglisme. «Sekretariat»-stemmen og engelske achievement-navn (Turkey/Solid/Snowman) er bevisst bevart — ikke i scope her.

## Owner-beslutninger (denne runden)
- **Scope C:** full feiing — admin/veiviser-anglismer + hele «gross»→«brutto»-klyngen + «strokes/alternate shot/point» i scoring-hjelpetekstene.
- **«course handicap» → «banehandicap»** overalt i UI-copy (NGFs offisielle term; påvirker IKKE scoring-koden).
- **Admin format-kort = «Format-styring»**, og side-tittelen «Format-mapping» døpes også om til «Format-styring».

## Design
Ren copy-retting i `no.json`. Erstatt engelske ord/anglismer med norsk, behold genuine golf-termer. Tre klasser:

**1. Anglismer / engelske ord (admin + veiviser):**
| Token | → | Steder (ca. linje) |
|---|---|---|
| `wizarden`/`wizardens`/`game-wizard` | `veiviseren`/`veiviserens`/`spill-veiviseren` | 2527, 2957, 3107, 3130 |
| `Toggles` | `Brytere` | 3130 |
| `step 2` | `steg 2` | 3107 |
| `Tap et spill` / `Tap en bane` | `Trykk på et spill` / `Trykk på en bane` | 2478, 3024 |
| `Formats` (tilesFormats) + `Format-mapping` (kicker/title) | `Format-styring` | 2513, 3105, 3106 |
| `Primary` / `primary` / `primary-format` | `Primær` / `primær` / `primærformat` | 3112, 3113, 3128, 3144, 3145 |
| `Cup-eligible formats` / `cup-eligible` | `Cup-kvalifiserte formater` / `cup-kvalifisert` | 447, 3129, 3146, 3147 |
| `Demote stjernen` | `Senk stjernen` | 3113 |
| `Allowance (%)` / `Allowance må…` / `HCP-allowance` / `uten allowance` | `Handicap-andel (%)` / `Handicap-andelen må…` / `HCP-andel` / `uten handicap-andel` | 1293, 984, 830, 957, 467 |

**2. Golf-termer (owner: Norwegianiser):**
| Token | → | Notat |
|---|---|---|
| `gross` (ordet, i prosa) | `brutto` | ~40 treff i allowance-descriptions/bruttoHelpers (463–949), `allowance.bruttoHelper.*` (1295–1316), mode-eksempler (1044/1063/1074/1084) |
| `course handicap` | `banehandicap` | 25, 228, 771, 926, 1383 (`courseHandicap` label → «Banehandicap»), 2661, 2685 |
| `strokes` / `extra strokes` | `slag` / `ekstraslag` | 468, 469, 479, 748, 754, 760, 766, 903, 909, 915 |
| `alternate shot` | `vekselslag` | 467, 746, 752, 758, 901, 907, 913, 1001, 1143, 1154, 1165, 1176 |
| `point`/`Point-mål`/`point-utdeling` | `poeng`/`Poeng-mål`/`poeng-utdeling` | 456, 983, 1308, 3796, 3890 |

Endelig ordlyd avgjøres av `humanizer`-skillet (kjøres over alle endrede strenger før commit) — tabellen er målet, humanizer pusser flyten.

## Edge Cases & Guardrails
- **`{gross}` er en ICU-VARIABEL, ikke ordet.** Linjer der `{gross}` står sammen med det norske ordet «brutto» (1887, 1929, 1996, 2047, 2048, 2070, 2087, 2102) rendrer allerede korrekt («85 brutto»). **IKKE endre** — verken variabelnavnet (kode matcher det) eller teksten.
- **Mail-snapshot-lås:** 4262/4263 (`bodySoloStrokeplay`/`bodyTexasScramble`) bruker `{gross}` + byte-identisk NO-snapshot (#594). **Rør ikke.**
- **«CH»-forkortelsen** i format-guide-eksempler (1044/1063/1074: «CH 12») beholdes — «BH» betyr noe helt annet på norsk. Bare det fulle uttrykket «course handicap» → «banehandicap».
- **Genuine golf-termer som BEHOLDES** (ikke anglismer): `scratch` (Scratch-format/matchplay), `handicap`, `netto`, `brutto`, `par`, `birdie`, `eagle`, `bogey`, `stableford`, `matchplay`, `tee`, `WHS`, `SI`, `HCP`, og alle format-NAVN (`fourball`/`four-ball`, `foursomes`, `greensome`, `chapman`, `gruesome`, `texas/florida scramble`, `ambrose`, `shamble`, `patsome`, `best ball`, `skins`, `nassau`, `wolf`, `nines`, `round robin`, `acey deucey`).
- **Komponent-tester som spør på norsk etikett-tekst vil knekke** og må oppdateres til ny copy (ikke nye tester, kun litteral-bytte):
  - `AllowanceField.test.tsx`: `getByLabelText('Allowance (%)')` ×4 → `'Handicap-andel (%)'`.
  - `FormatsManager.test.tsx` (rendrer mot no.json): verifiser om den asserter «Primary»/«Cup-eligible»/«Format-mapping» — oppdater i så fall.
  - `spillformater/[slug]/page.test.tsx`: verifiser om den asserter «gross»/«course handicap».
- **en.json:** uendret. Skal synes som «kun no.json + tester + CHANGELOG + package.json» i git diff.

## Key Decisions
- **Scope C** (owner): full feiing inkl. golf-termer. — gir konsistent norsk flate, lukker #614 permanent.
- **«banehandicap»** (owner): NGFs offisielle oversettelse av «course handicap».
- **«Format-styring»** (owner): unikt fra nabokortet «Spillformater» (spiller-guiden), brukes på både kort og side-tittel.
- **`{gross}`-variabel + mail-snapshots ekskludert**: ikke-anglisme (variabel) hhv. test-låst.

**Claude's Discretion:**
- Eksakt norsk for «Primary»-toggle/heading («Primær» vs «Hovedformat») — velg det som leser best i kontekst; humanizer avgjør.
- «alternate shot» → «vekselslag» vs «vekselvis slag» der prosaen allerede glosserer mekanikken.
- Om «point-utdeling» (Wolf) skal bli «poeng-utdeling» eller omskrives helt.

## Success Criteria
- [ ] `grep -niE ':\s*"[^"]*(wizard|toggles|step [0-9]|cup-eligible|demote|format-mapping)' messages/no.json` → ingen treff.
- [ ] `grep -nE ':\s*"Tap ' messages/no.json` → ingen treff (begge tapHint = «Trykk på …»).
- [ ] `grep -niE ':\s*"[^"]*(allowance)' messages/no.json` → ingen treff med engelsk «Allowance»/«HCP-allowance» (kun nøkkelnavn som `fourballAllowance…` består).
- [ ] `grep -niE ':\s*"[^"]*course handicap' messages/no.json` → ingen treff; `courseHandicap`-verdi = «Banehandicap».
- [ ] Ordet «gross» finnes kun som ICU-variabel `{gross}` i no.json (`grep -nE 'gross' messages/no.json` viser kun `{gross}`-rader). Mail-linjene 4262/4263 uendret (`git diff` bekrefter).
- [ ] `tilesFormats` = «Format-styring»; `formats.kicker`/`formats.title` = «Format-styring». en.json uendret (`git diff --stat` viser kun no.json under messages/).
- [ ] `humanizer`-skillet kjørt over alle endrede strenger; pre-commit-hook gir ingen nye AI-tell-advarsler på endrede linjer.

## Gates
- [ ] `npx tsc --noEmit` passerer (eller `npm run build` for uttømmende ekshaustiv-sjekk).
- [ ] `npx vitest run messages/catalogParity.test.ts` grønn (nøkkel-paritet intakt).
- [ ] `npx vitest run` (full suite) grønn — komponent-tester med norsk-etikett-spørringer oppdatert til ny copy.
- [ ] `.githooks/pre-commit` (humanizer-tell-scan) gir ingen nye advarsler på endrede `.tsx`/`.ts`-linjer (JSON skannes ikke, men kjør humanizer-skillet manuelt likevel).
- [ ] `.githooks/commit-msg` passerer: `fix(...)`-commit med `package.json`-patch-bump + `CHANGELOG.md`-oppføring staget.

## Files Likely Touched
- `messages/no.json` — alle copy-endringene (eneste innholds-fil).
- `components/admin/AllowanceField.test.tsx` — etikett-spørring «Allowance (%)» → «Handicap-andel (%)».
- `app/[locale]/admin/formats/FormatsManager.test.tsx` — evt. assert-litteraler hvis den treffer endrede strenger.
- `app/[locale]/spillformater/[slug]/page.test.tsx` — evt. assert-litteraler.
- `package.json` + `CHANGELOG.md` — PATCH-bump (copy-justering, bruker-synlig).

## Out of Scope
- `messages/en.json` — allerede korrekt engelsk.
- Omdøping av format-NAVN eller «scratch» (genuine golf-termer).
- `{gross}`-variabelen, og `gameFinished`-mail-linjene 4262/4263 (snapshot-låst #594).
- «CH»-forkortelsen i format-guide-eksempler.
- Kode-endringer (scoring/komponenter) — ren copy-retting.
- Andre i18n-rester sporet separat: #621 (handicap-komma /en), #617 (spillnavn-måned /en).
