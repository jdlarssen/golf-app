# Forge-kontrakt: #643 — Skjul påmeldings-valg for klubb-turnering

**Issue:** https://github.com/jdlarssen/golf-app/issues/643
**Type:** bug (UX) · area:admin · **Bump:** patch
**Branch:** `claude/643-klubb-skjul-paameldingsvalg`

## Kontekst

I opprett-spill-veiviseren motsier copyen seg selv for en klubb-turnering: «Bare de
jeg inviterer (PRIVAT)» sier *«Vises ikke i Finn turneringer»*, men klubbmedlemmer
ser spillet i discovery uansett `registration_mode`. Dette er **by-design** i
`lib/games/getDiscoverableGames.ts:128-164` (#442: «medlemskap ER invitasjonen»),
så atferden er riktig — bare copyen/valget er feil.

**Beslutning (eier 2026-06-16):** Skjul «Hvem kan melde seg på?»-valget helt for
klubb-spill, siden medlemskap = invitasjon. Spillet lagres som `invite_only`
(medlemmer ser+melder seg på via discovery; ikke-medlemmer kan ikke bli med via
lenke — det er ønsket for en klubb-turnering).

## Relevante filer (fra scouting)

- `app/[locale]/admin/games/new/GameWizard.tsx:815` — RegistrationSection mountes i steg 2 (ubetinget i dag)
- `app/[locale]/admin/games/new/GameWizard.tsx:818-824` — ClubPicker (vises kun `intent==='klubb' && clubs.length>0`)
- `app/[locale]/admin/games/new/sections/RegistrationSection.tsx` — selve valget
- `app/[locale]/admin/games/new/useGameFormState.ts:469-471` — default `registrationMode='invite_only'`
- `app/[locale]/admin/games/new/useGameFormState.ts:484-495` — `groupId`-state (resettes til `''` når intent forlater 'klubb')
- `app/[locale]/admin/games/new/GameWizard.tsx:1005` — `<input type="hidden" name="group_id" value={groupId} />`
- `messages/no.json` / `messages/en.json` — `wizard.sections.club.hint` («Medlemmene kan se og melde seg på alle spill du setter opp for klubben.»)

## Suksess-kriterier

- [ ] 1. **RegistrationSection skjules når en klubb er valgt.** Betingelse = `groupId !== ''` (robust: groupId er kun satt for klubb-intent). Når brukeren velger «Ingen klubb» / fjerner klubb → seksjonen vises igjen.
- [ ] 2. **Klubb-spill publiseres med `registration_mode='invite_only'`.** Når `groupId` er satt, tvinges `registrationMode='invite_only'` i state, så hidden-feltet/payload er korrekt selv om seksjonen ikke rendres. Verifiser at «Neste»/publish ikke blokkeres av en skjult seksjon.
- [ ] 3. **Den villedende copyen vises aldri for klubb-spill.** «Vises ikke i Finn turneringer» / «Privat. Vises ikke i Finn turneringer…» rendres ikke når en klubb er valgt.
- [ ] 4. **ClubPicker-hint dekker forventningen.** Verifiser at `wizard.sections.club.hint` («Medlemmene kan se og melde seg på alle spill…») er synlig i samme steg, så arrangøren forstår at medlemmer finner runden. (Ingen ny nøkkel nødvendig hvis den allerede vises tydelig der valget pleide å stå; legg ev. til en kort linje hvis steget ser «tomt» ut.)
- [ ] 5. **Ikke-klubb-spill uendret.** Kompis/Cup/Solo (groupId tom) viser RegistrationSection nøyaktig som før — alle tre moduser valgbare. Ingen regresjon.
- [ ] 6. **Gates grønne** og veiviseren publiserer gyldig payload både for klubb (invite_only, group_id satt) og ikke-klubb (valgt modus).

## Gates

```bash
npx tsc --noEmit
npx vitest run app/[locale]/admin/games/new   # wizard/state-tester hvis de finnes
```
- Manuell: klubb-sti → ingen påmeldings-valg, publiserer invite_only; kompis-sti → valg synlig.
- Co-located test for ny state-logikk (force invite_only når groupId satt) hvis `useGameFormState` har test-fil; ellers minimal render-assert.

## Non-goals

- **Ikke** røre `getDiscoverableGames.ts` (by-design #442).
- **Ikke** endre `registration_mode`-semantikk for ikke-klubb-spill.
- **Ikke** legge til ny «klubbmedlem-only»-modus i DB. Vi gjenbruker `invite_only`.
- Ingen migrasjon.
