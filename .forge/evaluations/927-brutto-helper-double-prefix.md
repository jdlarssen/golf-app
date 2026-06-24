# Evaluering: #927 — bruttoHelperKeyFor dobbel-prefiks

**Verdikt:** ACCEPT

Fiks-commit: `e44d47ce` · Branch: `claude/zen-goldberg-acf625` · Node 22.23.0

## Kriterier og gates

| Krit. / Gate | Status | Evidens |
|---|---|---|
| **K1** — relativ nøkkel + type + JSDoc | PASS | `lib/games/allowanceCopy.ts:21-22`: `bruttoHelperKeyFor(mode: GameMode): \`bruttoHelper.${GameMode}\`` returnerer `` `bruttoHelper.${mode}` `` — ingen `allowance.`-prefiks. JSDoc (L3-19) oppdatert, beskriver scoped-translator-bruken og #927-rasjonalet konsistent med koden. |
| **K2** — begge call-sites resolver korrekt | PASS | `GameForm.tsx:615` og `GameWizard.tsx:749`: begge `tAllowance(bruttoHelperKeyFor(...))`, casts fjernet. `tAllowance = useTranslations('allowance')` i begge (`GameForm.tsx:291`, `GameWizard.tsx:165`). Effektivt oppslag = `allowance.bruttoHelper.<mode>` (enkel prefiks). JSON-walk bekreftet for `best_ball`, `stableford`, `singles_matchplay`, `solo_strokeplay` i BÅDE `messages/no.json` og `messages/en.json` — alle ikke-tomme strenger; 22 `bruttoHelper`-oppføringer per locale. |
| **K3** — exhaustiv test, scoped resolution, fanger gammel bug | PASS | `lib/games/allowanceCopy.test.ts`: itererer over `Object.keys(MODE_LABELS)` der `MODE_LABELS: Record<GameMode, string>` — typet over hele unionen, kan IKKE drifte til hardkodet subset. `resolveUnderAllowanceScope` starter fra `noMessages.allowance` (det scopede noden), ikke katalog-rota. **Skeptiker-eksperiment:** på gammel impl (`allowance.bruttoHelper.best_ball`) gir walk fra `allowance`-noden `allowance.allowance` = `undefined` → `typeof !== 'string'` → FEILER; andre test (`.startsWith('allowance.') === false`) FEILER også. Testen er altså en ekte guard, ikke grønn på buggy kode. Kjørt grønn. |
| **K4** — patch-bump + CHANGELOG, samme commit | PASS | `git show e44d47ce --stat`: `package.json` + `package-lock.json` 1.141.1 → 1.141.2 (patch, korrekt for `fix:`), `CHANGELOG.md` `### [1.141.2] - 2026-06-24 · #927` nestet under åpent `## 1.141.y`-tema (over `### [1.141.1]`). Alt i ÉN commit som kode-fiksen. |
| **Severity-claim** (ikke P1) | PASS | `i18n/request.ts`: ingen `onError`-key (kun `getMessageFallback`, `getRequestConfig`-retur har `locale`/`messages`/`timeZone`/`getMessageFallback`). `getMessageFallback: ({ key }) => key.split('.').pop() ?? key` (L73) — eksakt som hevdet. Bekrefter kosmetisk (rå mode-slug) + log-støy, ikke crash. |
| Gate: `tsc --noEmit` | PASS | exit 0 (ingen output). Den smalere returtypen kompilerer rent gjennom begge call-sites uten cast. |
| Gate: `vitest` (allowanceCopy + AllowanceField) | PASS | `Test Files 2 passed (2)`, `Tests 51 passed (51)`. |
| Gate: `eslint` (4 endrede filer) | PASS | 0 errors, 2 warnings — begge pre-eksisterende complexity-warnings (GameForm 43, GameWizard 80), eksplisitt out-of-scope. Ingen nye lint-funn fra cast-fjerningen. |
| Gate: `npm run build` | SKIPPET | Bevisst hoppet over per kontraktens tillatelse (tsc grønn, intet mistenkelig; implementer rapporterte exit 0). Type-innsnevringen er fanget av `tsc`. |

## Skeptiker-notater

- Den mest kritiske kontrollen — at testen faktisk feiler på den gamle implementasjonen — er verifisert eksperimentelt (ikke bare resonnert): walk-funksjonen starter fra `messages.allowance`, ikke katalog-rota, så den gamle doblede nøkkelen gir `undefined`. En test som passerte på begge impl ville vært verdiløs; denne gjør det ikke.
- `MODE_LABELS` som mode-kilde er sterkere enn en hardkodet liste: `Record<GameMode, string>` tvinger tsc til å feile hvis en ny GameMode legges til uten label, så test-dekningen kan ikke stille drifte.
- Begge locales (`no` + `en`) har alle 22 `bruttoHelper`-oppføringer; ingen MISSING_MESSAGE-risiko gjenstår på den korrekte enkle-prefiks-stien.

K5 (closing-kommentar på #927) er post-merge og utenfor denne evalueringen.
