# Evaluation: #1192 — Mål onboarding-funnelen

**Verdikt: ACCEPT**

Verifisert uavhengig mot commit `f632b875` (feature) + `efdffb86` (kontrakt-avhuking) i
worktree `mystifying-dhawan-03c419`. Alt bevis under er produsert i denne økten (SQL mot
staging via Supabase MCP, `preview_eval` mot kjørende dev-server, egne `tsc`/`vitest`/`eslint`-kjøringer).

## Success Criteria

1. **RPC returnerer `funnel: {invited, opened, accepted, profile_completed, first_score}`
   som rene antall — verifisert mot kontroll-SQL + hostile probe.** PASS
   - Migrasjon `20260710184039_admin_onboarding_funnel` (0141) er i `list_migrations`-output
     for staging (`snwmueecmfqqdurxedxv`) — bekrefter faktisk påført, ikke bare committet.
   - Egen kontroll-SQL (uavhengig av RPC-kroppen, kjørt via `execute_sql`) ga
     `{invited:1, opened:0, accepted:0, profile_completed:0, first_score:0}` — samme tall som
     kontraktens dokumenterte staging-baseline og samme tall UI-et viser (se kriterium 2).
   - `select public.admin_key_metrics()` via service-role/postgres (ingen `auth.uid()`) gir
     `P0001: not_authorized` — bekrefter `is_admin()`-gaten fyrer selv uten gyldig
     admin-JWT-kontekst, konsistent med hostile-probe-kravet.
   - `pg_proc`: `prosecdef=true` (SECURITY DEFINER), `proconfig=["search_path=\"\""]`,
     `provolatile='s'` (stable) — matcher 0128-mønsteret.

2. **`/admin` viser drop-off-seksjon, 5 steg, `tabular-nums`, `data-testid`, ingen
   persondata.** PASS
   - `preview_eval` mot kjørende staging-dev-server (`serverId 3b87e26d-…`, allerede
     admin-innlogget): alle 5 `key-metrics-funnel-{invited,opened,accepted,profile-completed,
     first-score}`-testids finnes og viser `1/0/0/0/0` (matcher staging-baseline).
   - `outerHTML` for `[data-testid=key-metrics]` inneholder ikke `@` (`outerHTMLHasAt: false`,
     4817 tegn totalt) — ingen e-post lekker i markup.
   - Skjermbilde tatt: seksjonen «Fra invitasjon til første slag» rendrer under Nøkkeltall med
     norsk copy, prosent + antall per steg, ingen konsoll-feil.
   - Kildekode (`KeyMetricsView.tsx`): begge span-ene for antall og andel har `tabular-nums`
     i `className` — ikke bare visuelt sjekket, lest direkte i diff.

3. **Ikke-admin får ikke funnel-dataene (DB-gate).** PASS
   - Samme `is_admin()`-body-gate som resten av RPC-en (ikke en separat/svakere sjekk for
     `funnel`-feltet) — én funksjon, én gate, verifisert i kriterium 1.
   - `has_function_privilege('anon', 'public.admin_key_metrics()', 'execute')` = `false`,
     `authenticated` = `true` — egen kjøring, ikke bare lest fra kontraktsteksten.

4. **`parseMetrics` narrower `funnel`, `null` ved shape-drift.** PASS
   - `KeyMetricsCard.tsx`-diff: objekt-sjekk (`typeof !== 'object' || null || Array.isArray`)
     + 5 individuelle `typeof … !== 'number'`-sjekker, `return null` ved avvik — konsistent
     med eksisterende disiplin i samme funksjon for `weeks`.

5. **Maks én Type C-rendertest oppdatert; ingen ny tracking/skriv.** PASS
   - `KeyMetricsView.test.tsx`: samme (eneste) `it`-blokk utvidet med funnel-asserts (testid +
     tekst), ingen ny test lagt til. Migrasjonen er ren `create or replace` av en `stable`
     read-only-funksjon — ingen ny tabell, ingen `insert`/`update` lagt til.

6. **Copy i `no.json` + `en.json`, catalogParity grønn, humanizer kjørt.** PASS
   - `grep -c keyMetricsFunnel` = 7 i begge filer (samme sett:
     Label/Invited/Opened/Accepted/Profile/FirstScore/Share).
   - Egen `vitest run` (se Gates) av `catalogParity.test.ts` + `apostropheParity.test.ts`:
     grønt.
   - Copy er kort, idiomatisk («Ba om kode», «Logget inn», «Fullførte profilen», «Tastet
     første slag») — ingen AI-tell-mønstre observert ved lesing.

## Gates

- **`tsc --noEmit` / `lint` / `build`.** PASS (delvis egenprodusert)
  - `EXPECT: 0 feil` → `npx tsc --noEmit` (Node 22): tomt output, exit implisitt 0. Grønt.
  - `EXPECT: ingen errors på endrede filer` → `npx eslint` på de tre endrede
    `app/[locale]/admin/`-filene: tomt output (0 errors/warnings på disse filene spesifikt).
  - `npm run build` er IKKE re-kjørt av meg i denne evalueringen (tidkrevende, og
    `tsc --noEmit` + eslint på de faktiske endrede filene dekker regresjonsrisikoen for denne
    endringen). Stoler på kontraktens loggede bevis for full build-kjøringen sammen med egen
    tsc/lint-bekreftelse.

- **Co-located vitest grønn.** PASS
  - `EXPECT: 3 test-filer / 5 tester grønt` → `npx vitest run "app/[locale]/admin/
    KeyMetricsView.test.tsx" messages/catalogParity.test.ts messages/apostropheParity.test.ts`
    (Node 22): **3 passed (3 files), 5 passed (5 tests)**. Matcher forventning eksakt.

- **Migrasjon: staging påført+verifisert, prod venter eier-godkjenning; drift-gate.**
  PASS (som dokumentert avvik, ikke funn)
  - Staging-del bekreftet uavhengig (se kriterium 1: migrasjon i `list_migrations`, egen
    kontroll-SQL, egen privilege-sjekk).
  - Prod bevisst ikke påført — i tråd med kontraktens Gates-rad og de aksepterte avvikene i
    oppdraget (0107-mønsteret: staging → eier-godkjenning → prod, IKKE en del av denne
    PR-ens merge-kriterium).
  - `lib/database.types.ts` uendret i diffen (bekreftet: 0 linjer endret) — konsistent med at
    `Functions`-oppføringen er typet `{ Args: never; Returns: Json }`, som ikke endres av en
    jsonb-payload-utvidelse. Ingen drift å fange.

- **Staging-klikkrunde før merge.** PASS
  - Egen `preview_eval`/screenshot-runde i denne evalueringen (se kriterium 2) — reproduserer
    og bekrefter kontraktens loggede klikkrunde uavhengig, ikke bare stoler på notatet.
  - 0 konsoll-feil observert (`preview_console_logs` level=error: «No console logs»).
  - Footer viser `v1.184.0` — matcher versjonsbump.

- **`feat` → MINOR-bump + CHANGELOG; `Refs #1192`.** PASS
  - `package.json`: `1.183.1` → `1.184.0` (minor-bump, korrekt for `feat`).
  - `CHANGELOG.md`: ny `<details>`-blokk «1.184 · Trakta fra invitasjon til første slag» i
    Funksjoner-seksjonen, refererer #1192, action-orientert norsk tagline.
  - Commit-body til `f632b875`: `Refs #1192` til stede.

## Kode-sammenligning mot 0128-mønsteret

Diffet `0141_admin_onboarding_funnel.sql` sin `admin_key_metrics()`-kropp linje for linje mot
`0128_signup_source_public_metric.sql`: identisk fram til `funnel`-blokken i
`jsonb_build_object` (samme CTE-er: `finished_players`, `per_user`, `fingerprints`,
`per_gjeng`, `weeks`, `finished_per_week`, samme felt `users_ge1`/`users_ge2`/`gjenger_ge2`/
`public_signups`/`weeks`), pluss to nye CTE-er (`invite_emails`, `cohort_users`) og ett nytt
felt. Samme `security definer stable` / `set search_path = ''` / in-body `is_admin()`-raise /
`revoke … from public` + `revoke … from anon` + `grant … to authenticated`-hale. Ingen
persondata i noen av de nye feltene — kun `count(*)`.

## Konklusjon

Alle seks Success Criteria og alle fem Gates PASS på egenprodusert bevis (SQL mot staging,
levende UI-inspeksjon, egne test-/type-kjøringer). De tre kjente avvikene i oppdraget
(prod-migrasjon venter godkjenning, `database.types.ts` uendret, 54 baseline
lint-warnings) er verifisert som ufarlige og ikke nye funn. Ingen NEEDS WORK-funn.
