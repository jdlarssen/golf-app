# Kontrakt: SideWinnersForm viser valideringsmelding for db_winners-databasefeil (#1567)

Kilde: kontrakt-kommentar på issue #1567 (kontrakt-smeden, verifisert mot main @ e2ce624).
Re-verifisert mot main @ b123ef41 ved byggestart 2026-08-14: defekten sto fortsatt
(én hardkodet `t('validationError')` for alle feilkoder, SideWinnersForm.tsx:37–41).

## Problem

`SideWinnersForm` rendret «Du må velge vinner i alle feltene …» for ALLE feilkoder —
også `db_winners` (databaseskrivefeil fra `endGameCore.ts`, feltene ER fylt).
Koder som når skjemaet: `missing_ld_N`/`missing_ctp_N` (validering) og `db_winners`
(rutes tilbake til veiviseren i `avslutt/actions.ts`; alt annet går til detaljsiden).
Begge konsumenter (admin- og creator-avslutt-siden) deler komponenten.

## Design (bygget)

- Prefix-sjekk i komponenten: `typeof error === 'string' && error.startsWith('missing_')`
  → valideringsmelding; alt annet (i praksis `db_winners`, samt string[]-arrays fra
  duplisert URL-param og ukjente fremtidige koder) → ny nøkkel
  `admin.game.sideWinners.dbError` — fail-safe-retningen.
- Copy: no «Klarte ikke å lagre vinnerne. Prøv igjen.» / en "Couldn't save the
  winners. Please try again." (tone fra `admin.game.errors.db_finish`; humanizer-sjekk
  kjørt — ingen tells).

## Success Criteria

- [x] `error="db_winners"` → db-meldingen; `error="missing_ld_1"` → valideringsmeldingen.
  ÉN ny colocated render-test (Type C) — komponenten hadde ingen test fra før.
  **Evidens:** `SideWinnersForm.test.tsx` (én `it`, render + rerender); RØD før fiksen
  (1 failed — db_winners viste valideringsmeldingen), GRØNN etter. TDD-sekvens bekreftet.
- [x] Nøkkelen finnes i BÅDE `messages/no.json` og `messages/en.json`.
  **Evidens:** diff = 2 filer, 2 innsettinger (kun `dbError`-linjene);
  `npx vitest run messages/catalogParity.test.ts` grønn.
- [x] `npm run typecheck` + lint + vitest grønt.
  **Evidens:** tsc exit 0; `npx eslint` på begge berørte filer exit 0;
  render-test + catalogParity 3/3 grønne. `npm run build` exit 0 (§T2-full-gate).
- [x] Staging-verifisering før merge: `?error=db_winners` på avslutt-veiviseren →
  retry-meldingen vises, ikke valideringsmeldingen.
  **Evidens:** staging-klikkrunde 2026-08-14 på PR-HEAD 4f200643 mot E2E-testspill
  (active, LD=1, CTP=1): `[data-testid=side-winners-error-db]` rendret for
  db_winners, `…-validation` for missing_ld_1 — begge med invers-assertion.
  Console + server-errorlogg tomme. Bevis-kommentar + `staging-verified`-label på
  PR #1601; E2E-testdata slettet (1+1 rader).

## Gates

tsc + lint + vitest + build grønne lokalt. Bruker-synlig fix → staging-klikkrunde +
bevis-kommentar + `staging-verified`-label FØR merge. Notatfil
`.changes/1567-sidewinners-db-feilmelding.md` (type fix).

## Commits

- fix(admin): show retry message for db_winners instead of validation copy
