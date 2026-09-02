# Evaluate-runder: slett-konto — snevret sperre + automatisk frafall (#1909)

| Runde | Verdikt | Finding-signaturer |
|---|---|---|
| 1 | **ACCEPT** (med funn) | Substansen holdt; migrasjonen bevist trygg for prod ved uavhengig introspeksjon (scrub-blokka programmatisk sammenlignet mot prods `pg_get_functiondef` → 1556 tegn, IDENTICAL; grants og `security definer`/`search_path` bevart; 0 FK-er mot de fire tabellene; alle tre `game_players`-vaktene slipper `auth.uid() is null` i PROD). Funn: **B1** PR-body/remote pekte på 0173 etter renummereringen — var alt rettet da rapporten kom (remote = lokal, body oppdatert). **B2** idempotens-asserten var innholdsløs: `now()` er `transaction_timestamp()`, så to kall i samme transaksjon skriver samme verdi og asserten passerte med og uten `coalesce` — rammet også hovedchattens egen 15/15-probe. **F2** `getDeleteBlockReason` feilet åpent på spørrings-error; etter at deltaker-grenen forsvant var de tre igjen eneste vern for arrangører. **F1** provisjonsskriptet slo opp demo-spillet på navn alene og kunne feie en fremmed brukers spill. **F3** `findAuthUserId` hadde `ilike`-jokertegn-fella som `resolveOrganizer` alt var hardnet mot. Nits: `target_active` du-form (bevisst, dokumentert), JSDoc-peker, kontraktfila sier fortsatt 0173. |
| 1-fix | — | B2/F1/F2/F3 + nit fikset i `57180d35`. B2: asserten planter nå et frafall fra 2020-01-01 satt av arrangøren og krever at begge kolonnene står urørt — verifisert mot staging (`stamp_preserved=true`, `by_preserved=true`). F2: fail-closed, null-testet (uten vakten blir nøyaktig 3 tester røde). F1: eierskapsgard, null-testet mot staging med et fremmed-eid spill med samme navn — skriptet nektet. F3: eksakt-match-filter i JS. I tillegg fikk `users_anonymize_test.sql` en assert på at den bevarte raden nå ER trukket, med en note om at asserten kun består fordi fiksturen bruker et AKTIVT spill. |

## Bevis-status ved runde 1

- Porter: `build` 0 · `lint` 0 · `tsc` 0 · `vitest` 532 filer / 7250 tester exit 0 ·
  native `jest` 47/762 exit 0 · native `tsc` 0
- **VERIFICATION GAP:** pgTAP ikke kjørt (ingen Docker) — assertene probet mot
  staging i stedet, per kontraktens fallback
- Staging e2e mot ekte rute: 18/18
- Demo-re-seed: full sløyfe verifisert (kjør → reviewer sletter seg → kjør igjen)
- `drift` rød av fremmed årsak: #1902 sin `planned_match_count` står på staging
  uten å være merget. Ikke fikset her — det ville dratt deres kolonne inn i
  denne PR-en.

## Utestående ved runde 1 (eier-steg, ikke kode)

- Prod-migrasjon `0174` — venter eier-luka, MÅ påføres FØR merge
- Eier-tapptest på fysisk iPhone (egen port for denne destruktive flyten)
- Prod-re-seed av demo-spillet — etter merge/deploy, sammen med eieren
