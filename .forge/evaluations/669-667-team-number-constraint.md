# Forge-evaluering: #669 + #667 — Utvid team_number-constraint + stopp stille kaptein-tap

**Commit:** `2c64d449`
**Branch:** issue-669-667-team-number-constraint
**Kontrakt:** `.forge/contracts/669-667-team-number-constraint.md`
**Evaluator:** uavhengig, skeptisk verifisering
**Dato:** 2026-06-17
**Verdikt:** ✅ **ACCEPT**

---

## Kriterie-tabell

| # | Kriterium | Status | Bevis (uavhengig verifisert) |
|---|-----------|--------|------------------------------|
| K1 | Prod-constraint utvidet til `team_number is null or team_number >= 1`; relaterte constraints ikke brutt | ✅ | Spurte prod direkte via Supabase MCP (`pg_get_constraintdef`): `game_players_team_number_check` = `CHECK (((team_number IS NULL) OR (team_number >= 1)))` — ingen øvre grense. `game_players_flight_number_check` = `flight_number IS NULL OR >= 1`. `game_players_team_flight_consistency` = `team_number IS NULL OR flight_number IS NOT NULL`. Transaksjonell test-insert med `team_number=5, flight_number=5` ble **akseptert** av alle tre constraints (DO-blokk, rullet tilbake; etterpå-spørring bekrefter `max(team_number)=4`, 0 lekkede rader). Migrasjonsfil 0101 matcher eksakt. |
| K2 | `signups/actions.ts` slot-løkke `<= 4` → `<= 50` | ✅ | Diff bekreftet: linje 167 `for (let slot = 1; slot <= 50; slot += 1)` med kommentar om utvidet constraint + speiling av self-reg-cap. |
| K3 | `teamActions.ts` returnerer `{ ok: false, error: 'db_error' }` på `captainPlayerError`; `acceptTeamInvite` urørt | ✅ | Lest faktisk kode (linje 359-369): `if (captainPlayerError) { console.error(...); return { ok: false, error: 'db_error' }; }`. Eneste hunk i fila er @@ -361 (inne i `submitTeamRegistration`). `acceptTeamInvite` (linje 677-695) sin `if (playerError) return db_error` er fatal fra før og fullstendig urørt. |
| K4 | Nye tester ekte og grønne | ✅ | `teamActions.test.ts` #667-case: mock-kø med call #4 (kaptein game_players upsert) = error → asserter `{ ok:false, error:'db_error' }`. Eksersis-bevis: midlertidig revertert fiksen → testen **feiler** med `ok:true` + populert `slotResults` (eksakt silent-success-bug). `gamePayload.test.ts` #669-case: 5-spiller Wolf, asserter 5. spillers `team_number:5, flight_number:5` + `errorCode` undefined. Begge filer grønne (262 tester). |
| K5 | `typecheck` 0, full suite grønn, ingen `as any`/`@ts-ignore` | ✅ | `npm run typecheck` exit 0. `npx vitest run`: 282 filer / **3566 tester** grønne. `git show 2c64d449 \| grep -E "as any\|@ts-ignore\|@ts-expect-error"` → NONE. |
| K6 | package.json 1.132.7 + CHANGELOG-oppføring i commit | ✅ | `package.json` version = `1.132.7`; begge filer i commit-stat. CHANGELOG `[1.132.7] - 2026-06-17 · #669 #667` med idiomatisk norsk tagline + Teknisk-details. |

---

## Skeptisk kjerne-analyse

### (a) Er prod-constrainten genuint utvidet? — JA, verifisert mot databasen, ikke fila
Spurte selv via Supabase MCP mot prod (`glofubopddkjhymcbaph`). Constraint-def er `CHECK (((team_number IS NULL) OR (team_number >= 1)))` — øvre grensen er borte. Stolte ikke på migrasjonsfila: kjørte en transaksjonell `INSERT` med `team_number=5, flight_number=5` mot en ekte game/user-rad — den ble akseptert av alle tre relaterte constraints, deretter rullet tilbake. Bekreftet ingen rad lekket (`max(team_number)=4` i prod-data, 0 team-5-rader).

### (b) Forhindrer #667-fiksen genuint den stille suksessen? — JA, `return` plassert så fall-through er umulig
`return { ok: false, error: 'db_error' }` ligger inne i `if (captainPlayerError)`-blokken på linje 368, FØR per-slot-løkken (linje 377) og FØR det endelige `ok: true`-returnet (linje 552-553). Funksjonen kan ikke fortsette til suksess etter en kaptein-insert-feil. Eksersis-bevist: revertert til pre-fiks-svelget → testen returnerte faktisk `{ ok: true, captainRequestId, slotResults: [...] }` (selve buggen), og feilet assertionen. Restaurert fiksen → grønn. Arbeidstre rent etter restaurering.

### (c) Kan utvidelsen bryte en eksisterende invariant? — NEI
Grep over `app` + `lib` etter numeriske `team_number`-sammenligninger:
- **Per-format-validatorer i `gamePayload.ts`** (`> 4`, `> 2`, `> 5`) er format-regler kontrakten eksplisitt holder urørt — de er fortsatt den ekte øvre grensen per format (4-lag-format, 2-side-format, Wolf=5). DB-utvidelsen fjerner bare DB som en strengere, utilsiktet cap. Wolf-validatoren (linje 1526-1530) tillater genuint 1-5, konsistent med #669-testen.
- **Ikke-validator-konsumenter** (`getCupSnapshot.ts`, `matchplaySides.ts`, `signup/page.tsx` som filtrerer `=== 1`/`=== 2`) er 2-side-formater der `team_number` semantisk aldri er > 2 (validert oppstrøms). En team_number=5-rad oppstår aldri i de kontekstene.
- **DB-laget:** Grep over migrasjoner + direkte spørring mot prod `pg_proc` (function-bodies) etter `between 1 and 4` / `team_number <= [2-9]` → 0 treff. Ingen DB-funksjon, RPC eller RLS-policy antar øvre grense 4.

Utvidelsen er ren widening: tillater mer, avviser ingenting som var lovlig før. Ingen data-migrering, ingen eksisterende rad invalidert.

---

## Konklusjon

Alle seks suksesskriterier uavhengig verifisert med kjørt bevis (prod-SQL, eksersis-test, full suite). De to P1-feilene er genuint fikset: DB-constrainten er bekreftet utvidet mot prod (ikke bare i fil), og #667-svelget er genuint stoppet med en `return` som umuliggjør fall-through til suksess — bevist ved at testen fanger regresjonen. Ingen invariant brytes av utvidelsen. Ingen `as any`/`@ts-ignore`. Versjon + CHANGELOG på plass.

**ACCEPT.**
