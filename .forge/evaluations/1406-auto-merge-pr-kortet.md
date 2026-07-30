# Evaluering: 1406-auto-merge-pr-kortet
Dato: 2026-07-30 · Evaluator: fresh-context opus · Commits: 9ede3156..8e365f74

## Verdikt: ACCEPT

## Kriterium-for-kriterium

1. **[PASS]** `npx vitest run lib/loops` grønn med nye låsende tester.
   Kjørt selv: **164 passed (4 files)**. `lib/loops/autoMerge.test.ts` (330 linjer) dekker:
   én fikstur per §3-rad → `touchesNeverList=true` (`autoMerge.test.ts:20-36`), valg-markør-
   regexen inkl. «Alternativer vurdert»-prosa → false og `## Alternativ F` (utenfor a–e) →
   false (`:64-79`), `isUserVisibleByCommits` med/uten `[no-changelog]` + any-kvantor
   (`:104-126`), `linkedIssueNumbers` dedup (`:89-100`), `classifyAutoMerge`-portrekkefølgen
   inkl. «aldri-lista slår staging-porten» (`:130-194`), og `mergePullRequest` med mocket
   klient: suksess → `['GET','GET','PUT']` med `{merge_method:'rebase',sha}` (`:222-236`),
   draft → GraphQL av-draft før PUT (`:238-248`), 409/405/av-draft-feil/ikke-åpen/CI-rød →
   `{ok:false,reason}` (`:250-295`). Kvitterings-payload uten `merge_pr` i `prCard.test.ts:188-220`.

2. **[PASS]** `decide-pr-card.ts` skriver `outcome` + `headSha` i planen og `outcome`/`is_gui`
   til `$GITHUB_OUTPUT`; alle `noop`-stier består. Kjørt selv uten `GITHUB_TOKEN`:
   `$GITHUB_OUTPUT` → `outcome=noop` / `is_gui=false`; planfil → `outcome:"noop"`, `headSha:null`,
   `pr:null`. Wiring i `decide-pr-card.ts:38-42` (`emit`), `:183-206` (`classifyAutoMerge`-kall +
   `headSha: pr.head.sha`). Noop-portene intakte: `:139` (ingen kandidat), `:145` (ikke åpen),
   `:146` (allerede kortet), `:174` (CI ikke grønn).

3. **[PASS]** `post-pr-card.ts` med fabrikert `outcome:'auto-merge'`-plan + `DRY_RUN=1` logger
   tiltenkt merge + kvittering uten skriv. Kjørt selv (to varianter):
   kode-diff → «ville rebase-merget mot headSha deadbeef123 (sha-guard), postet kvittering og
   dispatchet main-verify. Ingen skriv.» + kvitterings-JSON med KUN lenke-knapp (type 2, style 5);
   docs-only-diff → «... uten main-verify-dispatch (docs-only). Ingen skriv.» `if (DRY_RUN)`
   returnerer FØR `ghClient` instansieres (`post-pr-card.ts:148-157`) → null skriv bekreftet.

4. **[PASS]** `.github/workflows/discord-pr-card.yml`: `contents: write` (`:35`), `actions: write`
   (`:36`) lagt til; `pull-requests: write`/`issues: write`/`checks: read` består (`:37-39`).
   Steg-gating byttet `should_card` → `outcome != 'noop'` på post (`:131`) og
   `outcome != 'noop' && is_gui == 'true'` på skjermbilder (`:98`). «Bruk main sin versjon av
   loop-skriptene» (`:69-73`), concurrency (`:30-32`), guard (`:45-56`) og failure-alarm
   (`:140-158`) urørt (bekreftet mot diffen — ingen av dem forekommer i git-diffen).

5. **[PASS]** Docs-endringene i §5 gjort i samme PR (commit `fb0f7515`):
   `docs/loops/discord-pr-kort.md` (tre-utfall `:54-74`, aldri-liste/valg-markør/staging-porten/
   main-verify-dispatch `:62-83`, fix-protokoll-rader `:172-177`); `docs/loops/morgenbriefen.md`
   (Godkjenn-linjer scopet til knapp-kort `:32-56`, auto-merget → «Skjedde i natt» `:32-37`,
   arkiv-PR-regelen oppdatert `:224-230`); `CLAUDE.md` steg 5 (kryssref + `## Produktvalg`/
   `## Alternativ A/B`-markør-konvensjonen `:155-160`). Stale-sveip: ingen gjenværende
   motsigelser — de to «aldri»-treffene er den korrigerte arkiv-setningen og den pre-1406
   «Aldri auto-merge»-lista (prod-DB/destruktiv/auth/koster), begge konsistente.

6. **[PASS]** Gates grønne — se «Gate-kjøringer».

7. **[ ] PENDING FIRST USE (by design)** — korrekt fortsatt uavkrysset i kontrakten (`:114`).
   Ikke forsøkt live mot GitHub/Discord, jf. mandat.

## Gate-kjøringer

- `npm run typecheck` → **EXIT 0** (`tsc --noEmit`, ingen output).
- `npm run lint` → **EXIT 0** — 55 problems (0 errors, 55 warnings). Alle warnings er
  pre-eksisterende kompleksitet/max-depth (discordActions, sideTournament, wolf, mail-helpers
  m.fl.); ingen i `autoMerge.ts` eller de berørte loop-filene.
- `npx vitest run lib/loops` → **4 files / 164 tests passed**.
- `npm run build` → **EXIT 0** (`.env.local` til stede i worktreen; full route-tabell generert).

## Adversarielle sjekker (kjørt via tsx-eval mot autoMerge.ts)

- **Aldri-liste-globber:** alle 11 positive fiksturer (`supabase/migrations/…`, `**/slett/**`,
  `**/slett-konto/**` (matcher IKKE `**/slett/**`), `proxy.ts`, `lib/supabase/**`, `app/api/**`,
  `app/[locale]/(auth)/**`, `**/betaling/**`, `.github/**`, `.claude/**`, `.githooks/**`) →
  `touchesNeverList=true`; alle 4 negative (`docs/loops/x.md`, `lib/scoring/bestBall.ts`,
  `components/ui/Button.tsx`, `app/[locale]/games/[id]/page.tsx`) → false. Ingen falsk negativ.
- **Portrekkefølge:** `classifyAutoMerge` implementerer §1 eksakt (base≠main → WIP → aldri-liste →
  valg-markør/needs-decision → staging-porten → auto-merge); ingen sti når auto-merge som §1
  krever `card` (bekreftet i kode + test + eval).
- **Merge-mekanikk:** re-verifiser åpen + grønn mot `plan.headSha`, av-draft via GraphQL,
  `PUT …/merge {merge_method:'rebase', sha}`, enhver feil → `{ok:false}` → `runButtonCard` i
  samme kjøring; kvittering kun etter `ok:true`. `DRY_RUN` skriver null på auto-merge-stien.
- **main-verify-dispatch:** `shouldDispatchMainVerify` = `!every(matchesMainVerifyIgnore)`
  (`**.md`/`docs/**`/`.forge/**`) → docs-only+tom liste = false, kode = true; dispatch-feil etter
  merge → `process.exit(1)` (`post-pr-card.ts:189`); Discord-feil forblir exit 0.
- **Scope/regresjon:** ingen endring i `discordActions.ts`, `app/api/discord/interactions/route.ts`
  eller app-/komponent-kode. `buildCardPayload` emitterer fortsatt `custom_id: merge_pr:<N>`
  (`prCard.ts:156`). `screenshot-routes.ts` leser `plan.pr`/`plan.isGui` — ingen stale
  `shouldCard`-leser (eneste `shouldCard`-forekomst er en kommentar i `cardPlan.ts:15`).

## Funn

Ingen.

## Vurdering

Leveransen svarer kontrakten punkt for punkt. Alle seks verifiserbare kriterier passerer under
selvstendig kjøring, kriterium 7 er korrekt latt stå åpent til første reelle bruk, og alle fire
gates er grønne. Klassifiseringen er fail-closed og rekkefølge-korrekt; aldri-lista fanger hver
§3-flate uten falske negativer; merge-helperen faller tilbake til knapp-kortet ved enhver feil og
poster «Merget» først etter faktisk 200 (I2/I3 respektert). DRY_RUN gjør null skriv på auto-merge-
stien. Scopet er rent — ingen app-/mottaker-kode rørt. Gjenstående risiko er utelukkende den
kontrakten selv utsetter til kriterium 7: den fulle live-stien (faktisk merge + main-verify-
dispatch + Discord-kvittering mot ekte GITHUB_TOKEN-tilganger) er bare bevist via mocket klient og
DRY_RUN, aldri ende-til-ende. Det er akseptert design («PENDING FIRST USE»), ikke en mangel.
