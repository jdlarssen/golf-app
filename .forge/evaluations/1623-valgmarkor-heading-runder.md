# Runde-historikk — 1623-valgmarkor-heading

Konvergensregler #1077: én linje per evaluate-runde, med verdikt og finding-signaturer
(`fil + kriterium`).

| Runde | Verdikt | Finding-signaturer | Kommentar |
|---|---|---|---|
| 1 | ACCEPT | Ingen blokkerende. Ikke-blokkerende: `autoMerge.ts + ordgrense sperrer bestemt form (F1)`, `autoMerge.ts + kvadratisk backtracking (F2)`, `autoMerge.ts + \s krysser linjeskift (F3)`, `decide-pr-card.ts + markør leses kun fra body (F4)`, `memory + gammel regel (F6)` | Alle fire kriterier og alle porter verifisert av evaluatoren selv, inkludert uavhengig rød→grønn. Nøkkelfunn utenfor kriteriene: feilen traff **4** PR-er (#1610, #1612, #1616, #1620), ikke bare #1620. |

Konvergerte på runde 1. Ingen fix→evaluate-sykluser brukt.

## Etterarbeid på ACCEPT (commit `a713371c`)

F1/F2/F3 ble rettet selv om verdiktet var ACCEPT — ikke gold-plating, men fordi F1 var en
defekt PR-en selv innførte (doc lovet mer enn koden ga, som er #1623s egen feilklasse), og
F2/F3 satt på samme linje. F2 krevde et strategibytte: første hypotese om årsaken var
målt feil, og den atomiske grupperingen kom først etter at målingen motbeviste den.

F4 og aldri-liste-funnet er filet som #1656 og #1655 framfor å utvide scopet.
