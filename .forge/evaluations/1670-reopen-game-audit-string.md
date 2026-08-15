# Evaluation: #1670 — reopenGame sender rå arrangørnavn

**Kontrakt:** `.forge/contracts/1670-reopen-game-audit-string.md`
**Branch:** `claude/1670-reopen-game-audit-string` (1 commit over `origin/main`, `d4cb28ae`)
**Evaluator:** fersk kontekst, skeptisk. Ingen produkt-/testfiler endret varig.
**Dato:** 2026-08-16

---

## Success criteria

| # | Kriterium | Verifisert hvordan | Status |
|---|---|---|---|
| 1 | Navnløs admin gjenåpner spill → `game_reopened`-payload `actor_name: null` | `actions.ts:621` sender `actorName: name` (rå, nullable) fra `loadAdminContext`; `events.ts:188` fører den urørt inn i `actor_name`. Bekreftet live på staging: payload `{"actor_name": null}` | ✅ |
| 2 | Kortet rendrer «Arrangøren» | `cardContent.ts:105` — `p.actor_name ?? t('organizerFallback')`; `messages/no.json .inbox.organizerFallback = "Arrangøren"`. Live: kortteksten leste «Arrangøren åpnet …» | ✅ |
| 3 | Audit-loggen uendret («Admin»-fallback) | `actions.ts` `logAdminEvent({ actorName })` er urørt i diffen; `loadAdminContext` beholder `actorName: role.name?.trim() \|\| 'Admin'`. Enhetstest asserterer `logAdminEventMock` kalt med `actorName: 'Admin'` i samme navnløse scenario | ✅ |
| 4 | Tester grønne; `npm run build`, `npm run lint` | Se gate-tabellen | ✅ |
| 5 | (Kontrakt steg 4) `endGame` undersøkt og konklusjon skrevet i commit-body | Bekreftet ved lesing — se «Byggerpåstander» | ✅ |

---

## Gates

| Gate | Kommando | Resultat |
|---|---|---|
| Enhetstester | `npx vitest run lib/notifications "app/[locale]/admin/games/[id]" lib/games` | **84 filer, 1484 tester passert** |
| Typer | `npx tsc --noEmit -p .` | **exit 0**, 0 linjer output |
| Lint (endrede filer) | `npx eslint` på de 4 endrede `.ts`-filene | **exit 0**, ingen funn |
| Lint (full) | `npm run lint` | **exit 0** — 56 warnings, alle pre-eksisterende, ingen i endrede filer |
| Build | `npm run build` | **exit 0** (eksitkode fanget direkte, ikke via pipe) |
| Ukesslipp | `node scripts/weekly-release.mjs --dry-run` | **exit 0**; `.changes/1670-*.md` folder til én Feilrettinger-linje under `1.233.0` |

---

## Byggerpåstander — verifisert mot koden

| Påstand | Funn |
|---|---|
| `loadAdminContext` returnerer `{ supabase, user, name, actorName }` | ✅ `actions.ts:41-51`. `name: role.name?.trim() \|\| null`, `actorName: role.name?.trim() \|\| 'Admin'`. `requireAdmin` → `AdminRoleContext.name: string \| null` (`lib/admin/auth.ts:15,37`) — kilden finnes reelt |
| `reopenGame` sender rå `name` til `notifyPlayersGameReopened` | ✅ `actions.ts:556` destrukturerer begge; `:621` sender `actorName: name` |
| `notifyPlayersGameReopened` utvidet til `string \| null` | ✅ `events.ts:176` |
| `logAdminEvent` uendret | ✅ Diffen rører ikke `logAdminEvent`-kallet (`actions.ts:594-601`) |
| `endGame`s `actorName` når kun `logAdminEvent`, aldri en payload | ✅ **Selvstendig bekreftet.** `grep 'actor'` i `lib/games/endGameCore.ts` gir kun 4 treff: doc (:106), parameter (:121), `actorId: actor.id` (:265), `actorName: actor.name` (:266) — begge inne i `logAdminEvent`. Kontrakten sa :264-274; faktisk :264-273. Videre: `game_finished`-payloaden bygges med kun `game_id` + `game_name` (`events.ts:53-57`), og `sendGameFinishedNotification` (`lib/mail/gameFinishedNotification.ts:287`) tar ingen aktørnavn-parameter. Commit-body-en dokumenterer dette, som kontrakt-steg 4 krevde |
| To røde-først-tester lagt til | ✅ Begge mutasjonstestet, se under |

---

## Mutasjonstest (er testene ekte røde-først?)

| Mutasjon | Forventning | Faktisk |
|---|---|---|
| `actions.ts:621`: `actorName: name` → `actorName` (pre-fix-tilstand) | `#1670`-testen i `actions.test.ts` blir rød | **RØD** på `actions.test.ts:916` — `notifyMock` mottok payload uten `actor_name: null` (fikk `'Admin'`) |
| `events.ts:188`: `actor_name: game.actorName` → `game.actorName ?? 'Admin'` | `#1670`-casen i `events.test.ts` blir rød | **RØD** på `events.test.ts:360` |

Begge filer gjenopprettet fra backup etter hver mutasjon; `git status` bekreftet ren mellom og etter.

---

## Konsistens-sjekk mot #1598 (søsken)

`reopenScorecard` (`actions.ts:364-446`, landet på `main` via #1598) og `reopenGame` er nå
konsistente: begge destrukturerer `{ name, actorName }`, sender **rå `name`** i
notifikasjons-payloaden (`:437` hhv. `:621`) og **audit-strengen `actorName`** til
`logAdminEvent`. Begge har kommentar som forklarer hvorfor.

**Bredde-sveip (T2 steg 3):** `grep 'actor_name:'` over `app/` + `lib/` (uten tester) gir fem
produsenter. Etter denne PR-en bærer ingen av dem en audit-streng:
`actions.ts:437` (rå `name`), `events.ts:188` (rå, nullable),
`profile/venner/actions.ts:42` (`getDisplayName`, nullable),
`venner/legg-til/[code]/actions.ts:59` (rå profilnavn),
`admin/auditLog.ts:50` (audit-tabellen selv — riktig sted for strengen).
**Ingen gjenstående søskenlekkasje funnet.**

---

## Staging-bevis

Rigg: `next dev -p 3147` fra **denne** worktreen (`rm -rf .next`; `lsof -p <pid> -d cwd` bekreftet
cwd = worktreen), staging-env injisert før Next starter (boot-linje:
`SUPABASE_URL host = snwmueecmfqqdurxedxv.supabase.co`). Playwright via Bash, OTP mintet med
service-role. Engangs-riggspill `ETTERPRØVING 1670 gjenåpning` (status `finished`, E2E-spilleren
som eneste deltaker) opprettet og slettet igjen — **ingen ekte staging-spill ble gjenåpnet**.
E2E-adminens `users.name` ble midlertidig nullet og gjenopprettet.

| Akseptansepunkt | Struktur-orakel | Feillogg | SQL-orakel |
|---|---|---|---|
| Navnløs arrangør gjenåpner ferdig spill → spillerens innbokskort sier «Arrangøren» | Kortet (`[data-notification-kind=game_reopened]`, 1 treff) leste: «🔄 Runden er åpnet igjen — **Arrangøren** åpnet ETTERPRØVING 1670 gjenåpning igjen, så dere kan rette slagene». Inneholder «Arrangøren» ✅, inneholder ikke «Admin» ✅ | 0 console-errors, 0 requestfailed (utenom ERR_ABORTED) | `notifications?kind=eq.game_reopened&user_id=eq.<spiller>` → `payload = {"game_id":"e7ec97f1…","game_name":"ETTERPRØVING 1670 gjenåpning","actor_name":null}` ✅ |
| Gjenåpningen skjedde faktisk (ikke bare et grønt skjermbilde) | Admin-siden viste `[data-testid=reopen-game]`; etter klikk landet URL-en på `?status=game_reopened` | 0 / 0 | `games` gikk `finished`/`ended_at=2026-08-15T22:14:14Z` → `active`/`ended_at=null` ✅ |
| **Negativ kontroll:** navngitt arrangør → kortet viser det ekte navnet (fallbacken er ikke ubetinget) | Kortet leste «**Test Admin** åpnet ETTERPRØVING 1670 gjenåpning igjen …»; «Arrangøren» fraværende ✅ | 0 / 0 | `payload.actor_name = "Test Admin"` ✅ |

**Prod-vakt:** oracle-hooken kontrollerte *hver* request mot en `*.supabase.co`-host i begge
kjøringer — 6 + 6 kall, **alle** mot `snwmueecmfqqdurxedxv.supabase.co`, `prodViolations: []`.
Server-siden er dekket av at staging-env injiseres i prosessen før Next starter (boot-linjen over)
og av at all REST-hjelperen i riggen hard-stopper på ikke-staging-URL.

**Opprydding (verifisert etter kjøring, ikke bare påstått):**
`leftoverRigGames: []` · `adminName: "Test Admin"` (gjenopprettet) ·
`recentGameReopenedForPlayer: []` (begge test-varsler slettet) · dev-serveren stoppet
(port 3147 fri) · `git status` ren utenom den utrackede `.forge/`-kontrakten.

---

## Funn

**Ingen blokkerende funn.**

**Info 1 — overlappende kontekst-hjelpere.** Etter #1598 og denne PR-en returnerer
`loadAdminContext` og `loadAdminOrCreatorContext` samme *navne*-form (`name` + `actorName`).
De er ikke identiske: `loadAdminOrCreatorContext` har i tillegg `isAdmin` + `detailPath`, og
en annen fallback (`'En arrangør'` for ikke-admin mot `'Admin'`). Ingen handling foreslått —
en sammenslåing ville tvinge `detailPath` inn på call-sites som ikke bruker den. Nevnt kun
som orientering.

**Info 2 — kontrakt-linjenummer drev.** Kontrakten peker på `endGameCore.ts:264-274`; faktisk
`:264-273`. Kosmetisk; funksjonelt stemmer påstanden.

**Info 3 — `git status` var ikke helt ren ved oppstart.** `.forge/contracts/1670-…md` lå
utracket. Det er forge-bokføring, ikke produktkode, og er uendret av evalueringen.

---

## VERDICT: **ACCEPT**

Alle fem success-kriterier er dekket av bevis produsert i denne økten. Seks gates grønne med
eksitkoder fanget direkte. Begge nye tester er mutasjonsbekreftet røde-først — de tester den
faktiske fiksen, ikke seg selv. Staging-runden viser hele kjeden ende-til-ende (UI-klikk →
DB-flipp → payload `null` → «Arrangøren» i mottakerens innboks), med en negativ kontroll som
utelukker at fallbacken alltid vises. Bredde-sveipet fant ingen gjenstående søskenlekkasje av
audit-strenger inn i notifikasjons-payloader. Staging er ryddet og prod ble aldri berørt.
