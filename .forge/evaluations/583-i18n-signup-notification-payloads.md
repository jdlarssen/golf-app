# Evaluering: #583 — i18n signup-varsel-payloads

**Verdikt: ACCEPT**
**Dato:** 2026-06-14 · **Evaluator:** fresh-context opus sub-agent (skeptisk, uavhengig)
**Branch:** `claude/jolly-cartwright-201bc1` · commits `cd3c9702` → `7250eea8`

Alle åtte kontrakt-kriterier PASS. `tsc --noEmit` exit 0, `npm run build` grønn,
23 testfiler / 224 tester grønne. Ingen regresjon i søster-skrivere eller andre
lesere. Norsk output byte-identisk. Versjon + CHANGELOG korrekt.

## Per-kriterium

| K | Verdikt | Evidens |
|---|---------|---------|
| K1 | PASS | Grep: gjenværende `En spiller`/`kaptein for`-treff er kun kommentarer (`teamActions.ts:537,818`) eller scoring-prosa. Ingen `'Laget'`/`Kapteinen fjernet`-literaler. `'En venn'` korrekt beholdt i `invite/actions.ts:106`. |
| K2 | PASS | `getCaptainDisplayName` → `Promise<string \| null>`, `return null` ved manglende rad; alle 3 kallsteder håndterer null. |
| K3 | PASS | Strukturert `requester_name` + optional `team_name`; `NotificationCard` komponerer `captainOf` kun når `team_name` finnes; individuell selv-reg rendrer bart navn. Test dekker alle 3 grener. |
| K4 | PASS | `reason_code: 'team_removed'`; render-presedens `reason ?? (reason_code ? localised : default)` bevarer admin-fritekst verbatim. Dynamisk nøkkel resolver (enum = kun `team_removed`). |
| K5 | PASS | `'Laget'`/`'En spiller'` fjernet fra `team_member_withdrew` + `team_invite`-payloads; render-tid `somePlayerFallback`/`someTeamFallback`. |
| K6 | PASS | 5 nøkler i begge locales (4 inbox + 1 mail.common). Norsk byte-identisk. `catalogParity.test.ts` grønn. |
| K7 | PASS | `tsc --noEmit` exit 0 + `npm run build` grønn (hovedchat). Exhaustiv switch + nullable-propagering OK. |
| K8 | PASS | 1.126.0 → 1.126.1; CHANGELOG 3-lags-struktur; commit `7250eea8` staget package.json + CHANGELOG sammen; hook passerte. |

## Regresjons-jakt (ren)
- Eneste leser av de 4 endrede kindene er `NotificationCard`. Andre `.team_name`-
  treff leser DB-rader, ikke payloads.
- Alle 6 skrivere kompilerer; admin-fritekst-`registration_rejected`
  (`signups/actions.ts:339`) urørt og virker (schema beholdt `reason` optional).
- Mail-tvillingene: ingen snapshot-drift (non-null-sti uendret); `lib/mail/`-tester grønne.

## Edge-cases verifisert
- `withdrawActions.withdrawnName`: `base && nickname`-guard gir `null` (ikke `null «nickname»`) ved manglende rad.
- `withdrawActions.team_name`: gated av `if (… && teamName)` → aldri null i payloaden.
- `team_invite` første kallsted (`teamActions:457`): `teamName` garantert string, `invitedByName` nullable-akseptert.
- Ingen stale test asserter gammel norsk-i-payload-oppførsel.

## Noter (ikke-blokkerende)
- Kontrakt-teksten sa «4 nye nøkler»; implementasjonen shipper korrekt 5 (mail-fallbacken
  er beskrevet i kontraktens Design-seksjon). CHANGELOG sier korrekt 5. Tekst-undertelling, ikke gap.
