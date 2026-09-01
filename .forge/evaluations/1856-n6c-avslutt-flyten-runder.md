# Forge-runder — #1856 native N6c: avslutt-flyten i appen (2026-09-01)

Byggere: seks Opus-subagenter i tre faser (fundament → uttrekk → sweep).
Evaluator: fire Opus-skeptikere i fersk kontekst + samlende dom.
Fiks-runde: én Opus-subagent.

| Runde | Utfall | Funn | Aksjon |
|---|---|---|---|
| Drift-verifisering (før bygging) | 3 GONE, 9 DRIFTED | Kontrakten var skrevet før N6a/N6b landet. **GONE:** (a) den optimistiske låsen på status-flippen har ALDRI eksistert — `.update({status,ended_at}).eq('id',gameId)` uten status-predikat og uten `.select()`; (b) cup-ness kommer ikke fra `tournament_id` i endGameCore (null treff) men fra caller-klient + `suppressPerGameNotifications`; (c) `endGameCore` kan ikke gjenbrukes fra native (`server-only` på linje 1). **DRIFTED:** mail-hjelperen heter `sendGameFinishedNotification` og KASTER; ingen `endGameCore.test.ts` fantes; #502-sweepen er pg_cron + pg_net, ikke Vercel-cron; `notifyAchievementUnlocks` er ikke idempotent (bar INSERT, ingen unik indeks i prod). | Kontrakten drift-korrigert og committet før første kodelinje. Markør-designet snudd fra «sett sist» (at-least-once) til «vinn først» (at-most-once). |
| Empirisk probe (staging, før bygging) | Risiko #4 lukket | Kontrakten kunne ikke si om husets trap-2-idiom var trygt på `game_side_winners` fra en ikke-admin oppretter mens spillet er aktivt. Fem prober med ekte JWT: upsert m/ `return=representation` → **201 + rader**; creator-SELECT mens aktiv → 200 + rader; låst flipp → 200 + rad; flipp på alt avsluttet spill → **200 + `[]`**; re-upsert på finished → virker. | `.select()` brukt på alle tre native-skrivene. 0 rader på flippen tolkes som idempotent suksess, ikke feil. Fikstur restaurert. |
| 1 (evaluering) | **REJECT** | 2 blockers, 2 majors. **B1:** `reopenGame` nullet ikke `finish_pipeline_at` — ren regresjon: gjenåpne → rette → avslutte igjen ga INGEN hale (utdaterte resultatkort, feil differensial, avledede kamper hengende `active`, referatet borte for godt). Suiten hadde FLIP_WON/FLIP_LOST/CLAIM_WON men ingen **CLAIM_LOST** — nettopp derfor var funnet stumt. **B2:** deploy-rekkefølgen dokumentert feil vei («0169 trygg når som helst»); merge deployer til prod før migrasjonen, PostgREST 42703 → hele halen hoppes over stille for hver web-avslutning, og backfillen gjør tapet permanent. **M1:** claimen manglet `.eq('status','finished')` — race mot gjenåpning. **M2:** sweepen ekskluderte ikke `source_game_id` — slettet cup-oppsett (FK er `ON DELETE SET NULL`) ville gitt per-kamp mail + fakturert AI-referat på nytt. | Alle fire fikset. CLAIM_LOST-grenen skrevet. 0171 laget (0169 var alt påført staging, så indeksen kunne ikke redigeres på stedet). Rekkefølgen står nå som tabell begge steder. |
| 2 (etter fiks) | Porter grønne | Hver ny test mutasjonstestet: fiksen ødelagt, testen bekreftet RØD, fila gjenopprettet byte-identisk. 5/5 røde. | Levering. |

## Evaluator-funn jeg IKKE rettet meg etter

Én evaluator hevdet at kåringsstien «aldri har kjørt mot en ekte database» og at
kriterium 2/3/4 var udemonstrert. **Feil.** Hele flyten ble tappet gjennom i simulatoren
mot staging, og radene dumpet: `longest_drive` slot 1 = Jørgen, `closest_to_pin` slot 1
= `null` («Ingen kvalifiserte»). Evaluatoren fant ingen spor fordi fiksturen ble
restaurert etterpå — bevisene ligger i PR-teksten i stedet. Lærdom: rydd fiksturen
ETTER at beviset er skrevet ned, ikke før evalueringen.

## Funn som ble egne issues (ikke i denne PR-en)

- #1885 — `endGameCore` sin vinner-upsert mangler radassertering (trap 2 + trap 4;
  native-siden fikk den, webben ikke).
- #1886 — `endGameMarkingWithdrawals` asserterer ikke berørte rader (eksisterende web-kode).
- #1887 — `supportsWithdrawal` er fail-open for ukjent `GameMode`.

## Restanser

- **Eier-tapptest på fysisk enhet** står igjen (simulator-verifisering er gjort).
- **Prod-migrasjonene er ikke påført.** 0169 + 0171 må på prod FØR merge; 0170 etter deploy.
- Sweepen er ikke ende-til-ende-kjørt på staging med et avledet spill til stede
  (M2 er bevist på enhetsnivå).
