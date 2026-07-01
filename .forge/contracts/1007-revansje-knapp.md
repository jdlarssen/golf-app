# Spec: Revansje-knapp — dupliser avsluttet spill inn i opprett-veiviseren

**Issue:** [#1007](https://github.com/jdlarssen/golf-app/issues/1007) (del 1 av epic [#1006](https://github.com/jdlarssen/golf-app/issues/1006) «Runden sår den neste») + [#1011](https://github.com/jdlarssen/golf-app/issues/1011) (blokkerende bug, fase 0)
**Branch:** `claude/trusting-wilson-c9418e`
**Type:** feat · area:ui · MINOR-bump (+ PATCH-bump for #1011-fiksen i egen commit)
**Gray areas:** avgjort av Claude mot kodebasen (eier-delegert), dokumentert under Key Decisions.

## Problem

De fleste turneringer er reprise av forrige, men i dag må arrangøren gjennom hele veiviseren på nytt (~15 min for full config). Og bare den som pleier å arrangere gjør det — inviterte spillere blir aldri arrangører. En «Revansje?»-knapp på avsluttet spill som åpner opprett-veiviseren ferdig utfylt gjør reprisen til under ett minutt og gjør alle deltakere til potensielle arrangører — den viktigste veksthendelsen appen har (board-vedtak, se epic #1006).

## Research Findings

Ingen nye eksterne API-er introduseres — alt bygger på interne, verifiserte mønstre (tre scout-agenter, funn med fil:linje; RLS verifisert mot prod `pg_policies` via Supabase MCP):

- **Prefill-infrastrukturen finnes komplett.** `GameWizard` tar `initialValues?: InitialValues` (`GameWizard.tsx:79`) + `initialIntent` (`:83`); `InitialValues`-typen (`GameForm.tsx:58–258`) dekker bane/tee/format/team_size/side_*/players-med-lag/player_genders. Edit-flyten (`lib/games/editGameInitialValues.ts:86–188`) er ferdig rad→InitialValues-mapper; cup-lenken (`admin/games/new/page.tsx:215–274`) er presedens for searchParam→server-fetch→initialValues.
- **Opprett-retten er universell** (#427/0071): `/opprett-spill` gater kun på innlogging (`opprett-spill/page.tsx:49–55`); `createGameInternal` har ingen admin-guard; prod-RLS har «games creator insert» (`created_by = auth.uid()`) + «game_players creator insert». Ingen nye rettigheter trengs.
- **⚠️ Blokkerende funn (#1011):** `FormDataInputs` (`GameWizard.tsx:936–1176`) speiler IKKE side_*-feltene; de submittes kun mens `AdvancedSettingsSection` er montert, og `ReadyStep.tsx:230–238` monterer den betinget på `advancedOpen`. Prefilt sideturnering ville forsvinne stille — og dagens brukere mister config ved lukket seksjon. Fase 0 fikser dette.
- **Key-remount-fella (kjent memory-trap):** `useGameFormState` leser `initialValues` kun ved mount (`useGameFormState.ts:309–311`); GameWizard monteres i dag uten `key`.
- **Datakilde-hull:** cachede `getGameWithPlayers` (`lib/games/getGameWithPlayers.ts:151–162`) mangler `tournament_id`/`league_round_id`/`group_id` — trengs for cup/liga-gate og intent-derivering.

## Prior Decisions (videreført)

- **#344/#346 (én dør per rom):** prefill går INN i eksisterende `/opprett-spill` via searchParam — ingen ny opprettelsesflyt, ingen skriving før vanlig publish-steg.
- **#427:** `/opprett-spill` er den rollen-uavhengige døra; `createGameInternal` forgrener redirect på `is_admin` selv.
- **#435:** revansje-flyten beholder `getNewGameFormData(false)` — ingen e-post i RSC-payload for ikke-admin.
- **#969:** Wolf/Round Robin trekker rotasjons-slots ved spillstart — team/flight fra kilde-spillet skal IKKE prefilles for disse.
- **#942 (ShareResultButton):** stil-/gating-referanse for CTA på resultatflater.
- **Caching-doktrinen (CLAUDE.md):** authz på call-site ved bruk av `getGameWithPlayers` (`me = players.find(...)`).

## Design

### Fase 0 — #1011: side-felt-serialisering (egen commit, PATCH)

Speil sideturnerings-feltene i `FormDataInputs` slik at de submittes uavhengig av disclosure-tilstand:
- `side_tournament_enabled` er allerede controlled state (`sideEnabled`) → hidden input i FormDataInputs.
- LD-/CTP-count og disabled-categories er i dag uncontrolled i `AdvancedSettingsSection` (`:183/:204`) → løft til controlled state i `useGameFormState` (init fra `initialLdCount`/`initialCtpCount`/`initialDisabledCategories`) og speil som hidden inputs. AdvancedSettingsSection bytter `defaultChecked`→`checked`+`onChange`.
- Server-siden (`parseSideTournamentFromFormData`) er uendret — den leser de samme feltnavnene.
- Regresjonstest (Type A-aktig på wizard-nivå): eksisterende GameWizard-testfil får én test som asserter at side-feltene finnes i FormData når `sideEnabled=true` og ReadyStep-disclosure er lukket.

### Fase 1 — prefill-helper + route-wiring

**Ny helper `buildRevansjeInitialValues`** (i `lib/games/`, co-lokert test): gjenbruker `buildEditInitialValues`-maskineriet (gjenbruk/refaktor til delt kjerne — Claude's discretion på formen) med disse avvikene:
- **Utelater `name`** (prefilt navn setter `nameTouched` og dreper auto-navngiving fra bane+dato, `GameWizard.tsx:193–196`).
- **Utelater `scheduled_tee_off_at`** (per issue: dato velges av brukeren; #902-guarden mot fortid gjelder uansett).
- **Tvinger `lock_game_mode: false`** (buildEditInitialValues setter true for finished — prefill er forslag, ikke lås).
- **Filtrerer bort withdrawn spillere** (`withdrawn_at != null`).
- **Nuller team/flight for `wolf` og `round_robin`** (#969-slots skal re-trekkes).
- Beholder: course_id, tee_box_id, game_mode, team_size/mode_config-avledede felt, side_*-config, players m/ team/flight, player_genders, registration-felter (der mapperen alt støtter dem).

**`/opprett-spill?fra=<gameId>`** (`app/[locale]/opprett-spill/page.tsx`):
1. Parse med kanonisk `first()` (`lib/url/searchParams.ts`).
2. Hent kilde via `getGameWithPlayers(fraId)` + **authz på call-site**: brukeren MÅ være i `players` (ellers ignorer param → vanlig veiviser, ingen dataleakasje siden ingenting bygges før sjekken).
3. Valider: `status === 'finished'` OG `tournament_id === null` OG `league_round_id === null` — ellers ignorer param.
4. Bygg initialValues + `initialIntent` (`group_id` → `'klubb'` + `defaultGroupId`; ellers derivér fra `format_intent_mapping` med `'kompis'` som preferanse) og send til `GameFormBody`.
5. **`key={fraId ?? 'blank'}` på GameWizard** (remount-fella).
6. Prefill-banner over veiviseren: «Forhåndsutfylt fra ‹spillnavn› — alt kan endres» (namespace `wizard.createDoor.*`).
7. Én `console.log('[opprett-spill] revansje-prefill …')` server-side når prefill aktiveres (eneste telemetri-mønster i repoet; Vercel-logs).

**Cache-utvidelse:** `getGameWithPlayers`-selecten får `tournament_id`, `league_round_id`, `group_id` (immutable etter opprettelse → trygt under `game-${id}`-taggen). **Bump cache-nøkkelen** (keyParts-versjon) så stale entries uten de nye feltene aldri leses — en `undefined` tournament_id ville ellers vist knappen på cup-spill.

### Fase 2 — knappen på game-home

**Plassering: game-home sin finished-gren** (`app/[locale]/games/[id]/(home)/page.tsx`, CTA-blokka :931–965) — IKKE LeaderboardChrome. Grunner: format-agnostisk (matchplay-familien har ikke podium), strengt deltaker-gatet (`me`-sjekk :206–207), og lekker aldri til offentlig `/spectate/[token]` (som rendrer samme leaderboard-innhold anonymt). Alle deltakere ser knappen (ikke bare arrangør).

- Gate: `isFinished && !game.tournament_id && !game.league_round_id` (fra utvidet cache — ingen ny fetch).
- Href: `/opprett-spill?fra=${game.id}` for alle roller (én dør; `createGameInternal` forgrener admin-redirect selv).
- Stil: sekundær `LinkButton`/Card-mønsteret fra samme CTA-blokk, ≥44px tap-target, `data-testid="revansje-button"` (e2e asserter aldri norsk copy).
- Copy under `game.home.*` i BÅDE `messages/no.json` og `messages/en.json` (catalogParity-testen håndhever), humanizer-sjekket. Knapp: «Revansje?».

### Fase 3 — flyt + changelog

- `docs/flows/05-kjor-og-avslutt-spill-fremtid.svg`: ny kant avsluttet spill → «Revansje?» → opprett-flyten (04). Regenerer PNG per `docs/flows/README.md` (qlmanage-løkka). Samme PR.
- MINOR-bump + CHANGELOG Funksjoner-rad med ↳-lenke mot spillsiden (`docs/changelog-conventions.md`-format). #1011-commiten: PATCH-bump + Feilrettinger-linje.

## Edge Cases & Guardrails

- **Ikke-deltaker/uinnlogget med `?fra=`:** param ignoreres (authz før bygging); uinnlogget redirectes til login av eksisterende gate.
- **Kilde er cup/liga eller ikke-finished:** param ignoreres → vanlig tom veiviser (og knappen vises aldri på slike spill).
- **Arkivert tee:** `newGameFormData.ts:101` filtrerer arkiverte tees — prefilt `tee_box_id` som mangler i options skal degradere til «tee ikke valgt» (bane beholdes); steg 3-gatingen fanger det før publish. Slettet bane er en ikke-case (FK NO ACTION + `deleteCourse`-guard), slettede brukere likeså (FK blokkerer sletting med game_players-rader).
- **Pending-profil i kilde-rosteren:** prefilles som normalt; eksisterende publish-gate (`pending_players`-feil) håndterer det eksplisitt — ingen stille filtrering.
- **Revansje fra spill A, så spill B (same-route):** `key`-remount sikrer fersk state.
- **Ingen DB-skriving før publish:** knappen og prefillen er ren navigasjon + lesing; `createGameInternal` kjører uendret med alle validatorer (mode-whitelist, tee-off-#902, team-balanse, atomisk insert m/ kompenserende delete #737).
- **Format-synlighet:** prefilt `game_mode` gir `formatChosen=true`; intent deriveres så formatet er synlig i valgt intents katalog. Hvis brukeren endrer spillerantall på steg 2 kan format nullstilles — akseptert (eksisterende veiviser-oppførsel, prefill er forslag).
- **Spectate-lekkasje:** knappen bor kun på game-home (deltaker-gatet flate) — verifiser at ingenting revansje-relatert rendres i `LeaderboardShell`/spectate.

## Key Decisions

- **Plassering = game-home finished-gren, ikke leaderboard-chromen** — format-agnostisk, deltaker-gatet, spectate-trygt (mot: chromen hadde gitt knappen på podium-views, men lekker til spectate + mangler for matchplay + admin-bypass).
- **Én inngang `/opprett-spill?fra=` for alle roller** (ikke rolle-forgrenet href som hjem-CTA-en) — mindre wiring, #427 gjør døra universell, action-redirecten forgrener selv. Admin kan fortsatt bruke sin vante flate manuelt.
- **`?fra=<id>`-param + server-side bygging** (ikke serialisert state i URL) — cup-lenke-presedens, roster for stor for URL, authz håndheves server-side.
- **Cache-utvidelse + nøkkel-bump** (ikke slank direkte-fetch à la CupStandingsLink) — gate-data blir gratis på game-home og prefill-fetchen gjenbruker cachen; immutable kolonner gjør det trygt.
- **#1011 fikses som fase 0 i samme PR** (egen commit m/ PATCH-bump) — den er en hard avhengighet for side-prefill-AC-en og en reell datatap-bug i prod; å vente på egen PR-syklus gir bare merge-koordinering uten gevinst. PR-body: `Closes #1007` + `Closes #1011`.
- **Withdrawn filtreres, pending beholdes** — withdrawn var eksplisitt ute av forrige runde; pending stoppes høylytt av eksisterende publish-gate i stedet for å forsvinne stille.
- **Ingen ny telemetri/skjema** — #1010 måler epicens suksess (runde nummer to per gjeng); én prefikset console.log er nok for attribusjon i Vercel-logs.

**Claude's Discretion:**
- Formen på gjenbruket i `buildRevansjeInitialValues` (wrapper rundt vs. delt kjerne med `buildEditInitialValues`) — velg minst test-churn.
- Eksakt banner-/knapp-plassering og sekundær-stil innen etablerte mønstre; expectedPlayerCount-håndtering hvis InitialValues-typen støtter det.
- Om `firstParam`-parsing skjer i `page.tsx` eller egen loader-funksjon.

## Success Criteria

- [x] **K0 (#1011):** Sideturnering overlever lukket disclosure. *Bevis: `GameWizard.test.tsx` («overlever lukket disclosure» + «åpen disclosure gir IKKE duplikat-entries») + `GameForm.test.tsx` («serialiseres inline» — edit-/full-form-pathene); staging-repro 2026-07-02: publisert via prefill med panelet lukket → DB-rad fikk `enabled=true, ld=2, ctp=1, categories=['most_birdies_team']` (nøyaktig én entry).*
- [x] **K1:** Staging-klikkrunde 2026-07-02 (e2e-admin): `data-testid="revansje-button"` (46px, href `/opprett-spill?fra=<id>`) på avsluttet frittstående spill → banner «Forhåndsutfylt fra QA Revansje 1007 A — alt kan endres.», intent kompis, stableford + solo-variant valgt, bane/tee prefilt, dato TOM, begge spillere som chips, auto-navn «Byneset North 9. juli» (kilde-navn ikke arvet) → publish OK. Kode: `(home)/page.tsx` finished-gren + `opprett-spill/page.tsx` `loadRevansjeContext`.
- [x] **K2:** Staging: cup-spill viste ingen knapp; `?fra=<cup-id>` ga tom veiviser uten banner/prefill. Kode-gates: `isFinished && !tournament_id && !league_round_id` (game-home) + loader-validering (opprett-spill). Ikke-deltaker-/ikke-finished-avvisning verifisert på kodenivå av uavhengig evaluator (authz før bygging).
- [x] **K3:** Ingen nye server-actions/endpoints i diffen; staging-publish gikk gjennom `createGameInternal` uendret, nytt spill fikk `created_by` = klikkeren, status `scheduled`, deltakere via vanlig invitasjonsmekanisme.
- [x] **K4:** `lib/games/buildRevansjeInitialValues.test.ts` — 8 tester inkl. `it.each` wolf/round_robin-nulling og withdrawn-filtrering. Grønn.
- [x] **K5:** `messages/catalogParity.test.ts` grønn (nøkler i no+en); humanizer-sjekket copy; grep bekrefter null revansje-referanser i `spectate/`/`leaderboard/`.
- [x] **K6:** `docs/flows/05-kjor-og-avslutt-spill-fremtid.svg` + regenerert PNG i commit 7d2793fa (avsluttet → «Revansje?» → opprett-flyt-kant).
- [x] **K7:** Versjonskjede 1.162.3 (PATCH, Feilrettinger-linje, c6c70622) → 1.163.0 (MINOR, Funksjoner-rad m/ ↳, 7d2793fa) → 1.163.1/1.163.2 (PATCH, `[no-changelog]`, 89482f79/427e6f85); alle commits har `Refs #1007`/`Refs #1011`; commit-msg-hook grønn hele veien. Full suite: 4413/4413 (exit 0), `npm run build` exit 0 på HEAD.

## Gates

```bash
npx tsc --noEmit
npm run lint
npx vitest run app/\[locale\]/admin/games/new lib/games messages/catalogParity.test.ts
npm run build            # autoritativ (RSC-graf + exhaustive maps)
# Staging-klikkrunde FØR merge (bruker-synlig endring):
#   avsluttet spill → Revansje → verifiser prefill → publiser → nytt spill OK
#   + K0-repro (sideturnering m/ lukket seksjon) + K2 (cup/liga-spill uten knapp)
```

## Files Likely Touched

- `app/[locale]/admin/games/new/GameWizard.tsx` — FormDataInputs: side-felt-speiling (#1011)
- `app/[locale]/admin/games/new/useGameFormState.ts` — controlled LD/CTP/categories-state (#1011)
- `app/[locale]/admin/games/new/sections/AdvancedSettingsSection.tsx` — uncontrolled→controlled (#1011)
- `lib/games/editGameInitialValues.ts` (+ evt. ny fil) — `buildRevansjeInitialValues` + delt kjerne
- `lib/games/buildRevansjeInitialValues.test.ts` (el.l.) — co-lokert Type A-test
- `lib/games/getGameWithPlayers.ts` — select + cache-nøkkel-bump (tournament_id/league_round_id/group_id)
- `app/[locale]/opprett-spill/page.tsx` — `?fra=`-parsing, authz, prefill-bygging, banner, `key` på wizard
- `app/[locale]/games/[id]/(home)/page.tsx` — Revansje-CTA i finished-grenen
- `messages/no.json` + `messages/en.json` — `game.home.*`-knapp + `wizard.createDoor.*`-banner
- `docs/flows/05-kjor-og-avslutt-spill-fremtid.svg` + `.png` — ny kant
- `package.json`/`package-lock.json`/`CHANGELOG.md` — bumps + rader

## Out of Scope

- «Kjør igjen»-knapp på arrangørens admin-/administrasjonsflater (game-home dekker arrangøren også; egen idé hvis savnet).
- Prefill av dato/tid (+7 dager e.l.) — bevisst utelatt per issue.
- Re-invitasjons-mail/push til prefilte spillere ved publish utover dagens `notifyInvitedToGame`-oppførsel.
- Provenance-felt på `games` («opprettet fra spill X») — ikke behov før noen ber om attribusjon.
- Migrering av `CupStandingsLink` til den utvidede cachen — mulig opprydding, eget funn.
- Selv-slette-flytens `delete_failed` for brukere med finished-spill (pre-eksisterende design-smell funnet under scouting — vurderes som eget issue, ikke del av denne PR-en).
