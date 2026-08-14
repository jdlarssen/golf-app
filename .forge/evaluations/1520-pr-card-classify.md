# Evaluering: #1520 PR-kort-klassifisering

**Verdikt: ACCEPT**

Diff verifisert mot kontrakten (design 1–7, K1–K6) med fersk kontekst. Gates kjørt
selv på Node 22: `npx tsc --noEmit` grønn, `npx vitest run lib/loops` 193/193 grønn
(4 filer), `npm run lint` 0 errors (55 pre-eksisterende warnings — blokkerer ikke,
jf. ci.yml). I tillegg to egne verifiseringer utover kontraktens minimum (se K5).

## Kriterier

| Krit. | Verdikt | Evidens (én linje) |
|---|---|---|
| K1 | PASS | `prCard.test.ts` `expectsRealCi`-cases: 7 docs-only-lister (inkl. `.changes/1520-pr-kort.md`, `e2e/notat.md`) → false; 4 kode/blandet → true; `[]` → false; `null` → true — alle grønne. |
| K2 | PASS | `classifyChecks` filtrerer `CARD_CHECK_NAME` først (`prCard.ts:77`); tester: in_progress post-card → green, cancelled post-card → green, ekte cancelled → red, kun post-card → pending. Re-sjekken arver via delt funksjon: `autoMerge.ts:177` mapper nå `name` gjennom, ny test «kortets egen post-card-check ignoreres i re-sjekken» merger (PUT) forbi cancelled post-card. |
| K3 | PASS | `classifyWithCiGate`-tester: grønt + registrert run → green; grønt uten run → pending; HTTP 502 på oppslaget → pending (fail-closed); docs-only og ikke-grønne checks avgjøres uten oppslag (billig guard sist, assertert via `vi.fn`-kalltelling). |
| K4 | PASS | Lockstep-testene leser `.github/workflows/` via fs; verifisert selv at ci.yml:23–26 er nøyaktig `'**.md'`,`'docs/**'`,`'.forge/**'` (= `CI_PATHS_IGNORE`, `toEqual` eksakt) og at jobben heter `post-card:` (discord-pr-card.yml:52, ingen job-level `name:`). Regexen fail-closed: uquoted/flyttet blokk → `not.toBeNull()`-assert feiler. Drift i post-card-navnet feiler trygt (ufiltrert check → pending/red → noop, aldri feil-merge). |
| K5 | PASS | Docs-only-/kode-stiene uendret: full suite grønn, `waitForChecksToSettle`-seamen er valgfri (`classify = classifyChecks` default), eksisterende tester urørt. VERIFICATION GAP-en (ingen harness for `scripts/loops/`) **lukket ved evaluering** med to egne kjøringer: (a) sparse-simulering av kort-workflowens miljø (KUN `scripts/loops` + `lib/loops`, ingen node_modules/app-kode) → `npx --yes tsx decide-pr-card.ts` mot PR #1569 kjører rent, exit 0, noop-plan skrevet — importgrafen er runtime-selvstendig; (b) live probe mot #1569-head `c8626c90` (kontraktens evidens-case): reelle check-runs viser `post-card=completed/cancelled` blant grønne — `classifyChecks` med filter → **green**, pre-fix-visning uten navn → **red** (den låst-rød-buggen), `fetchCiRunsForSha` → ok med registrert CI-run, `classifyWithCiGate(expectsCi=true)` → **green**. Probe-outputen viste også tvilling-vinduet live (duplikate `verify`/`e2e`-navn fra ci-docs-noop). Sitér gjerne dette i PR-beskrivelsen. |
| K6 | PASS | `095aed86 fix(loops)` har `[no-changelog]` + `Refs #1520`; `255a7ddb refactor(loops)` har `Refs #1520`. Ingen `.changes/`-notat, ingen `package.json`-/CHANGELOG-/`.github/workflows/`-berøring (diff = 8 filer, alle i lib/loops + scripts/loops + tester). |
| Avvik a | PASS | Ny `lib/loops/ciRuns.ts` framfor eksport fra `discordActions.ts`: begrunnelsen holder — `discordActions.ts` value-importerer `@/lib/productUpdates/validateUpdateInput` (utenfor lib/loops), og workflowen henter kun `scripts/loops`+`lib/loops` fra main (#1181). `ciRuns.ts` har KUN en inline type-import av `GitHubClient` (elideres av tsx — empirisk bevist av sparse-kjøringen i K5, og samme mønster lever allerede på main i `autoMerge.ts:11`). Ett hjem bevart: `discordActions.ts:250` konsumerer `fetchCiRunsForSha`, gamle `CI_WORKFLOW_FILE`+duplikat-oppslag fjernet, mottaker-meldingene uendret (eksisterende + 1 ny feiltest grønne). |
| Avvik b | PASS | Changed-files-feil → `noCard` i stedet for pending: riktig og STRENGERE enn kontraktens bokstav. `null`→`[]`-fallback ville gitt `classifyAutoMerge` en tom fil-liste som aldri matcher `NEVER_AUTO_MERGE_GLOBS` (supabase/, app/api/, …) → mulig feil-merge; `isVisualChange` mister også grunnlaget. Gaten sitter FØR forgreningen (decide-pr-card.ts:162–163) og dekker dermed både WAIT_FOR_CHECKS- og engangs-stien; neste fyring prøver på nytt. `expectsRealCi(null)` → gate-på beholdt og testet som kontraktens fallback-semantikk (K1). |

Øvrige sjekkpunkter: `CheckRun.name` er valgfri — eksisterende konsumenter (navn-løse
test-fiksturer, decide, autoMerge) kompilerer og består; filteret beholder navn-løse
runs (`undefined !== 'post-card'`). `npm run build`-re-run **ikke nødvendig**: eneste
app-nåbare endring er en ren modul-ekstraksjon innen lib/loops (ingen Next-flater,
ingen `use client`-grenser, ingen exhaustive switches, ingen runtime-exports) —
tsc + vitest + lint dekker endringsflaten.

## Funn

Ingen.
