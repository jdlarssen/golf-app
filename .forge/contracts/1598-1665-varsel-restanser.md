# Spec: Varsel-restanser — rolle-riktige fallbacks + innboks 0-rads/banner-rollback

**Issues:** #1598 · #1665 · **Branch:** claude/varsel-restanser-1598-1665

To avgrensede funn i varsel-laget. Ingen produktvalg. Én commit per issue (`fix`, `Refs #N`,
`.changes/`-notat). PR-body `Closes #N` per issue. Staging-verifisering: #1665 (banner-
rollback) og #1598 (arrangør-godkjenning uten navn → «Arrangøren godkjente …»).

## #1598 — rolle-riktige fallbacks for godkjenner/gjenåpner (fix)
1. `lib/notifications/types.ts` `scorecardApprovedSchema` (:68): legg til
   `approver_role: z.enum(['peer', 'organizer']).nullable().optional()`. Historiske payloads
   uten feltet → dagens nøytrale fallback (bakoverkompatibelt).
2. Produsenter (grep `kind: 'scorecard_approved'`):
   - `app/[locale]/games/[id]/approve/actions.ts:164` (peer): `approver_role: 'peer'`.
   - `app/[locale]/admin/games/[id]/actions.ts:268` (arrangør/admin): `approver_role: 'organizer'`
     og `approver_name: name?.trim() || null` (les hva `name` fra `loadAdminContext` faktisk er —
     rå profilnavn eller med fallback; send ALDRI 'Admin'/'En arrangør'-literaler i payload).
   - `app/[locale]/games/[id]/(home)/page.tsx:344`: les konteksten (auto-godkjenning?) og sett
     rollen som passer (trolig 'organizer' eller utelat hvis det er system — dokumentér).
3. `lib/notifications/cardContent.ts:57`: `approverName: p.approver_name ?? (p.approver_role === 'organizer' ? t('organizerFallback') : t('somePlayerFallback'))`.
   Sjekk at `organizerFallback` finnes i BEGGE locales (no «Arrangøren», en "The organizer").
4. `reopenScorecard` (`admin/games/[id]/actions.ts` ca. :421): `actor_name: actorName` sender
   audit-strengen med 'Admin'-fallback → bytt til rå navn `name?.trim() || null` så
   cardContent-en (`:80`, `organizerFallback`) gjør lokalisert fallback. `logAdminEvent`-strengen
   (`actorName`) røres IKKE.
5. Tester: `lib/notifications/cardContent.test.ts` — én case «approver_role organizer uten navn →
   Arrangøren-fallback» (+ evt. én for peer uten navn); `admin/games/[id]/actions.test.ts`
   (`reopenScorecard (#1363)` og admin-approve-cases) — oppdater forventet payload
   (`actor_name` null når navn mangler, `approver_role: 'organizer'`); `approve/actions.test.ts`
   — `approver_role: 'peer'`.
6. Utenfor scope (nevn i closing): literaler i `foreslaa-ide/actions.ts`, `inviteToGameActions.ts`,
   `guestPlayerActions.ts` (#1364-notatet).
`.changes/1598-arrangoer-fallback.md` (fix): «Godkjenner eller gjenåpner arrangøren et scorekort
uten å ha navn i profilen, står det nå «Arrangøren» i varselet — ikke «En spiller» eller «Admin».»

## #1665 — innboks: ProductUpdateBanner-rollback + 0-rads-bevissthet i helperne (fix)
1. `lib/notifications/markRead.ts` + `archive.ts`: chain `.select('id')` og returnér `false`
   også når `affected.length === 0` **for enkelt-id-kall** (`notificationId` satt — da SKAL
   én rad treffes; 0 = RLS/feil id). For bulk-kall (`markAllAsRead`/`clearRead`, ingen id) er 0
   rader legitimt → fortsatt `true`. Dokumentér skillet i doc-kommentaren.
2. `components/products/ProductUpdateBannerClient.tsx:36`: `void markOneAsRead(...)` → samme
   rollback-mønster som InboxClient/MonthlyDigestToggle (#1394): optimistisk skjul, `await`,
   ved `!ok` vis banneret igjen + diskret feillinje (`inbox.actionFailed`-nøkkelen finnes; testid
   `product-banner-action-error` — IKKE gjenbruk `inbox-action-error`, jf. F5 i #1664-evalueringen).
3. Tester: eksisterende tester for markRead/archive (finn `lib/notifications/*.test.ts`) —
   én case «enkelt-id med 0 rader → false», én «bulk med 0 rader → true»; ProductUpdateBanner-
   test hvis den finnes (én `it` for rollback), ellers ingen ny fil.
`.changes/1665-produktnytt-banner.md` (fix): «Lukker du produktnytt-banneret og lagringen
feiler, kommer banneret tilbake med beskjed — i stedet for å dukke opp igjen uten forklaring.»

## Success Criteria
- [x] #1598: payload-skjema har `approver_role`; alle tre produsenter setter det riktig; cardContent velger «Arrangøren» for organizer uten navn; reopen sender rå navn; tester grønne. — Evidens: staging 1a/1b («Arrangøren godkjente/åpnet …», payload approver_role organizer + name null, actor_name null); zod-bakoverkompat probet; mutasjon på cardContent-ternary → rød; commit 8804bfb8. Avvik: (home)/page.tsx:344 er konsument, ikke produsent → to produsenter.
- [x] #1665: `markNotificationsRead({userId, notificationId})` med 0 rader → `false`; bulk 0 → `true`; banner ruller tilbake + feillinje ved `!ok`. — Evidens: staging 2a/2b/2c (abort → rollback + product-banner-action-error; 0 rader → ok:false + rollback; ekte → read_at satt); ny archive.test.ts; mutasjoner → rød; commit 85cc9edb.
- [x] `.changes/`-notater parser; `npm run build`, `npm run lint`, co-located vitest grønt. — Evidens: dry-run OK; BUILD_EXIT=0; LINT 0 errors; 27 filer/275 tester.

## Gates
- [x] `npx vitest run lib/notifications "app/[locale]/admin/games/[id]" "app/[locale]/games/[id]/approve" "app/[locale]/games/[id]/(home)" components/products "app/[locale]/innboks"` — Evidens: se evalueringsrapport (ACCEPT).
- [x] `npm run build` · `npm run lint` — Evidens: se evalueringsrapport (ACCEPT).
- [x] Staging: (a) admin uten profilnavn (rigg: sett `users.name` null på E2E-admin midlertidig, restaurer) godkjenner et innlevert kort → spillerens innboks-kort sier «Arrangøren godkjente …»; (b) produktnytt-banner: blokker action-POST → banneret tilbake + feillinje. — Evidens: se evalueringsrapport (ACCEPT).

## Out of Scope
- Øvrige 'Admin'/'En arrangør'-literaler utenfor de to payloadene; InboxClient (gjort i #1394).
