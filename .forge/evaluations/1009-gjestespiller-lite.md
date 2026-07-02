# Evaluering: #1009 — Gjestespiller-lite

**VERDICT: ACCEPT**

Skeptisk gjennomgang av commitene `cfcb5096..e3792b94` mot kontrakten `.forge/contracts/1009-gjestespiller-lite.md`. Alle seks suksesskriterier er verifisert mot faktisk kode; alle lokalt kjørbare gates er grønne. Ingen blockers funnet. To observasjoner (ingen krever handling før merge) og ett bør-fikses-lignende funn som allerede er dekket av kontraktens aksepterte avvik.

---

## Gate-resultater (lokalt kjørt, Node 22)

| Gate | Resultat |
|------|----------|
| `npx tsc --noEmit` | **exit 0** — clean |
| `npx vitest run` (full suite) | **356 filer / 4502 tester passert**, exit 0 (~40s) |
| `npx eslint` (10 endrede guest-filer) | **0 errors**, 5 warnings — alle `complexity`, alle pre-eksisterende (funksjonene lå over terskelen før #1009; guest-tilleggene la til ~20 LOC hver) |
| `npm run build` | ikke kjørt (per instruks — allerede verifisert grønn i kontrakt) |
| Migrasjon staging→prod | ikke re-verifisert (jeg rørte ikke DB; kontrakt hevder md5-paritet + guard/metrics-prober) |
| Staging-klikkrunde | eierens manuelle runde (aksept-avvik, kontrakt-gate 3 fortsatt åpen — forventet) |

---

## Per-kriterium vurdering

### ✅ 1. Arrangør kan legge til gjest (navn + hcp) i veiviser + spillerliste

**Verifisert.**
- Veiviser: `GuestPlayerAdd.tsx:24-138` bruker `type="button"` + unavngitte kontrollerte felter (`GuestPlayerAdd.tsx:127-134`) — omgår nested-form/required-fella (wizard-en er ETT `<form>`, `GameWizard.tsx:517`). Kaller `createGuestForWizard` (`guestPlayerActions.ts:123`).
- Roster: `AddGuestForm.tsx:90-109` er et selvstendig `<form action={guestAction}>` med `required`-felter — trygt fordi det IKKE er nested. Brukt av admin (`InviteToGameClient.tsx:140`) og creator (`CreatorRosterClient`).
- Publish/edit ruter gjeste-rader via service-role: `actions.ts:245-276` (create), `edit/actions.ts:258-289` (edit). 0115-guarden urørt for klient-skriv (`grep is_invite_eligible 0127*` → 0 treff, bekreftet i pgTAP-kommentar).
- Parse/kompensasjon-tester: `createGuestPlayer.test.ts` (225 linjer). Skjema-test: `AddGuestForm.test.tsx`.

### ✅ 2. Gjest scores av markør, vises i leaderboard/podium/resultat i alle formatfamilier

**Verifisert strukturelt.** `grep -r is_guest lib/scoring/ lib/sync/` → 0 treff (bekreftet: motoren ser gjesten som vanlig user_id-rad). Skygge-bruker-designet gjør at hele eksisterende suite (22 modi) er beviset. Visuell stikkprøve er eierens manuelle staging-runde (aksept-avvik). Kunne ikke re-kjøre staging-probe (rører ikke DB) — stoler på kontraktens `OK: marker scored guest`-logg.

### ✅ 3. Gjest forurenser ikke klubbstatistikk, nøkkeltall eller mail-utsendelser

**Verifisert — dette er den mest sikkerhetskritiske delen, granskt nøye:**

- **`gameFinishedRecipients.ts`**: `playerRows` holdes UFILTRERT (`:107`) — mates inn i `computeLeaderboard` og partner-/motspiller-navn-oppslag, så standings og partner-copy i ALLES mail forblir korrekte. Gjestene filtreres via `withoutGuests()` (`:111-116`) rett før retur. **Jeg sjekket ALLE retur-punkter:** singles-matchplay (`:133`), solo-strokeplay (`:144`), scramble (`:155`), best-ball (`:162`), stableford solo (`:281`), team-stableford (`:344`) — alle wrappet i `withoutGuests`. De tre sub-helperne (`buildMatchplayRecipients`/`buildSoloStrokeplayRecipients`/`buildTexasScrambleRecipients`) returnerer direkte, men kalles ALLTID via `withoutGuests(await build...())`, så deres interne retur-punkter er dekket ved call-site. Ingen lekk.
- **`notify.ts:79-81`**: sentral gate — `is_guest` → `shouldAlsoSendMail: false` + hopper push. Dekker gameFinished, cup, påmelding, purring (alle shouldAlsoSendMail-konsumenter). Cup-mail dekkes her uten eget filter (aksept-avvik, korrekt).
- **`deliveryReminder.ts:114`**: auto-nudge returnerer tidlig for gjest.
- **`digest.ts:126`**: `.eq('is_guest', false)` på den ene blanket-alle-utsendelsen.
- **`statistikk/page.tsx` (`getClubStatsAggregate`)**: filtrerer gjester fra tally-input (`:152`) OG fra fallback-vinnere (`:201`, beholder `guestUserIds` for å rense en gjest som VANT runden). Korrekt — andres resultater upåvirket (fallback-motoren henter egne data).
- **`admin_key_metrics()` (0127)**: `per_user`-CTE joiner `users` + `where not u.is_guest` (`:105-106`); `fingerprints`-CTE bruker `finished_players` urørt → gjester BEHOLDES i gjeng-fingerprints (kontinuitet gjennom claim). pgTAP asserter delta: `users_ge1 -1`, `users_ge2 0`, `gjenger_ge2 0` (kollaps-kanari, `users_is_guest_test.sql:136-155`).

### ✅ 4. Claim: arrangør sender → gjest logger inn → historikk ligger på kontoen (samme uuid)

**Verifisert.**
- `claimGuestEmail` (`claimGuestResult.ts:40-124`): flipper BÅDE auth.users (GoTrue `updateUserById`) OG public.users.email (ingen sync-trigger mellom dem). Kompensasjon (`:107-121`): feiler public.users-oppdatering → reverterer auth-flippen. 10 Type A-tester (`claimGuestResult.test.ts`, 224 linjer).
- `is_guest` nulles i `verifyCode` (`login/actions.ts:231-244`): via service-role, gated `.eq('is_guest', true)` (no-op for vanlige innlogginger), best-effort try/catch → **kan ikke blokkere login** (verifisert: plassert etter session-set, wrappet, egen catch).
- Claim-mail: `guestClaimNotification.ts` + Type B-snapshot + rad i resend-kontrakten (`resend-contract.test.ts:208-221`).

### ✅ 5. Hostile-PATCH: is_guest kan ikke self-endres; invite-guard urørt

**Verifisert.** `0127`-guarden (`guard_users_self_update`, `:39-70`) legger `is_guest` i denylisten (`:62-66`, errcode `insufficient_privilege`). pgTAP (`users_is_guest_test.sql`, plan 9) dekker: self-set BLOKKERT (`:74`), self-clear BLOKKERT (begge retninger, `:94`), admin-flip PASS (`:110`), service-role PASS (`:117`). Fixture-helper `try_set_is_guest` definert (`rls_helpers.psql:410`). 0115 urørt.

### ✅ 6. Fremtids-flytdiagram oppdatert

**Verifisert.** `docs/flows/02-bli-med-i-spill-fremtid.svg` endret (+17 linjer); PNG regenerert (416KB→454KB). Kan ikke visuelt inspisere SVG-innhold her, men diff bekrefter endring.

---

## Sikkerhetsgranskning (de fire scenariene)

**(a) Kan vanlig innlogget bruker misbruke `createGuestForWizard`?** — Authz = enhver innlogget bruker (`guestPlayerActions.ts:127-130`), matcher wizard-ens egen #427-gate. En bruker KAN opprette en skygge-bruker, men kan IKKE feste den til et spill de ikke eier: publish/edit re-sjekker eierskap (`createGameInternal` created_by=userId + creator-RLS; `updateGameInternal` via `requireAdminOrCreator`). Verste utfall = forlatte skygge-brukere (aksept-avvik, beslutning 5). **Proporsjonalt, ikke en blocker.**

**(b) Kan `sendGuestResult` flippe e-posten til en IKKE-gjest eller gjest i annet spill?** — NEI. `claimGuestEmail` (`claimGuestResult.ts:50-71`) krever i parallell at målet (1) har `is_guest = true` OG (2) står på `game_players` for AKKURAT dette gameId. Begge må være sanne, ellers `guest_claim_not_guest`. `normalizeClaimEmail` avviser plassholder-domenet som mål (`:36`). Eksisterende-konto → `guest_email_taken` (`:86`). **Trygt.**

**(c) Omgår guest-row-splitten noen RLS-garanti for VANLIGE spillere?** — NEI. Kun `guestRows` (filtrert på `findGuestIds`, som slår opp `is_guest=true` via service-role) går via admin-client; `regularRows` beholder request-klienten (`actions.ts:272-276`, `edit/actions.ts:283-289`) — RLS-dekningen for vanlige spillere er 100% uendret. `findGuestIds` feiler defensivt til tomt sett (gjest-rad går klient-veien og feiler kontrollert i 0115-guarden i stedet for å omgå den, `createGuestPlayer.ts:113-126`). Rollback i edit går via service-role fordi snapshotet KAN inneholde gjeste-rader (`edit/actions.ts:301-311`).

**(d) Lekker gjeste-e-poster til klient-payloads (#435)?** — NEI. `getGameWithPlayers` selecter `is_guest` men IKKE `email` (`getGameWithPlayers.ts:162,187`). `getNewGameFormData` dropper `email`-kolonnen helt for ikke-admin-variant, beholder `is_guest` (`newGameFormData.ts:67-69,138-140`). Claim-UI gjør sitt eget målrettede e-post-oppslag via service-role bak `requireAdminOrCreator` (`spillere/page.tsx:143-158`). **#435-disiplinen holdt.**

---

## Korrekthets-granskning (e/f/g)

**(e) gameFinishedRecipients** — playerRows-innhold korrekt for ikke-gjester (standings/partner urørt), ALLE retur-punkter gjeste-filtrert. Se kriterium 3.

**(f) verifyCode-endringen kan ikke blokkere login** — best-effort try/catch, egen `getUser()`, `.eq('is_guest', true)` no-op-gate, plassert etter session-set og før invitasjons-reconciliation. Se kriterium 4.

**(g) Wizard-integrasjon** — full-form-byttet mister IKKE gjester: `extra_players` threades i passthrough (`GameWizard.tsx:411-412`), seedes i `useGameFormState` (`:292-294`), GameForm-ens egen hook re-seeder. Av-valgt gjest kan re-velges: `pickIds` inkluderer `state.extraPlayers` (`GameWizard.tsx:224-228`) — uten dette forsvant en av-valgt gjest fra lista. Gjeste-feltene blokkerer IKKE publish (wizard-variant: type=button, ingen name/required). `addGuestPlayer` idempotent på id (`useGameFormState.ts:944-952`).

---

## Funn

### Observasjoner (ingen handling påkrevd)

- **O1 — Delt pgTAP-fixture endret.** `rls_helpers.psql:184` byttet `seed_active_game` sitt `game_mode` fra `'strokeplay'` → `'solo_strokeplay'` fordi 0111-CHECK-constrainten avviser plain `'strokeplay'`. Dette er en SHARED fixture brukt av andre pgTAP-suiter. Endringen er en korrekthets-fiks (gyldig slug) og score-write-RLS-policyene leser ikke game_mode, så ingen atferdsendring. pgTAP kjøres ikke av vitest, så jeg kunne ikke re-verifisere sibling-suitene lokalt — men endringen er trygg per kommentaren og fixture-designet. Verdt en linje i closing-kommentaren.

- **O2 — Pre-eksisterende complexity-warnings vokste litt.** `verifyCode` (35), `buildGameFinishedRecipients` (40), `CreatorSpillerePage` (30) osv. lå alle over eslint-terskelen (25) FØR #1009; guest-tilleggene la til noen få grener hver. Ikke en regresjon #1009 innførte, men filene er nå enda tyngre. Ikke blokkerende (warnings, ikke errors).

### Aksepterte avvik (per kontrakt — bekreftet korrekt håndtert, ikke funn)

- Wizard-forlatte gjester består som slettbare skygge-brukere (beslutning 5) — bekreftet i `createGuestForWizard`-JSDoc.
- Cup-mail dekkes av `notify()`-gaten uten eget query-filter — bekreftet i `notify.ts:76-81`.
- Visuell staging-klikkrunde = eierens manuelle runde (gate 3 fortsatt åpen) — forventet.

---

## Oppsummering

**VERDICT: ACCEPT**

Kontrakten er innfridd på alle seks kriterier med verifisert kode-evidens. Skygge-bruker-designet holder scoring-/leaderboard-/RLS-maskineriet urørt; eksklusjonene er sentralisert (notify-gate) med korrekte tillegg i stats/mail/digest; claim-flyten er atomisk-eller-kompensert; hostile-PATCH-guarden er pgTAP-dekket i begge retninger. Sikkerhetsscenariene (a-d) og korrekthetsscenariene (e-g) er alle rene. Gates grønne (tsc/vitest/eslint).

**Funn-liste:**
- O1 (observasjon): Delt pgTAP-fixture `seed_active_game` byttet game_mode strokeplay→solo_strokeplay (korrekthets-fiks, trygt, nevn i closing-kommentar).
- O2 (observasjon): Pre-eksisterende eslint complexity-warnings vokste marginalt (ikke en #1009-regresjon, ikke blokkerende).
- Ingen blockers. Ingen bør-fikses som ikke allerede er dekket av kontraktens aksepterte avvik.
