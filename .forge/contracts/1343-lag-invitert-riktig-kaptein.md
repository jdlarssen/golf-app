# Kontrakt: Lag-invitert kobles til laget som faktisk inviterte dem (#1343)

**Issue:** #1343 (HCD-audit F1, P2) · **Klasse:** bruker-synlig · **Produktvalg:** ja (se Alternativer)

## Problem

En e-post-invitert medspiller som logger inn og lander på `/signup/[shortId]/team` får en «Bli med på lag»-knapp. Server-aksjonen `attachToCaptainTeam` velger kaptein ved å hente NYESTE kaptein-request for spillet — den ignorerer `invitations.invited_by`, som identifiserer riktig kaptein og allerede hentes i samme funksjon (brukes kun til auto-vennskap). I et spill med flere lag blir invitéen stille koblet til feil lag så snart et annet lag registrerer seg etter invitasjonen. UI-et forverrer det: `invited_unknown`-visningen viser verken lagnavn eller kapteinnavn før man trykker.

## Research-funn (verifisert i økten mot main @ 2204043, kryss-verifisert av fersk-kontekst-agent)

- `teamActions.ts` er `'use server'` (linje 1) — delte helpers må bo i egen fil; modulen importerer i dag ingen sibling-moduler (delte server-helpers bor i `lib/`, f.eks. `getGameByShortId` importert av både action og page).
- Kaptein-oppslaget: `teamActions.ts:952-967` (`eq game_id` :955, `eq is_team_captain` :956, `in status` :957, `order created_at desc` :958, `limit(1)` :959; `captains?.[0]` :968). Doc-kommentaren :883-900 innrømmer heuristikken (:891-892).
- `invitation.invited_by` hentes :924-933 og brukes kun til `befriend_inviter` (:1043-1047). Kolonnen er **NOT NULL** (`0001_initial_schema.sql:86`) — men er IKKE alltid en kaptein: lag-flyten setter kapteinens user-id (`teamActions.ts:480-486`), mens arrangør-/gjeste-invitasjoner setter arrangøren (`inviteToGameActions.ts:255`, `guestPlayerActions.ts:220`) — og login-rutingen (`login/actions.ts:303-305`) sender ALLE pending invitees på team-/both-spill til /team-siden.
- `unique (game_id, user_id)` på `game_registration_requests` (`0042:41`) → maks én kaptein-request per bruker per spill; invited_by-oppslaget trenger ingen order/limit.
- **Dagens harde blindvei:** `invitations` har INGEN unique på (email, game_id) — to pending invitasjoner for samme e-post+spill (arrangør + kaptein) får `team/page.tsx:100` sin `.maybeSingle()` til å feile (PGRST116) → `teamDashNoTeamBanner`-blindvei FØR noen heuristikk kjører.
- Insert-/game_players-logikken etter kaptein-valget (:980-993, :1005-1029) nøkler på valgt kaptein og følger fiksen uendret.
- UI: `team/page.tsx:121-140` (invited_unknown) sender kun `mode/shortId/invitationId/joinEffect`; select-en :96 henter kun `id, email` (typen :86) — `invited_by` må legges til begge. `TeamDashboardClient.tsx:135-163` rendrer kun neste-steg-tekst + knapp. Tekster i `signup`-namespacet (`teamDash*`, no.json:4530-4558 + en.json, nøkkelsett verifisert likt).
- `getCaptainDisplayName` (`teamActions.ts:149-165`, ueksportert; call sites :321, :776, :1120) — kan IKKE eksporteres fra en `'use server'`-modul uten å bli en action.
- Invite-mailen navngir allerede lag + kaptein (`lib/mail/teamInvitation.ts:54,68-69`) — ny UI-copy speiler den ordlyden.
- Test-realiteter: `buildSupabaseMock` (`tests/serverActionMocks.ts:65-175`) er en FIFO-kø som IGNORERER filtre — «riktig rad vinner i query» kan ikke bevises i mock. Men med en REN picker (design under) skjer valget i JS på hele rad-settet → insert-payload-assertion beviser reelt at invited_by vinner. Eneste eksisterende attach-test er `signup_closed` (:634-642); happy-path-fixtur bygges etter `submitTeamRegistration`-mønsteret. Ingen automatisk no/en-paritetsgate — manuell sjekk.

## Design

1. **Ren picker med ett hjem:** ny fil `app/[locale]/signup/[shortId]/team/captainLookup.ts` (vanlig modul, IKKE `'use server'`; ren — ingen supabase-import, samme mønster som `registrationTypeView.ts`/`teamFormValidation.ts`): `pickCaptainRequest(rows, invitedBy)` → `{ row, source: 'invited_by' | 'fallback' } | null`. `invitedBy`-treff (maks én pga. unique-constrainten) vinner; ellers nyeste rad (dagens heuristikk); tom liste → null.
2. **`attachToCaptainTeam`:** hent ALLE kaptein-requests for spillet (samme filtre, `order created_at desc`, uten `limit(1)`) og velg med `pickCaptainRequest(rows, invitation.invited_by)`. Null → `not_found` (som i dag). Resten uendret.
3. **`getCaptainDisplayName` flyttes** til helper-modulen (navne-fallback-regelen får ETT hjem) og re-importeres i `teamActions.ts` (:321, :776, :1120).
4. **UI-bekreftelse:** `team/page.tsx` legger `invited_by` til invitasjons-selecten (:86/:96), gjør samme kaptein-oppslag + `pickCaptainRequest`, og sender `teamName`/`captainName` som props KUN når `source === 'invited_by'` — et fallback-treff skal ALDRI navngi lag (å selvsikkert vise feil lag er verre enn dagens generiske tekst). `TeamDashboardClient` (invited_unknown) viser «Du er invitert til laget {teamName} av {captainName}» (speiler mail-ordlyden) når props finnes, ellers dagens tekst. Nye i18n-nøkler i `signup`-namespacet, begge locales, humanizer på norsk copy.
5. **Blindvei-vakt:** `team/page.tsx` sin invitasjons-select bytter `.maybeSingle()` mot `order created_at desc + limit(1)` slik at to pending invitasjoner for samme e-post+spill ikke lenger PGRST116-er til en blindvei (deterministisk: nyeste).

## Edge Cases & Guardrails

- `invited_by` er arrangør/ikke-kaptein (arrangør-invitasjon på team-spill) → `source: 'fallback'` → attach etter dagens heuristikk, UTEN lagnavn i UI (se Alternativer — dette er produktvalget).
- invited_by-kapteinens request er withdrawn/rejected → filtrert bort → fallback.
- Ingen kaptein-request i spillet → `not_found` (som i dag).
- To invitasjoner samme e-post+spill → nyeste velges (design 5) — ikke lenger blindvei.
- Ingen DB-/skjemaendring, ingen RLS-endring (ren SELECT-endring via admin-client; T3 sjekket).
- Attach-status-/game_players-logikken røres ikke.

## Key Decisions

- **Valget skjer i en ren funksjon, ikke i query-en** — testbart uten mock-akrobatikk (FIFO-mocken ignorerer filtre), og regelen får ett hjem brukt av både action og page (trap 4).
- **Navn vises kun ved sikkert treff** (`source === 'invited_by'`) — UI-et skal aldri love et lag heuristikken har gjettet.
- **Fallback-attach beholdes** (Alternativ A) — for spill med ETT lag (dominerende tilfelle) er dagens oppførsel korrekt og friksjonsfri; produktvalget er dokumentert under.
- **Helper i route-mappa** (`registrationTypeView.ts`-presedens: ren, kolokalisert, egen test).

## Success Criteria

1. [ ] Type A-tester (TDD) på `pickCaptainRequest`: invited_by-rad velges foran nyere rad; ikke-kaptein invited_by → fallback nyeste; tom liste → null. **Bevis:** vitest-output.
2. [ ] `attachToCaptainTeam`-test (FIFO-mønsteret): med to kaptein-rader i kø der invited_by-raden IKKE er nyest, asserter child-insert-payloadens `team_request_id` == invited_by-radens id. **Bevis:** vitest-output.
3. [ ] invited_unknown viser lagnavn + kaptein ved sikkert treff, generisk tekst ved fallback — eksisterende render-tester i `TeamDashboardClient.test.tsx` (:19, :34) REDIGERES (Type C: ingen ny svit).
4. [ ] `npm run typecheck && npm run lint` grønt + `npm test` (evt. `npm test -- 'app/[locale]/signup'` — anførselstegn er nødvendige) grønt. **Bevis:** kommando-output.
5. [ ] Staging-klikkrunde: mail-invitert medspiller i spill med to lag → /team viser riktig lagnavn → attach lander på riktig lag (bruker-synlig → merge-port; `needs-manual-qa` hvis flyten ikke lar seg rigge autonomt).

## Gates

- `npm run typecheck`
- `npm run lint`
- `npm test` (kanonisk; path-filtrert kjøring OK underveis)
- `npm run build`

## Files Likely Touched

- `app/[locale]/signup/[shortId]/team/captainLookup.ts` (ny) + `captainLookup.test.ts` (ny)
- `app/[locale]/signup/[shortId]/teamActions.ts` (+ `teamActions.test.ts`) — oppslag, picker-bruk, `getCaptainDisplayName`-flytt (3 call sites)
- `app/[locale]/signup/[shortId]/team/page.tsx` (select + props + limit-vakt)
- `app/[locale]/signup/[shortId]/team/TeamDashboardClient.tsx` (+ eksisterende test redigert)
- `messages/no.json`, `messages/en.json`
- `CHANGELOG.md`, `package.json` (patch-bump — fix)

## Out of Scope

- Slot-/kapasitetssjekk ved attach (dagens oppførsel består).
- Unique-constraint på invitations(email, game_id) — DB-endring, eget issue fra byggeøkten hvis ønsket.
- Velger-UI når flere lag reelt har invitert samme e-post (nyeste-invitasjon + fallback-attach dekker v1; merk at dette I DAG er en hard blindvei — design 5 gjør den i det minste deterministisk).
- #1344 (profilporten mister /team) og #1345 (login-feilstier) — egne kontrakter.
- Endringer i invitasjons-mailen.

## Alternativer (produktvalg)

Gjelder invitéer der `invited_by` IKKE peker på en kaptein (typisk: arrangøren inviterte dem til et lag-spill, ikke en lagkaptein). For disse kan ikke appen vite hvilket lag de hører til.

**Anbefaling:** Alternativ A — behold «bli med»-knappen med fallback til nyeste lag, men uten å navngi lag. I spill med ett lag (det vanlige) er det alltid riktig; i spill med flere lag er det samme oppførsel som i dag, nå ærlig merket ved at UI-et ikke lover noe lagnavn.

**Alternativ A — fallback-attach beholdes, uten lagnavn (anbefalt, bygges):**
- Fordeler: null ny friksjon for det vanligste tilfellet (ett lag i spillet — alltid riktig); ingen ny blindvei; minst endring.
- Ulemper: i spill med flere lag kan en arrangør-invitert fortsatt havne på «nyeste» lag; brukeren får ikke vite hvilket lag de blir med i før etterpå.

**Alternativ B — uten sikkert treff stoppes attach: «Vi fant ikke laget ditt — spør kapteinen om en laginvitasjon, eller registrer eget lag»:**
- Fordeler: ingen kan noensinne kobles stille til feil lag; tydelig beskjed om veien videre.
- Ulemper: bryter dagens fungerende flyt for spill med ett lag (unødvendig stopp for de fleste); mer copy og en ny tilstand å vedlikeholde.
- Ombyggingskostnad: liten — pickeren returnerer allerede `source`; B er å bytte fallback-grenen mot en melding.

**Reversibilitet:** god — valget ligger i én gren av én ren funksjon + én UI-tilstand; kan snus senere uten datatap.

Svar «alternativ B» i natt-PR-en hvis du vil at usikre invitéer skal stoppes i stedet for å kobles til nyeste lag. Ingen hast — PR-en venter til du svarer eller merger.
