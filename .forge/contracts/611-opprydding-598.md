# Forge-kontrakt: #611 — Oppfølging #598, gjenstående opprydding

**Issue:** [#611](https://github.com/jdlarssen/golf-app/issues/611) — Oppfølging #598: gjenstående opprydding (død-kode + non-leaderboard dedup)
**Branch:** `claude/nervous-gates-275ded`
**Type:** `refactor` / `chore` / `docs` — ingen brukersynlig oppførselsendring → ingen version-bump / CHANGELOG.
**Eier-beslutninger (denne sesjonen):**
- Scope = **død kode + rene dedups** (gatet `lib/scoring` foursomes↔greensome utsettes som test-først-oppfølger).
- Orphan design-docs = **slett** quick-win-referansene; **behold** `brand-foundations` (sitert av `BrandHero.tsx`).

## Bakgrunn

#598 leverte leaderboard-chrome-dedup (PR #610). #611 sporer resten. `fallow@2.96` kjørt med `node_modules` installert ga presise funn. Mesteparten av fallows «unused exports/types» er **bevisst offentlig API** (icon-barrel, `components/ui`, next-intl-nav, `lib/scoring/index.ts`-barrel) eller **gatet scoring** — ikke død kode. Den reelle gevinsten ligger i 3 rene dedups.

## Scope — IN

### Spor B — død kode
1. Slett `app/[locale]/admin/games/new/playerDisplay.ts` (kun kommentar, null importører).
2. Slett `app/[locale]/games/[id]/confirmActions.ts` (orphan server actions `confirmParticipation`/`confirmLeagueParticipation`, null importører).
3. Fjern den ubrukte re-eksporten `getProxyVerifiedUserId` i `app/[locale]/games/[id]/flightJoinActions.ts:117` (funksjonen importeres direkte fra `@/lib/auth/userId` av 20+ kallsteder; intern bruk på linje 33 beholdes).
4. Fjern ubrukt `const t = useTranslations('leaderboard')` der lint faktisk flagger den (bekreftet: `leaderboard/State4View.tsx`; sjekk søsken i samme pass — kun der `npm run lint` rapporterer `no-unused-vars`). `_gameId`/`_gameStatus` er underscore-prefiks (bevisst-ubrukt-konvensjon) → **røres ikke**.

### Spor A — rene dedups (ingen oppførselsendring; tester grønne før/etter)
5. `app/[locale]/admin/games/[id]/InviteToGameClient.tsx` ↔ `app/[locale]/games/[id]/spillere/CreatorRosterClient.tsx` (143 linjer, 2 klyngegrupper) → delt helper/komponent.
6. `app/[locale]/(auth)/login/page.tsx` ↔ `app/[locale]/complete-profile/page.tsx` (151 linjer, 2 grupper) → delt action/mock-helper.
7. `app/[locale]/admin/courses/[id]/edit/actions.ts` ↔ `app/[locale]/admin/courses/new/actions.ts` (5 grupper, 126 linjer; delvis adressert via `lib/courses/coursePayload.ts`) → trekk ut gjenstående delt logikk.

### Docs
8. Slett orphan design-referanser: `docs/design/realized/quick-win-{1,3,5,6,7,8}/` + `docs/design/incoming/quick-win-8/`. **Behold** `docs/design/realized/brand-foundations/` og `docs/design/incoming/.gitkeep`.

## Scope — OUT (dokumenteres, ikke gjøres her)
- **Gatet scoring-dedup** `foursomesMatchplay.ts` ↔ `greensomeMatchplay.ts` (100 linjer) → nytt issue, test FØRST (CLAUDE.md `lib/scoring`-gate). Opprettes før PR-merge.
- **Duplikat-eksporter** (`computeLeaderboard`, `Intent`, `compute`) → bevisst false-positives, røres ikke (#611 dokumenterer dette).
- **fallow «unused files» false-positives** beholdes: `app/icon0.tsx` (Next.js metadata-route, sitert i `proxy.ts` + `manifest.ts`), `lib/database.types.ts`, `public/sw.js`, `scripts/backfillResultSummaries.ts`, `vitest.server-only-stub.ts`.
- **Bevisst offentlig API** beholdes: `lib/scoring/index.ts`-barrel (74 type-re-eksporter), icon-barrel, `components/ui`, next-intl-nav, `MAX_TEE_BOXES`, `ModeToggle`.
- **Test-fil-dupes** (bulken av fallows 21.7%) → test-disiplin-epic-territorium, ikke her.
- **fallow GitHub Action** (infra-oppfølging) → ikke nå.

## Suksesskriterier
- [ ] K1: `playerDisplay.ts` + `confirmActions.ts` slettet; build/tsc grønt (ingen brutte importer).
- [ ] K2: `getProxyVerifiedUserId`-re-eksport fjernet fra `flightJoinActions.ts`; intern bruk intakt; build grønt.
- [ ] K3: Ubrukt `const t` fjernet der lint flagget; `npm run lint` gir ingen *nye* `no-unused-vars` på berørte filer.
- [ ] K4: InviteToGame↔CreatorRoster-dup ekstrahert til delt modul; begge konsumenter bruker den; co-lokerte tester grønne.
- [ ] K5: login↔complete-profile-dup ekstrahert til delt modul; co-lokerte tester grønne.
- [ ] K6: courses edit↔new gjenstående dup ekstrahert (eller dokumentert at `coursePayload` allerede dekker alt); co-lokerte tester grønne.
- [ ] K7: quick-win design-docs slettet; `brand-foundations` + `.gitkeep` beholdt; ingen kode-importer brutt (kun JSDoc-kommentar i `BrandHero.tsx`, peker på beholdt brand-foundations).
- [ ] K8: Hele gate-suiten grønn (test + tsc + lint + build).
- [ ] K9: Follow-up-issue opprettet for gatet scoring-dedup (med milestone).

## Gates (kjøres scoped til endret, full suite før evaluering)
- `npm run test` (vitest run)
- `npx tsc --noEmit`
- `npm run lint` (eslint)
- `npm run build` (next build) — fanger exhaustive-switch/Record-hull som tsc alene kan misse.

## Risiko / notater
- Dedup-ekstraksjon er der risikoen ligger. Hver dedup committes atomisk, gates kjøres, og hvis en dup viser seg å være tilfeldig (ikke ekte delt logikk) eller krever risikabel prop-threading → **flagg og defer** til follow-up i stedet for å tvinge.
- `login/page.tsx` ↔ `complete-profile/page.tsx`: verifiser at de faktisk deler logikk (ikke bare tilfeldig like JSX) før ekstraksjon.
- Worktree: sett `git config --worktree core.hooksPath .githooks` før første commit (version-bump-hooken bypasses ellers stille).
