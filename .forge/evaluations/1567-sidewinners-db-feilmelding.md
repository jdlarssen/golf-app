# Evaluering: #1567 SideWinnersForm db_winners-feilmelding — ACCEPT

**Verdikt: ACCEPT** (kode-kriterier). Findings: ingen.

Evaluator: fersk-kontekst subagent, 2026-08-14.
Branch: `fix/1567-sidewinners-db-error-message` @ `4ce503e7` (1 commit over `origin/main`).
Kontrakt: `.forge/contracts/1567-sidewinners-db-feilmelding.md`.
Staging-kriteriet (siste checkbox) er eksplisitt UTENFOR denne evalueringen — planlagt separat.

Alle påstander under er reprodusert i denne økten; kontraktens egne evidens-linjer er
ikke lagt til grunn.

## Diff-omfang (verifisert)

`git diff origin/main...HEAD --stat` → 5 filer, 47 innsettinger, 1 sletting:

| Fil | Endring |
|---|---|
| `app/[locale]/admin/games/[id]/avslutt/SideWinnersForm.tsx` | +7/-1 (ternær + kommentar) |
| `app/[locale]/admin/games/[id]/avslutt/SideWinnersForm.test.tsx` | ny, 34 linjer, én `it` |
| `messages/no.json` | +1 |
| `messages/en.json` | +1 |
| `.changes/1567-sidewinners-db-feilmelding.md` | ny notatfil (type: fix, issue: 1567) |

Ingen urelaterte endringer. `git status --porcelain` = rent tre (kun den utrackede
kontraktfila). Messages-diffen er nøyaktig 2 tillagte linjer
(`git diff origin/main...HEAD -- messages/ | grep -c '^+[^+]'` → `2`).

## Gates (kjørt av evaluator, Node v22.23.0)

| Gate | Kommando | Resultat |
|---|---|---|
| Vitest | `npx vitest run "app/[locale]/admin/games/[id]/avslutt/SideWinnersForm.test.tsx" messages/catalogParity.test.ts` | **PASS** — `Test Files 2 passed (2) / Tests 3 passed (3)` |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **PASS** — `EXIT=0` |
| Lint | `npx eslint` på begge berørte filer | **PASS** — `ESLINT_EXIT=0`, ingen output |
| Build | `npm run build` (med `set -o pipefail`) | **PASS** — `BUILD_EXIT=0` |

## Kriterium 1 — `db_winners` → db-melding, `missing_ld_1` → validering — PASS

`SideWinnersForm.tsx:42-44`:

```tsx
{typeof error === 'string' && error.startsWith('missing_')
  ? t('validationError')
  : t('dbError')}
```

Testen (`SideWinnersForm.test.tsx:21-32`) rendrer med `error="db_winners"`, asserter
«Klarte ikke å lagre vinnerne. Prøv igjen.», rerender med `error="missing_ld_1"` og
asserter «Du må velge vinner i alle feltene før du kan avslutte.» Grønn.

**Testen er bærende (aktivt verifisert, ikke tatt på tro).** Evaluator byttet midlertidig
inn `git show origin/main:.../SideWinnersForm.tsx` og kjørte testen på nytt:

```
 Test Files  1 failed (1)
      Tests  1 failed (1)
 ❯ SideWinnersForm.test.tsx:26:14
       screen.getByText('Klarte ikke å lagre vinnerne. Prøv igjen.')
```

Filen ble deretter restaurert; `git status --porcelain` bekrefter rent tre.

Assertjonen treffer ekte katalog-tekst, ikke en mock-streng: `vitest.setup.ts:4` importerer
`./messages/no.json` og `vitest.setup.ts:62-88` bygger `useTranslations` på next-intls egen
`createTranslator` over den katalogen. Testen låser altså både rutingen og no-copyen.

**Type C-regelen respektert:** komponenten har nøyaktig én render-test (én `describe`,
én `it`). Ingen tall re-assertes fra Type A.

## Kriterium 2 — nøkkelen i BÅDE no.json og en.json — PASS

Node-oppslag mot begge kataloger:

```
no.admin.game.sideWinners.dbError = "Klarte ikke å lagre vinnerne. Prøv igjen."
en.admin.game.sideWinners.dbError = "Couldn't save the winners. Please try again."
```

Stien matcher komponentens namespace (`useTranslations('admin.game.sideWinners')`,
`SideWinnersForm.tsx:33`).

**Plassering:** identisk i begge filer — `['validationError', 'dbError', 'longestDriveLabel',
'longestDriveSlot']` som de fire første nøklene i `sideWinners`. Rett etter søsternøkkelen,
ingen omrokkering av eksisterende linjer.

**Apostrof-stil i en.json:** rett (typografisk) apostrof er husstilen — `grep -c "’"
messages/en.json` → `0`, og «Couldn't» finnes fra før 23 ganger med rett apostrof. Ny
streng følger samme form.

**Paritet:** `messages/catalogParity.test.ts` flater ut alle bladnøkler og krever eksakt
likhet mellom no.json og hver ikke-default locale — den grønne kjøringen over er derfor
et reelt bevis for at en.json ikke mangler nøkkelen.

## Kriterium 3 — typeof-guarden håndterer `string[]` uten TypeError — PASS

`typeof error === 'string'` kortslutter FØR `.startsWith`, så et array fra duplisert
`?error`-param aldri treffer strengmetoden — ingen `TypeError`. Fallet går til
`t('dbError')`, dvs. den fail-safe-retningen kontrakten beskriver. Ytre `{error && …}`
er uendret, så et array (alltid truthy) gir banner med db-varianten.

Merknad, ikke finding: konsekvensen er at `?error=missing_ld_1&error=missing_ld_1`
viser retry-rådet i stedet for valideringsmeldingen. Det er eksplisitt valgt i kontraktens
Design-seksjon og er den ufarlige retningen (feltene er da uansett synlige og tomme).

## Kriterium 4 — begge konsumenter dekket — PASS

To konsumenter, begge importerer SAMME komponentfil og sender `error` rått videre:

- `app/[locale]/admin/games/[id]/avslutt/page.tsx:13` (import), `:140` (`error={error}`)
- `app/[locale]/games/[id]/avslutt/page.tsx:18-20` (import fra admin-stien), `:182`
  (`error={error}` + `cancelHref={detailPath}`)

Begge leser `const { error } = await searchParams` (typet `{ error?: string }`) og gjør
ingen egen melding-mapping. Fiksen i komponenten dekker derfor begge flater i én endring —
ingen andre steder rendrer sideWinners-feilbanneret (`grep -rn "SideWinnersForm"` over
`app/`, `components/`, `lib/` gir kun de tre filene + testen).

## Kriterium 5 — ingen andre feilkoder når skjemaet — PASS

`app/[locale]/admin/games/[id]/avslutt/actions.ts` er eneste kilde til `?error=` på
veiviser-stien (`grep -rn "avslutt" app lib components | grep -i error` gir kun denne fila):

- `:87` `${wizardPath}?error=missing_ld_${pos}`
- `:98` `${wizardPath}?error=missing_ctp_${pos}`
- `:127` `${wizardPath}?error=db_winners` (kun når `result.reason === 'db_winners'`)
- alt annet: `${detailPath}?error=${result.reason}`

`endGameCore.ts` kan returnere `not_active` (:154), `no_players` (:179),
`not_all_submitted` (:190), `not_all_approved` (:195), `db_winners` (:216), `db_finish`
(:228). Kun `db_winners` rutes til veiviseren. Rutingen i komponenten dekker altså
kodeuniverset presist: `missing_*` → validering, `db_winners` → retry.

En håndskrevet URL (`?error=tull`) gir retry-meldingen. Fail-safe og akseptabelt —
alternativet (validerings-copy for ukjente koder) er nettopp defekten som fikses.

## Aktiv hull-leting (ingen funn)

| Hypotese | Resultat |
|---|---|
| Banner ved `error=undefined` / `""`? | Nei — ytre `{error && …}` er uendret; tom streng og undefined er falsy. |
| Type C brutt (flere render-tester)? | Nei — én `it`, render + rerender i samme case. |
| Urelaterte endringer i diffen? | Nei — 5 filer, alle sporbare til oppgaven. |
| Messages-diff større enn 2 linjer? | Nei — verifisert `2`. |
| Endret eksisterende copy (snapshot-risiko)? | Nei — kun innsetting; `validationError` uendret. |
| Notatfil bryter `.changes/README.md`? | Nei — `type: fix` + `issue: 1567`, ingen `title/link/cta` (kun for feat), brødtekst én setning < 400 tegn. |
| Ny nøkkel uten paritet i en.json? | Nei — catalogParity grønn. |
| `.startsWith` på ikke-streng? | Nei — typeof-guarden kortslutter først. |

## Restpunkt (ikke evaluert her, per instruks)

Staging-verifiseringen (`?error=db_winners` på avslutt-veiviseren) står fortsatt åpen i
kontrakten og må kjøres før merge sammen med `staging-verified`-label.
