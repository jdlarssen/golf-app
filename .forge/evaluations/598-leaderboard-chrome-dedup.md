# Evaluering: #598 — Del leaderboard-chrome (`Shell`/`Header`) i én modul

## Verdict: **ACCEPT**

Behavior-preserving refactor verifisert uavhengig. Begge subtile påstandene (Shell-unifisering + Header aria-label-namespace-fold) holder byte-identisk. Alle gates grønne, ingen test-/snapshot-filer rørt, scope strengt avgrenset, ingen over-abstraksjon.

Base for alle differ: `eaaea17d` → `HEAD` (88673d12).

---

## Gate-resultater (kjørt av evaluator)

| Gate | Kommando | Resultat |
|------|----------|----------|
| Test | `npm run test` | **`Test Files 270 passed (270)` / `Tests 3418 passed (3418)`** — exit 0 |
| Build | `npm run build` | **`✓ Compiled successfully in 8.2s`**, `✓ rootParams`, static pages 256/256 — **exit 0** (next build = tsc + bundling + eslint, autoritativ) |
| Test/snapshot-diff | `git diff eaaea17d..HEAD --name-only \| grep -E '\.test\.\|__snapshots__\|\.snap'` | **EMPTY** — ingen testfiler endret, ingen snapshots oppdatert |

---

## Suksesskriterier (K1–K7)

| K | Krav | Status | Evidens |
|---|------|--------|---------|
| **K1** | Ny modul `LeaderboardChrome.tsx`: eksporterer `LeaderboardShell` (`chromeless?=false`) + `LeaderboardHeader` (`{gameName,backHref}`); ingen `'use client'`; norsk JSDoc i Footer-stil | **PASS** | Filen finnes (LeaderboardChrome.tsx:1–79). Eksporterer `LeaderboardShellProps`/`LeaderboardShell`/`LeaderboardHeaderProps`/`LeaderboardHeader`. `chromeless = false` default (linje 26). Ingen `'use client'` (linje 1 = `import type`). Norsk JSDoc (linje 18–23, 53–58). |
| **K2** | Alle Shell-bærende filer importerer `LeaderboardShell`; ingen lokal `function Shell(` | **PASS** | `grep -rl 'function Shell('` ⇒ **tom**. `grep -rn 'function Shell('` ⇒ 0 treff. |
| **K3** | 38/39 Header-filer bruker `LeaderboardHeader`; lokal `function Header(` kun i State4View | **PASS** | `grep -rl 'function Header('` ⇒ **kun `State4View.tsx`** (linje 198). Eneste `<Shell`-treff er JSDoc-kommentar i State4View:30 (verifisert: «omits the outer `<Shell>` wrapper»). |
| **K4** | Render-output uendret: alle leaderboard-render-tester grønne **uten** `-u`; hele suiten grønn | **PASS** | 3418/3418 grønne uten `-u`. Ingen `__snapshots__`/`.snap`/`.test.` i diffen (se gate-tabell). |
| **K5** | `npm run build` passerer rent (tsc + Next) | **PASS** | Exit 0, «Compiled successfully». Ingen stray `<Shell>`/`<Header>` igjen (build fanger dette — kjørt og passert). |
| **K6** | `npm run lint` rent på endrede filer | **PASS** | `eslint` på de 41 endrede `.tsx` ⇒ **0 errors, 16 warnings**. Alle 16 warnings er **pre-eksisterende** (verifisert mot `eaaea17d`): underscore-prefiksede ubrukte params (`_gameId`, `_gameStatus`) + next-intl `t`-false-positive i State4View (der `t` faktisk brukes på linje 192/213/251…). Ingen NYE warnings introdusert. `next build` kjører eslint og passerte. |
| **K7** | Atomiske `refactor(leaderboard):`-commits, alle med `Refs #598`; ingen versjon-bump; ingen `--no-verify` | **PASS** | 5 commits: `c160cded` (extract), `e457c71a` (Group A Views), `b28b7899` (Group A Podiums), `a7c90330` (Group B matchplay+holes), `88673d12` (State4View). Alle har `Refs #598` i body (verifisert per commit). `package.json`/`CHANGELOG.md` **ikke** rørt → ingen bump (korrekt for behavior-preserving). |

---

## De 5 verifikasjons-sjekkene

### 1. Gates passerer (evaluator-kjørt)
**PASS.** Test 3418/3418 (270 filer), build exit 0, test/snapshot-diff EMPTY. Se gate-tabell over.

### 2. Strukturell komplethet
**PASS.** `function Shell(` ⇒ 0. `function Header(` ⇒ kun State4View:198. `<Shell>`-treff ⇒ kun JSDoc-kommentar i State4View:30 (ekte kode-treff: 0).

### 3. Behavior-preservation (kjerne-skeptisk sjekk)

**3a. Shell-unifisering — PASS.**
- `LeaderboardShell` `chromeless=false`-gren (linje 36–43): `<AppShell><div className="relative isolate pb-12"><LeaderboardBackdrop/><div className="relative">{children}</div></div></AppShell>` — eksakt match mot gammel no-prop Shell.
- Gammel `WolfHolesView` Shell @ `eaaea17d` (linje 112–121): byte-identisk `<AppShell><div className="relative isolate pb-12">…`. 
- Gammel prop-bærende Shell @ `SkinsView` `eaaea17d` (linje 218–242): identisk `chromeless`-gren + `chromeless=false`-gren — bekrefter at de TO gamle variantene var samme funksjon.
- `NinesHolesView` (linje 60/82) + `NassauHolesView` (linje 58/80) kaller nå `<LeaderboardShell>` **uten** chromeless-prop → default false → matcher gammel no-prop Shell.

**3b. Header aria-label namespace-fold — PASS (subtil, verifisert ende-til-ende).**
- Gamle holes-views delte seg i TO mønstre: `t('common.backAriaLabel')` (Nines/AceyDeucey/BBB/RoundRobin/SoloStableford/SoloStrokeplay) vs `tc('backAriaLabel')` (Nassau/Skins/Wolf).
- Gammel `NinesHolesView` @ `eaaea17d`: `const t = useTranslations('leaderboard')` (linje 57) + `aria-label={t('common.backAriaLabel')}` → resolverer til **`leaderboard.common.backAriaLabel`**.
- Ny `LeaderboardHeader`: `const tc = useTranslations('leaderboard.common')` (linje 64) + `tc('backAriaLabel')` → resolverer til **`leaderboard.common.backAriaLabel`**.
- Katalog-verifikasjon (Python JSON-path): `messages/no.json` → `leaderboard.common.backAriaLabel === 'Tilbake'`; `messages/en.json` → `'Back'`. Begge gamle mønstre + det nye peker på SAMME nøkkel/verdi. **Identisk output.** Ingen behavior-endring.

**3c. backHref-utledning — PASS.**
- Alle 9 holes-views sender `backHref={`/games/${gameId}`}` (verifisert i alle: SoloStrokeplay, AceyDeucey, Nassau, Skins, Nines, RoundRobin, SoloStableford, Wolf, BBB) — matcher gammel `href={`/games/${gameId}`}`.
- View/Podium-filer beholder eksisterende `backHref?: string` med default `'/'` og sender den videre (spot-sjekk SkinsView linje 49/84/97, NassauPodium linje 35/64/87) — ikke hardkodet.

### 4. Scope-ærlighet
**PASS.** `git diff eaaea17d..HEAD --name-only` ⇒ 42 filer, **alle** under `app/[locale]/games/[id]/leaderboard/**` + `.forge/contracts/598-…md`. Ingen treff utenfor (`grep -v` ⇒ NONE). `lib/scoring/` **urørt**. `package.json`/`CHANGELOG.md` urørt. Netto −1581 linjer (463 ins / 2044 del) — konsistent med fjerning av ~40 Shell + 38 Header-kopier. Ingen duplikat-eksport-renames, ingen død-kode-fjerning utover Shell/Header-ekstrasjonen.

### 5. Over-abstraksjon
**PASS.** `LeaderboardChrome.tsx` inneholder **kun** `LeaderboardShell` + `LeaderboardHeader` — `grep PlayerRow|HoleRow|SectionBlock|PodiumStep` ⇒ 0 treff i modulen. Format-spesifikke row/section-helpers forblir lokale (33 treff på `function PlayerRow/HoleRow/SectionBlock/PodiumStep` spredt over view-filene). Korrekt: disse har genuint ulike data-shapes per format og skal IKKE slås sammen.

---

## Bekymringer

Ingen blokkerende. Notater:

1. **16 lint-warnings (pre-eksisterende, ikke-blokkerende).** Underscore-ubrukte params + en next-intl `t`-false-positive i State4View. Verifisert at samtlige fantes på `eaaea17d` — refactoren introduserte null nye. Build (som kjører eslint) passerte. Kunne ryddes i et eget cosmetisk pass, men er utenfor denne behavior-preserving-kontrakten.

2. **OUT-scope respektert.** State4View beholder lokal Header (har `onReplay`-knapp) — korrekt utelatt. Spor-B død-kode, duplikat-eksporter, `lib/scoring/`-dup og test-dedup ble bevisst IKKE rørt, jf. kontrakt.

**Konklusjon: ACCEPT.** Refactoren er ekte behavior-preserving — render-tester grønne uten snapshot-oppdatering, namespace-folden resolverer til identisk katalog-nøkkel, og scope er disiplinert.
