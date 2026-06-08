# Forge-kontrakt: #498 — Kompakte format-kort + «?»-overlay + Spillformater-redesign

- **Issue:** https://github.com/jdlarssen/golf-app/issues/498
- **Branch:** `claude/charming-goldstine-7421ce`
- **Milestone-tråd:** Hjem-IA-redesign (oppfølger #500 tas separat etterpå)
- **Versjonsbump:** MINOR (bruker-synlig feature). Fra `1.103.1` → `1.104.0`.

## Mål

Format-kortene i veiviserens steg 2 er for tunge (ikon + navn + forklaring + chip
alltid). Gjør dem minimale i kollapset tilstand; vis forklaring kun på valgt kort,
og flytt format-oppslagsverket inn i et «?»-ark som åpnes *uten* å forlate veiviseren.
Rydd opp i feilstavelsen «Spillformer» → «Spillformater» og del format-guide-lista
mellom oppslagssiden og arket.

Retning besluttet via brainstorming 2026-06-08 (eier valgte **A+C**).

## Beslutninger (gråsoner avklart)

1. **Overlay-mønster:** bunn-ark modellert etter eksisterende
   [`components/hole/SpecificValueSheet.tsx`](../../components/hole/SpecificValueSheet.tsx)
   (`role="dialog"`, `aria-modal`, Esc-lukk, backdrop-lukk, reduced-motion-trygt).
   Ikke nytt modal-bibliotek — følger appens etablerte ad-hoc-overlay-konvensjon.
   Bruker `position: fixed` (dekker viewport), ikke `absolute`, så det legger seg over
   hele veiviseren.
2. **Mail-lenke:** invitasjons-mailens `tornygolf.no/spillformer` oppdateres til
   `/spillformater` + de 2 snapshot-testene re-snapshottes (eier bekreftet 2026-06-08).
   Den permanente redirecten fanger allerede-utsendte mailer.
3. **«Vanligst»-header:** primary-gruppen får nå en synlig `Vanligst`-header (har ingen
   i dag) for å speile «Flere muligheter»-headeren — per spec-ens gruppe-inndeling.
4. **Radiogroup-a11y-labels** (`Hovedformater`/`Sekundære formater`) beholdes uendret
   for å holde eksisterende render-test grønn; bare den *synlige* headeren endres.
5. **`FormatGuideList`-form:** delt klient-vennlig komponent som tar `modeContentMap`
   (server-fetchet) + en `variant`/`withDetailLinks`-flagg. `CATALOG` flyttes inn i den.
   Arket bruker `withDetailLinks=false` (dropper «Les mer →»); siden bruker `true`.

## Success-kriterier

### A. FormatGrid — kompakt stil
- [ ] Ikonene fjernet fra kortene (`formatIconFor`/`icon_key` ikke lenger brukt i `FormatGrid`).
- [ ] Kollapset kort: navn (serif) + Solo/Lag-chip(s) høyrejustert, **ingen** forklaringstekst, 2-kol grid, tap-target ≥44px.
- [ ] Gruppe-inndeling beholdt: synlig `Vanligst` (primary) + `Flere muligheter` (secondary).
- [ ] Valgt kort utvider til full bredde (`grid-column: 1 / -1`), viser `short_description` + «Slik funker det →» som åpner arket (ikke navigasjon).
- [ ] Bytte av format kollapser forrige og utvider nytt.
- [ ] `prefers-reduced-motion`: ingen utvid/kollaps-animasjon.

### B. Solo/Lag-chips
- [ ] `PLAY_STYLE_LABELS.individual` = `'Solo'` (merge «Hver for seg» → «Solo»); `formatPlayStyle`-klassifisering uendret.
- [ ] Fleksibelt format **uten** `teamSize` (veiviseren) viser **to** chips: «Solo» + «Lag» (pensjonerer «Solo eller lag»).
- [ ] Fleksibelt format **med** `teamSize` (4BBB-kort) viser én chip som før.
- [ ] Kategori-farger: skifer for Solo, terrakotta for Lag — nye tokens i `:root`, `@media (prefers-color-scheme: dark)` **og** `[data-theme='dark']`. Gull (`--accent`) ikke brukt.

### C. «?»-overlay i veiviseren
- [ ] Diskré «?»-knapp øverst til høyre på steg 2, via ny valgfri `action`-slot i `StepperHeader`. `aria-label`: «Spillformater — slik funker de».
- [ ] Trykk → bunn-ark glir opp over veiviseren; lukk (✕/backdrop/Esc) → tilbake der man var. Veiviser-state urørt.
- [ ] «Slik funker det →» på valgt kort åpner samme ark, scrollet til det formatet.
- [ ] Ark-innhold = delt `FormatGuideList` (ekstrahert fra `app/spillformer/page.tsx`: `CATALOG` + `ModeGuideCard` + `mergeModeContent`). `modeContentMap` hentes i `app/admin/games/new/page.tsx` og sendes inn som prop.
- [ ] Ark-varianten dropper `detailHref`/«Les mer →».

### D. /spillformer → /spillformater
- [ ] Rute renamet: `app/spillformer/` → `app/spillformater/` (`page.tsx` + `[slug]/page.tsx` + co-located tester).
- [ ] Permanent redirect i `next.config.ts`: `/spillformer` → `/spillformater` og `/spillformer/:slug` → `/spillformater/:slug`.
- [ ] Alle interne lenker oppdatert: `modeDetailHref` i `app/games/[id]/page.tsx`, `BackLink` i `[slug]/page.tsx`, mail-lenke i `lib/mail/inviteNotification.ts`, kommentarer/strenger.
- [ ] Synlig tekst: tittel/metadata/`Kicker` «Spillformer»/«SPILLFORMER» → «Spillformater»/«SPILLFORMATER».
- [ ] Siden bruker delt `FormatGuideList`.

### Tester (per docs/test-discipline.md)
- [ ] `FormatStyleBadge.test.tsx` oppdatert (én render-test): solo/individual → «Solo», team → «Lag», flexible uten teamSize → to chips, flexible m/teamSize → én. Ingen *nye* test-filer.
- [ ] `FormatGrid.test.tsx`: beholdt/oppdatert maks én render-test (forklaring kun på valgt).
- [ ] Snapshots med «Hver for seg»/«Solo eller lag»/«Spillformer»/`/spillformer` re-snapshottet via `npx vitest -u`.
- [ ] Co-located tester for endrede filer grønne.

### Versjon / copy
- [ ] `package.json` → `1.104.0` + CHANGELOG-oppføring (per docs/changelog-conventions.md).
- [ ] `humanizer:humanizer` kjørt på ny norsk copy («Slik funker det», ark-tekster, evt. ny subtitle).

## Gates (scoped til endring)
1. `npx vitest run <endrede testfiler>` — co-located grønt.
2. `npx tsc --noEmit` — ingen type-feil (nye GameMode/union-medlemmer treffer ikke her, men chip-refactor + props gjør).
3. `npm run build` — Next.js-bygget grønt (verifiserer redirect-config + rute-rename + RSC/client-grenser).
4. `npm run lint` på endrede filer.

## Avgrensning (IKKE i dette issuet)
- Hjem-side-rekkefølge + fjerning av format-guide-kort + «Mer kommer snart» + Klubbhuset-tile → #500 (separat).
- Ingen endring i DB-skjema/seed (`icon_key` blir bare ubrukt i grid-en).

## Filer som berøres
- `app/admin/games/new/FormatGrid.tsx` — kompakt kort, ikoner vekk, utvid-ved-valg
- `app/admin/games/new/GameWizard.tsx` (`StepperHeader` action-slot + ark-state + «?»-knapp)
- `app/admin/games/new/page.tsx` — hent `modeContentMap`, send inn
- ny `components/FormatGuideList.tsx` + ny `components/FormatGuideSheet.tsx`
- `components/ui/FormatStyleBadge.tsx` — kategori-fargede chip(s), to chips for flexible
- `lib/scoring/modes/types.ts` — `PLAY_STYLE_LABELS.individual` → «Solo»
- `app/globals.css` — chip-tokens (lys + 2× mørk)
- `app/spillformer/` → `app/spillformater/` (rename) + `app/games/[id]/page.tsx`, `lib/mail/inviteNotification.ts`
- `next.config.ts` — redirects
- Tester: `FormatStyleBadge.test.tsx`, `FormatGrid.test.tsx`, `ModeGuideCard.test.tsx`, `inviteNotification.test.ts`, `app/spillformater/[slug]/page.test.tsx`
