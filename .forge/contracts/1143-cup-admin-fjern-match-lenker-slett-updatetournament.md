# Spec: Cup admin — fjern manuelle +match-lenker (club-paritet) + slett dead updateTournament

**Issue:** #1143 · **Branch:** claude/1143-cup-admin-fjern-match-lenker-slett-updatetournament

## Problem
Cup-admin-flaten (`app/[locale]/admin/cup/[id]/CupManagement.tsx`) rendrer en rad med seks manuelle «+ match»-format-lenker (`CupManagement.tsx:248-269`) ubetinget for admin-varianten (`!isClub`) — uten status-gate. Klubb-varianten viser dem aldri (docstring `:43-45`), så admin og klubb har asymmetrisk cup-styring. Lenkene peker til `/admin/games/new`-wizarden (admin-chrome); samme seks formater er allerede tilgjengelige via «Tilpasset»-modus i generer-flyten (`GenerateMatchesWizard.tsx:275-281`, verifisert: id `tilpasset` mapper hver `CupSessionFormat`).

Parallelt ligger server-actionen `updateTournament` (`lib/cup/actions.ts:187-262`) — en full `'use server'`-mutasjon — helt uten kallere. `grep -rn updateTournament` gir kun selvreferansen (`:187`), de to `expectAffected`/`console.error`-strengene (`:251`, `:254`) og to kommentarer i søsken-funksjoner (`:291`, `:379`). Ingen test refererer den. Dette er dead code.

Prod har **0 cuper**, så ingen aktiv flyt brytes. Dette er ren opprydding + club/admin-paritet, ikke en oppførselsendring for reelle brukere (issue-label: `refactor`).

## Design

1. **Slett `updateTournament`-server-actionen** — fjern hele blokken `lib/cup/actions.ts:187-262` (fra `export async function updateTournament` t.o.m. den avsluttende `}` før `startTournament`). Verifiser at ingen imports i andre filer knekker: `grep -rn "updateTournament" --include=*.ts --include=*.tsx .` skal etter sletting kun treffe de to kommentar-referansene i `startTournament`/`finishTournament` («see updateTournament», `:291`/`:379`) — juster de to kommentarene til å ikke peke på en funksjon som ikke lenger finnes (f.eks. «assert the update touched a row (bug-prevention #2)»).
   - Kontroller at ingen imports i `actions.ts` blir foreldreløse: `requireAdminOrClubAdminOfCup` (fortsatt brukt `:269`, `:360`, `:460`), `cupRedirectBase` (`:270`, `:361`), `expectAffected` (`:293`, `:381`), `parseAllowancePct`/`ALLOWANCE_DEFAULTS` (fortsatt brukt i `createTournamentDraft`), `revalidateTag`/`revalidatePath` — alle skal fortsatt ha minst én bruk. Fjern IKKE imports som fortsatt brukes.

2. **Fjern den manuelle +match-grid-en** — slett kommentaren + hele `{!isClub && ( … )}`-blokken `CupManagement.tsx:248-269`. Behold generer-knappen (`:238-247`) og matches-lista (`:270-329`) urørt. `Link`-importen (`:3`) beholdes — den brukes fortsatt av generer-knappen (`:240-245`).

3. **Oppdater docstringen** `CupManagement.tsx:42-46` — den beskriver «+ match»-lenkene som en variant-forskjell («club-varianten skjuler de manuelle «+ match»-lenkene»). Etter fjerningen finnes de i ingen variant. Skriv om variant-forskjellene til de som faktisk gjenstår: shell (Admin/App), back/generer/slett-href, og at admin kan bore ned i hver match (SmartLink til `/admin/games/[id]`, `:322-324`) mens klubb viser matchene som info-kort.

4. **Rydd de foreldreløse error-/status-mappings** i `CupManagement.tsx` — etter at `updateTournament` er borte, er dette de eneste produsentene av følgende koder på cup-ruten:
   - `errorMessageMap` (`:78-90`): fjern nøklene `name`, `team_1`, `team_2`, `team_dup`, `points`, `update_failed`. Behold `start_failed`, `finish_failed`, `too_few_matches`, `wrong_status`, `already_finished` (produseres av `startTournament`/`finishTournament`).
   - `statusMessageMap` (`:91-97`): fjern `updated`. Behold `created`, `started`, `finished`, `matches_generated`.
   - Bekreft først at ingen annen action redirecter til cup-ruten med disse kodene: `createTournamentDraft` bruker `cup_`-prefiksede koder på en ANNEN rute (`:112-114`), så de ufiksede `name`/`team_1`/… hører kun til `updateTournament`.

5. **Fjern de nå-ubrukte i18n-nøklene** i BÅDE `messages/no.json` og `messages/en.json` (hold key-paritet):
   - `cup.manage.addSingles`, `addFourball`, `addFoursomes`, `addGreensome`, `addChapman`, `addGruesome` (`:4174-4179` i begge) — orphaned av steg 2.
   - `cup.manage.errors.name`, `errors.team_1`, `errors.team_2`, `errors.team_dup`, `errors.points`, `errors.update_failed`, og `cup.manage.statusMessages.updated` — orphaned av steg 4.
   - Etter fjerning: `grep -rn '"addSingles"\|"addGruesome"' messages/` skal være tomt (add-nøklene er unike substrings). **NB:** en naken `grep -rn update_failed messages/` blir ALDRI tom — `update_failed` finnes også i urelaterte nøkler (`guest_profile_update_failed`, en profil-`update_failed` ~`:3340`, `email_update_failed`), så bruk den IKKE som tom-gate. Verifiser i stedet at cup-nøklene er borte ved at `errorMessageMap`/`statusMessageMap` i `CupManagement.tsx` ikke lenger refererer dem, og at no/en har identisk nøkkel-sett i `cup.manage`-treet.

6. **Commit-disiplin:** label er `refactor`, ingen oppførselsendring for reelle brukere (0 cuper). Bruk `refactor(cup): …`-prefiks → **ingen version-bump, ingen CHANGELOG-linje** (refactor passerer commit-msg-hooken fritt). Hver commit har `Refs #1143` i body. Atomiske commits (f.eks. én for dead-action-slett, én for UI/i18n-opprydding). PR med `Closes #1143` i body.

## Edge Cases & Guardrails
- **Aktiv cup + legge til match:** +match-grid-en var uten status-gate, så admin kunne teknisk legge match i en `active`/`finished` cup. Generer-flyten redirecter bort med mindre `status === 'draft'` (`GenerateMatches.tsx:89-98`). Fjerningen fjerner dermed admins mulighet til å legge match etter draft — men det er nettopp paritet med klubb (som aldri hadde det), og prod har 0 cuper. Ikke bygg en erstatning; dette er tilsiktet.
- **Ingen missing-message-regresjon:** i18n-nøklene fjernes SAMTIDIG som deres eneste `t()`-kallesteder. Ikke fjern en nøkkel som fortsatt refereres. Kjør `npm run build` — MISSING_MESSAGE ville dukket opp der hvis en referanse ble stående.
- **Ikke rør allowance-error-kodene:** `updateTournament` redirecter også med `?error=allowance`/`foursomes_allowance`/… (`:217-229`), men disse fantes aldri i `errorMessageMap` — ikke legg dem til, ikke jag dem.

## Key Decisions
- **`refactor`-prefiks, ingen bump/CHANGELOG:** endringen er admin-only (eier) og rammer ingen reell cup (0 i prod); framet som paritet/opprydding. CHANGELOG er spiller-rettet — ingen linje.
- **Fjern i18n-nøklene, ikke bare mappings:** orphaned message-nøkler er akkurat den driften repoet ellers sporer; å ta dem i samme atomiske PR holder no/en i sync og unngår etterslep.

**Claude's Discretion:** eksakt commit-oppdeling; ordlyden i den omskrevne docstringen og de to justerte «see updateTournament»-kommentarene; om error-/status-opprydding og i18n-slett samles i én commit eller to.

## Success Criteria
- [x] `updateTournament` finnes ikke lenger i `lib/cup/actions.ts`; `grep -rn updateTournament` treffer ingen funksjonsdefinisjon/kall (kun evt. omskrevne kommentarer uten funksjonsnavnet). — EVIDENS: repo-wide grep (--include *.ts/*.tsx) exit 1 (null treff); begge #727-kommentarene omskrevet til «bug-prevention #2» (commit f181f04a).
- [x] Den manuelle +match-grid-en (`CupManagement.tsx:248-269`) er fjernet; generer-knapp og matches-liste er urørt. — EVIDENS: diff af7dea7c fjerner kun kommentar + `{!isClub && (…)}`-blokken; generer-knappen (nå :227-240) og matches-lista uendret i diff.
- [x] Docstringen (`CupManagement.tsx:42-46`) beskriver ikke lenger «+ match»-lenkene som en variant-forskjell. — EVIDENS: omskrevet til shell/href-forskjeller + admin SmartLink-drill-down vs klubb info-kort (CupManagement.tsx:43-45).
- [x] `errorMessageMap`/`statusMessageMap` inneholder ingen av de foreldreløse kodene (`name`, `team_1`, `team_2`, `team_dup`, `points`, `update_failed`, `updated`). — EVIDENS: maps nå :78-84 (5 error-koder) og :85-90 (4 status-koder); grep bekrefter.
- [x] `messages/no.json` og `messages/en.json` har fjernet `cup.manage.addSingles..addGruesome` + de orphaned error/status-nøklene, og har identisk `cup.manage`-nøkkelsett. — EVIDENS: python-flatten av begge cup.manage-trær → parity: True, orphans gone: True; `grep '"addSingles"\|"addGruesome"' messages/` exit 1.
- [x] Cup-admin-siden (`/admin/cup/[id]` i draft) rendrer uten grid-en, uten runtime-feil; klubb-varianten er uendret. — EVIDENS: `npm run build` exit 0 (ingen MISSING_MESSAGE, ruten prerendret OK); klubb-varianten rendret aldri grid-en (`!isClub`-gate) og dens kodesti er uendret i diff. Staging-render-sjekk: se Gates.
- [x] Ingen foreldreløse imports i `lib/cup/actions.ts` eller `CupManagement.tsx`. — EVIDENS: grep viser gjenbruk av alle (NAME_RE/TEAM_NAME_RE/parsePointsToWin/parseAllowancePct/ALLOWANCE_DEFAULTS i createTournamentDraft; requireAdminOrClubAdminOfCup/cupRedirectBase/expectAffected i start/finish; Link i generer-knappen :233); lint 0 errors.

## Gates
- [x] `npm run build` (fanger MISSING_MESSAGE + ubrukt/ødelagt import + exhaustive-switch) — exit 0
- [x] `npm run lint` — exit 0, 0 errors (56 pre-eksisterende warnings)
- [x] `npx vitest run lib/cup app/[locale]/admin/cup` — 9 filer, 110 tester, alle grønne
- [ ] Lett staging-render-sjekk (valgfri, builder-skjønn): `/admin/cup/[id]` for en draft-cup rendrer uten grid; ingen full flyt-verify kreves (refactor-label, 0 prod-cuper)

## Files Likely Touched
- `lib/cup/actions.ts` — slett `updateTournament` (`:187-262`), juster to kommentarer
- `app/[locale]/admin/cup/[id]/CupManagement.tsx` — fjern +match-grid (`:248-269`), oppdater docstring (`:42-46`), rydd error-/status-mappings (`:78-97`)
- `messages/no.json` — fjern orphaned `cup.manage`-nøkler
- `messages/en.json` — fjern samme nøkler (key-paritet)

## Out of Scope
- Ingen ny funksjonalitet for å legge match til en aktiv/ferdig cup — fjerningen er tilsiktet paritet.
- Ingen endringer i generer-flyten (`GenerateMatches.tsx`, `GenerateMatchesWizard.tsx`, `generer/actions.ts`) — den dekker allerede de seks formatene via «Tilpasset».
- Ingen DB-/RLS-/migrasjonsendringer (ren frontend + dead-action-sletting).
- Ingen allowance-error-koder legges til eller fjernes.
- Ingen version-bump / CHANGELOG-linje (refactor, ikke bruker-synlig for reelle brukere).
