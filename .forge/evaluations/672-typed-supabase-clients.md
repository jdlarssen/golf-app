# Forge-evaluering: #672 — Typede Supabase-klienter

**Verdikt:** ✅ **ACCEPT**
**Evaluator:** fresh-context skeptisk reviewer
**Dato:** 2026-06-17
**Range vurdert:** `git diff 07d01239 HEAD` (commits `b2617a9c` regen-types + `50fd56f0` wire-generic)
**HEAD:** `50fd56f0`

Alle seks suksesskriterier verifisert uavhengig. «Ren refactor, ingen oppførselsendring»-påstanden holder
under skeptisk gransking: hver av de 16 fallout-fiksene endrer kun typesystemet, ikke runtime-verdier eller
kontrollflyt. Ingen reell null-bane eller skjema-mismatch er skjult bak en cast.

## Per-kriterium

| K | Krav | Resultat | Evidens |
|---|------|----------|---------|
| **K1** | `database.types.ts` regenerert: har `notifications.archived_at` + RPC `can_score_for`, mangler de 6 droppede `formats`-kolonnene | ✅ PASS | `archived_at` på linjene 1205/1214/1223/1410/1426/1442; `can_score_for:` på linje 1678. `formats`-blokken (linje 385–414) har KUN 7 kolonner: created_at, icon_key, is_active, is_cup_eligible, scoring_module, slug, updated_at. `grep` for display_name/rules_*/short_description i formats-blokken = 0 treff. |
| **K2** | Alle fire fabrikkene parameterisert `<Database>` + importerer typen | ✅ PASS | `server.ts:7` `createServerClient<Database>` (import :3); `client.ts:5` `createBrowserClient<Database>` (import :2); `admin.ts:16` `createClient<Database>` (import :3); `middleware.ts:25` `createServerClient<Database>` (import :3). |
| **K3** | `npm run typecheck` → 0 feil | ✅ PASS | `npx tsc --noEmit` → exit code **0**, ingen output. |
| **K4** | Ingen nye `as any`/`@ts-ignore`/`@ts-expect-error`; alle `as`-cast begrunnet | ✅ PASS | `git diff ... \| grep "as any\|@ts-(ignore\|expect-error)"` = 0 treff (exit 1). 9 reelle `as`-cast lagt til (+1 false-positive = ordet «as» i en kommentar), alle gjennomgått og begrunnet (se under). `eslint` på endrede filer = clean (exit 0). |
| **K5** | `package.json` har `"typecheck": "tsc --noEmit"` | ✅ PASS | `package.json:10` `"typecheck": "tsc --noEmit",` |
| **K6** | `npm test` grønn (~3561 tester) | ✅ PASS | `vitest run` → **281 filer / 3561 tester passed**, 0 failed. Matcher kontraktens tall eksakt. |

## Behaviour-change-analyse — alle 16 fikser (gruppert)

Skeptisk kjerne: er noen fix en SKJULT runtime-endring eller en kamuflert bug? **Nei.** Detaljer:

### Gruppe A — 5× `as string`-after-guard (kontrollflyt-bevarende)
Filer: `profile/historikk/page.tsx:64-66`, `profile/slett-konto/page.tsx:23-25`,
`games/[id]/trekk-fra/page.tsx:65-67`, `games/[id]/leaderboard/page.tsx:254-256`,
`games/[id]/leaderboard/holes/page.tsx:133-135`.

- Hver fil har `if (!userIdRaw) redirect({...})` UMIDDELBART foran `const userId = userIdRaw as string`.
- `redirect` importeres fra `@/i18n/navigation` (next-intl) i alle fem — den **kaster** (kaller Next sin
  `redirect` internt) men er typet `void`, ikke `never`. Derfor trengs casten; den er ikke valgfri pynt.
- Castet kan ALDRI observere null i runtime: guard-en kaster først. Ingen reell null-bane maskeres.
- Original kontrollflyt (redirect-on-null) er bevart 1:1 — kun blokk→one-liner-kosmetikk i tre filer,
  semantikk identisk (begge kaster). Verifisert i `historikk` at den etterfølgende `.eq('user_id', userId)`
  bruker samme verdi som før.

### Gruppe B — 3× nullable-RPC-arg-cast (kun typesystem, null bevart)
1. `admin/klubber/ny/actions.ts:54,58` — `p_member_cap: memberCap as number`, `p_valid_until: validUntil as string`.
   - Call-site: `memberCap = memberCapRaw ? parseInt(...) : null` (`number | null`),
     `validUntil = ... ? '...' : null` (`string | null`). Castet endrer IKKE verdien — null sendes fremdeles.
   - SQL-funksjon (migrasjon #50): `p_member_cap int` / `p_valid_until timestamptz` — INGEN `NOT NULL`, ingen default
     → aksepterer null. Funksjonskroppen håndterer det eksplisitt (`if p_member_cap is not null and p_member_cap < 1`).
   - Kryss-sjekk kolonner: `groups.member_cap` (null = ubegrenset) + `groups.valid_until` (null = uendelig)
     er begge nullable per migrasjonen. Cast korrekt; kommentar nøyaktig.
2. `lib/sync/syncWorker.ts:35` — `p_strokes: score.strokes as number`.
   - SQL `upsert_score_if_newer(p_strokes int, ...)` — ingen `NOT NULL` → aksepterer null; setter `p_strokes`
     rett inn i `scores.strokes`. `scores.strokes` er `number | null` i typene. Null = score-clear, gyldig verdi.
     Cast informerer kun typene; runtime-verdi (inkl. null) uendret.

### Gruppe C — 5× payload-typing (ingen felt droppet/omdøpt/koersert)
1. `admin/spillere/[id]/actions.ts:115` — `Record<string,unknown>` → `TablesUpdate<'users'>`. Objekt-literal
   uendret: { name, nickname, hcp_index, handicap_updated_at, gender, level } + betinget `.email`. Samme nøkler.
   At den kompilerer beviser at hver nøkkel er en ekte `users`-kolonne (det er nettopp gevinsten).
2. `lib/league/actions.ts:226,316,459` — `Record<string,unknown>` → `TablesUpdate<'league_rounds'>` (×2) /
   `TablesUpdate<'leagues'>`. De betingede `patch.X = ...`-tilordningene er urørte. Typecheck grønt ⇒ alle
   tilordnede nøkler er gyldige kolonner. Ingen felt fjernet/omdøpt.
3. `lib/admin/auditLog.ts:51` — `payload: event.payload ?? {}` → `(event.payload ?? {}) as Json`. Verdi uendret;
   kun typeinformasjon. `{}`-fallback bevart.

### Gruppe D — foursomesActions.ts (computed-key → typet objekt) — KRITISK SJEKK
`games/[id]/foursomesActions.ts:84-92`.
- FØR: `const column = sideNumber === 1 ? 'foursomes_side1_tee_starter_user_id' : 'foursomes_side2_...'` →
  `.update({ [column]: userId })`.
- ETTER: `const updatePayload: TablesUpdate<'games'> = sideNumber === 1 ? { foursomes_side1_...: userId } :
  { foursomes_side2_...: userId }` → `.update(updatePayload)`.
- Samme `sideNumber === 1`-betingelse, samme to kolonnenavn, samme verdi `userId`. Begge kolonnene finnes i
  `games`-typen (linje 661/662 Row, 695/696 Insert, 729/730 Update) som `string | null`. **Nøyaktig samme
  kolonne skrives med nøyaktig samme verdi.** Ingen atferdsendring.

### Droppede `formats`-kolonner — leser noe dem?
Grep mot hele `lib`/`app` for `display_name|rules_example|rules_long|rules_points|rules_summary|short_description`:
eneste treff er `admin/games/[id]/avslutt/page.tsx:95` — det er et LOKALT `PlayerOption.display_name`-prop fra
`formatRevealName(...)`, IKKE en `.from('formats').select('display_name')`. Ingen call-site leser de droppede
kolonnene fra `formats`-tabellen. Kontraktens påstand bekreftet.

## Issues funnet
Ingen. Refaktoren er ren. Kontraktens 16-fikser-regnskap stemmer (5 guard + 3 RPC-arg + 5 payload + foursomes-
omskriving + leaderboard/holes guard = de 16 type-stedene fordelt på 13 source-filer). Gatene (tsc/lint/test)
er alle grønne.

## Anbefaling
**ACCEPT.** Schema-drift som #641/#642/#647 vil nå feile ved bygging (`tsc`), nøyaktig som issuet krever, uten
noen runtime- eller atferdsendring i denne PR-en. Klar for merge; prerequisitt for CI-gaten #673 er på plass.
