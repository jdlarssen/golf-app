# Evaluering: #1550 — Cup-deltakere kan åpne alle kamper i en ferdigspilt cup

**Verdikt: ACCEPT** (ingen blokkerende funn i det bygde arbeidet; to kontraktskriterier
gjenstår som hovedchat-steg FØR merge — se «Gjenstår», de er prosess, ikke defekter).

Evaluator: fersk-kontekst forge-evaluator, 2026-08-14.
Diff evaluert: `origin/main..HEAD` (a7c496c9 kontrakt, d89eeb98 fix, d5c0d7f2 test).

## Uavhengig verifisert (kriterium → resultat)

### Migrasjonsfil == staging (S1)
- Policy-qual hentet fra staging (`pg_get_expr(polqual, polrelid)`): de FEM gamle
  grenene ordrett bevart, nøyaktig ÉN gren lagt til sist
  (`OR is_participant_of_finished_tournament(game_id)`). `polcmd = r`,
  `polroles = {}` (PUBLIC-bindingen beholdt av `alter policy`).
- Maskinell diff (whitespace-/kommentar-strippet) av policy-blokken i 0161 mot
  0121-kilden: **fem gamle grener byte-identiske** — inkludert
  `'reveal'::text`/`'live'`-asymmetrien fra 0121.
- Helper-def på staging == fila: `STABLE SECURITY DEFINER SET search_path TO ''`,
  identisk kropp. Bokført i `supabase_migrations` som
  `20260814172210 finished_tournament_scores_select`.

### Sikkerhetssimuleringer (staging, begin/rollback)
| Probe | EXPECT | Målt |
|---|---|---|
| Fremmed (252e1a6f…, ikke deltaker/spiller) leser Best ball 2 (58e46de5…, 36 rader finnes) | 0 | **0** |
| Karl (8ed0ce8b…, cup-deltaker, spilte IKKE kampen) leser samme kamp | 36 | **36** |
| Spoiler-vern: Ryder Cup flippet til `active` i transaksjon → Karl leser samme kamp | 0 + helper false | **0, helper=false** |
| Anon-rolla leser samme kamp | 0 rader, INGEN «permission denied» | **0, ingen feil** |

Rollback verifisert etterpå: `tournaments.status = 'finished'` står urørt.
Anon-proben er reell dekning av 0137-fella: med `auth.uid() = null` er alle
foregående grener false, så helperen BLE evaluert — uten EXECUTE hadde spørringen
feilet før RLS rakk å nekte. Ingen aktiv turnering på staging hadde naturlig
deltaker-utenfor-kamp-data (TEST-Cupen har 0 deltaker-rader), derav flip-simen.

### Helper-herding (#1121/#1595)
- `prosecdef = true`, `provolatile = 's'`, `search_path=''`, alle referanser
  skjema-kvalifiserte (`public.games/tournaments/tournament_participants`,
  `auth.uid()`).
- ACL eksplisitt: `{postgres,anon,authenticated,service_role}` — implisitt
  PUBLIC-grant fjernet. Samme endelige flate som `same_flight_or_solo`.
- Ingen rekursjonsrisiko: DEFINER bryter policy-kjeden på tabellene den leser,
  som søsken-helperne i samme policy.

### pgTAP (S2)
- `supabase/tests/scores_finished_tournament_select_rls_test.sql`: 12 asserts ==
  `plan(12)`; dekker (a) deltaker ser kamp han ikke spilte (inkl. eksakt
  radantall, ikke slice), (b) fremmed 0 i to kamper, (c) aktiv-turnering
  spoiler-vern, (d) `tournament_id IS NULL` uendret, + helper-nivå-asserts og
  service-role-sanity. Probefunksjonen `ft_visible_scores` er SECURITY INVOKER —
  riktig (en definer-probe hadde omgått RLS).
- Kjørt selv mot lokal stack (kjørende, 0161 påført):
  `npm run test:rls` → **19 filer, 200 tester, Result: PASS** — inkl. den nye fila.

### prod-vakta-baseline
- De to nye nøklene er **byte-identiske** med `cache_key`-ene staging-advisoren
  faktisk emitterer for den nye funksjonen (verifisert via security-advisors mot
  staging), og `prod-vakt.sh:54` diffes med `grep -vxF` (eksakt linjematch) — så
  formatet MÅ være eksakt, og er det. Plassert i riktige seksjoner
  (anon-EXECUTE-beholdt for {public}-policy-helpere; authenticated
  RLS-helper-booleans) hvis eksisterende begrunnelseskommentarer dekker dem.
  Begrunnelsen står i tillegg i 0161-kommentaren + commit-body.

### Prod urørt
- `glofubopddkjhymcbaph` read-only: helper finnes ikke (count=0), policy-qual
  inneholder IKKE den nye grenen. Prod-brannmuren respektert.

### Scope og disiplin
- 5 filer, +466/-0 — **ingen app-kode endret**. `Refs #1550` i alle tre
  commit-bodies; test-commiten `[no-changelog]` (korrekt for test-only);
  `.changes/1550-cup-kamp-innsyn.md` malgyldig (type fix, issue 1550, én linje
  ≤400 tegn, unikt filnavn).
- Migrasjonsnummer 0161: korrekt — 0160 ligger på `claude/1595-creator-select-rls`
  og er alt påført staging (20260814162348); ingen remote-branch har noen
  0161-fil (kollisjonssjekk over alle remotes).

## Avviks-vurdering

1. **`alter policy` i stedet for kontraktens «DROP+CREATE»: RIKTIG avvik.**
   Kontraktens premiss («policy-endring krever DROP+CREATE») er faktisk feil —
   `ALTER POLICY … USING` er gyldig, og BEGGE tidligere endringer av akkurat
   denne policyen brukte den (0092:76, 0121). Formen kan ikke miste
   `for select`/`to public`-bindingen og etterlater aldri tabellen policy-løs.
   Avviket er dokumentert i migrasjonskommentar + commit-body.
2. **S3-premiss-korreksjonen: STEMMER.** Hoved-leaderboardet leser ferdige spill
   via service-role siden #1542 (`getResultReadClient`) — kontraktens «tom-tilstand
   forsvinner»-premiss var utdatert. Flatene 0161 faktisk låser opp leser med
   brukerens klient, verifisert ved kodelesing:
   `app/[locale]/games/[id]/leaderboard/holes/holesData.ts:4,29` og
   `app/[locale]/games/[id]/leaderboard/export/route.ts:5,81` (begge
   `getServerClient`). Korrekt dokumentert i migrasjonens hode-kommentar.
3. **Edge-case «avledet kamp i splittet cup-dag»:** verifisert på staging-data —
   alle avledede spill med cup-avstamning har egen `tournament_id`; de 8 uten har
   også kilder UTEN turnering (Rydern-test, aldri cup-tilknyttet). CSV-ruta leser
   dessuten kildens scores (`source_game_id ?? id`, route.ts:100–103), og kilden
   bærer `tournament_id`. «Begge halvdeler lesbare» holder.

## Gates

- `npm run test:rls` (Node 22, lokal stack): **PASS** — 19 filer / 200 tester.
- `npm run build` (Node 22, pipefail): **exit 0**.

## Gjenstår (hovedchat, FØR merge — ikke defekter i bygget)

- **S5:** staging-klikkrunde (deltaker åpner kamp han ikke spilte → full tabell)
  + bevis-kommentar + `staging-verified`-label. Branchen er ikke pushet ennå og
  PR finnes ikke — kan ikke oppfylles av evaluator.
- **S6:** PR-body må dokumentere prod-gaten (migrasjon IKKE påført prod; venter
  eier-godkjenning). Følger av PR-opprettelsen.
- Prod-påføring: venter eksplisitt eier-godkjenning (prod-brannmuren #1074).
  Aldri auto-merge (authz + prod-migrasjon).

## Funn (signatur: fil + kriterium)

Ingen blokkerende. Ingen ikke-blokkerende defekter funnet i det bygde arbeidet.
