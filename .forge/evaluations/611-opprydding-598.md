# Forge-evaluering: #611 — Oppfølging #598, gjenstående opprydding

**Verdict: ACCEPT**

Branch: `claude/nervous-gates-275ded` — 7 commits (6 funksjonelle + 1 docs) over `origin/main`.
Evaluert skeptisk, hvert kriterium uavhengig verifisert mot faktisk kode + gjenkjørte gates.

## Gate-resultater (gjenkjørt av evaluator)

| Gate | Resultat |
|---|---|
| `npx tsc --noEmit` | **exit 0** (rent) |
| `npm run test` (vitest run) | **3481 passed / 3481 (274 filer)** |
| `npx eslint .` | **0 nye warnings/errors** — 23 no-unused-vars matcher dokumentert pre-eksisterende baseline eksakt; 21 errors (`no-html-link-for-pages` ×20 i AppVersionFooter.tsx, `no-require-imports` i InboxClient.test.tsx) er pre-eksisterende i uberørte filer (bekreftet UNCHANGED vs main) |
| `npm run build` | **Hoppet over** (per kontrakt) — tsc + tester rene, og de eneste nye filene er rene `lib/`-hjelpere uten nye GameMode-/exhaustive-switch-medlemmer, så build kan ikke avdekke noe tsc ikke alt fanget. |

## Per-kriterium

| K | Verdict | Bevis |
|---|---|---|
| **K1** playerDisplay.ts + confirmActions.ts slettet | PASS | Begge filer borte fra disk. Repo-bred grep: `confirmParticipation`/`confirmLeagueParticipation` treffer kun `maybeAuto*`-helpers i `lib/` (live-flyt); `playerDisplay` treffer kun en urelatert lokal funksjon + `lib/leaderboard.ts`-eksport; `confirmActions` = 0 treff. Null importører bekreftet. tsc rent. |
| **K2** getProxyVerifiedUserId-re-eksport fjernet | PASS | Diff fjerner kun `export { getProxyVerifiedUserId }` (linje 113-117). Import (linje 5) + intern bruk (linje 33) intakt. Alle 38 importører bruker `@/lib/auth/userId`; ingen importerte re-eksporten (test-fil-treffet er en `vi.mock`, ikke en import). |
| **K3** Ubrukte lokaler fjernet | PASS | Verifiserte hver: `t`(admin.courses) i EditCoursePage ubrukt (buildAuditKicker får `tEdit`); `teamsTotalLabel` 0 treff; `tScorecard` fjernet fra PendingApprovals (det gjenværende på linje 116 er en ANNEN funksjon-scope, lovlig); `t`(leaderboard) i State4View ubrukt (barn får `t={tc}`, ikke det fjernede); `footerText` ubrukt (text-versjon bruker `common.footerTagline`). Begge `const [t, locale] = Promise.all` → `const locale = (await getLocale()) as AppLocale`: `locale` brukes (linje 143 / 39+48), `AppLocale` importert, `t`(admin.players) var ubrukt (relative-helper får `tProfile`). |
| **K4** Roster-dedup | PASS | `rosterDisplayName` byte-ekvivalent med begge originaler. `filterRosterCandidates` byte-ekvivalent med begge `useMemo`-predikatene (trim/lowercase, tom→slice(0,25), haystack `${name??''} ${nickname??''} ${email}`, includes, slice). `hcpIndex` bevart via `<T extends RosterCandidate>` + `Candidate = RosterCandidate & {hcpIndex}`; `c.hcpIndex.toFixed(1)` renderer fortsatt. JSX bevisst per-flate. Ny test 8 cases (inkl. hcpIndex-bevaring) grønn. |
| **K5** searchParams-dedup | PASS | `resolveErrorCode` reproduserer original eksakt: `!raw`→undefined (fraværende), `known.has`→raw (kjent), ellers→fallback (ukjent). Begge sider sender `'unknown'` som fallback. KNOWN_ERROR_CODES-settene uendret (kun `ErrorCode`-type + lokal `first` fjernet). `t(\`errors.${code}\`)` bevart på begge med egen typet translator. `first()` byte-ekvivalent (`[]`→undefined dekket i test). Ny test 7 cases grønn. |
| **K6** Courses-parser-dedup (RISIKABEL) | PASS | `parseCourseHolesAndTees` byte-ekvivalent med begge inline-loops: samme valideringsrekkefølge (name→18 holes→si_duplicate→tees), samme 7 feilkoder, samme par-sum-derivasjon, samme backward-compat (`hole_${i}_par`-fallback + parLadies/parJuniors `=== null ? parMens`). **`createCourse` strip av `id`**: `{...t, id: undefined}` — `undefined` utelates av Supabase JSON-serialisering, så DB-default genererer PK (IKKE null PK insert). **`updateCourse` beholder `id`**: parser leverer `id` (string|null), brukt nedstrøms i `formIds`-diff (linje ~43) + `if (tee.id)` UPDATE/INSERT-gren (linje ~109). Alle 7 importerte primitiver matcher `coursePayload.ts` (uendret). Begge actions.test.ts grønne (22 totalt). |
| **K7** Quick-win docs slettet | PASS | 47 deletions, alle quick-win-{1,3,5,6,7,8} (realized) + quick-win-8 (incoming); 0 ikke-quick-win-deletions. `brand-foundations/` + `incoming/.gitkeep` intakt. Ingen kode-import fra slettede stier — de 3 grep-treffene er ren JSDoc/kommentar-prosa («per quick-win-5 spec») + BrandHero.tsx peker på BEHOLDT brand-foundations. |
| **K8** Hele gate-suiten grønn | PASS | Se gate-tabell over. tsc exit 0; 3481/3481; 0 nye lint. |
| **K9** Follow-up-issues | PASS | #628 (foursomes↔greensome scoring-dedup, test-først) OPEN; #629 (`first()` 26-fil-konsolidering) OPEN. Begge matcher OUT-of-scope-deferrals. |

## Aktiv problemjakt (utover kriteriene)

- **Fjernet noe som faktisk brukes?** Nei. Hver fjernet lokal/fil verifisert med scope-bevisst grep (skilte funksjon-scopes der samme navn gjenbrukes — State4View, EditCoursePage, PendingApprovals har alle navne-kollisjoner mellom topp-nivå binding og barn-parametre, men de fjernede var topp-nivå-ubrukte).
- **Subtil oppførselsendring i dedup?** Nei. K4/K5/K6 alle byte-ekvivalente; den eneste «forskjellen» er K6s `id`-håndtering som er bevisst og korrekt (undefined-strip vs diff-bruk).
- **Nye tsc/lint-issues?** Nei. tsc rent; lint-baseline uendret (23 unused-vars matcher dokumentasjon eksakt; pre-eksisterende errors i uberørte filer).
- **Claimet-gjort men ikke gjort?** Nei. Alle 7 commits til stede; alle filer på disk; alle follow-up-issues finnes.
- **Risiko-notat innfridd?** Kontrakten lovte å flagge+defere hvis en dup viste seg tilfeldig. K5-noten («login↔complete-profile 151-linje-klonen var urelaterte bodies») er korrekt — kun de delte hjelperne ble trukket ut, ikke page-bodies. Bevisst og dokumentert.

## Konklusjon

Alle 9 kriterier PASS. Tre dedups er byte-ekvivalente (verifisert linje-for-linje, ikke på tro). Den risikable courses-parseren håndterer `id`-asymmetrien korrekt. Ingen ny død kode, ingen oppførselsendring, gates rene. Rent refactor/chore/docs uten brukersynlig endring → riktig ingen version-bump/CHANGELOG.

**ACCEPT.**
