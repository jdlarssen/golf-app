# Runde-historikk — #1133 (innboks: kollaps rydde-knapp + fjern TopBar-bjelle)

Kontrakt: `.forge/contracts/1133-innboks-kollaps-rydde-knapp-fjern-topbar-bjelle.md`
Branch: `claude/natt-1133-innboks-kollaps-rydde-knapp`

## Runde 1 — implementer + gates + selv-evaluering (ACCEPT)

**Bygget (mot kontrakten):**
- `InboxClient.tsx`: to samsynlige piller → én tilstands-adaptiv knapp
  (uleste → «Marker alle som lest»; ellers → «Tøm leste»). Begge handlers +
  server-actions urørt.
- `TopBar.tsx`: fjernet `NotificationBell`-import, `userId`-prop, `hasBell`,
  bjelle-blokk + JSDoc-avsnitt.
- Slettet `components/notifications/NotificationBell.tsx` + `.test.tsx`.
- Fjernet `userId`-attributt fra alle 7 call-sites (foreslaa-ide, liga/[id],
  liga-runde-spill, games/[id]/{rediger,spillere,avslutt,slett}). På avslutt/
  rediger/slett var `role.userId` eneste bruk av `role` → `const role = await
  requireAdminOrCreator(...)` endret til `await requireAdminOrCreator(...)`
  (authz-redirect-side­effekt bevart, ubrukt binding droppet). `currentUserId`
  (liga, spill) og `user` (foreslaa-ide) forblir brukt ellers — urørt.
- Fjernet foreldreløse i18n-nøkler `bellAriaLabel`/`bellUnreadAria` fra no+en.
- Tester: slettet NotificationBell.test, fjernet 3 bjelle-tester + hook-mock i
  TopBar.test, endret «Tøm leste»-fixturen i InboxClient.test til kun-lest.
- feat/minor bump 1.188.0 → 1.189.0 + CHANGELOG Funksjon-rad.

**Gates:**
- `npm run build` → grønt.
- `npm run typecheck` → grønt.
- `npm run lint` → 0 errors, 55 warnings (identisk med main-baseline, null nye).
- `npx vitest run InboxClient.test TopBar.test catalogParity.test` → 17 passed.
- Full `npm test` → 380 filer / 4763 tester grønt (−1 fil/−10 tester =
  slettet NotificationBell.test (7) + 3 TopBar-bjelle-tester; forventet).

**Selv-evaluering (skeptisk):** Alle Success Criteria oppfylt. Én rydde-knapp
om gangen, korrekt morfing; NotificationBell borte overalt; TopBar uten
userId-prop; catalog-parity holder; BottomNav-prikken urørt; ingen død kode
(lint grønn). Ingen server-/RLS-endring. → ACCEPT, videre til steg 4.5.

**Staging-verify:** inbox-flyten er IKKE dekket av e2e `@gate`-specene →
`needs-manual-qa` settes på PR-en (stagingbevis-porten #1076, interaktiv økt).

## Runde 2 — kryss-modell-gate (Sonnet): CONFIRM

Uavhengig Sonnet-gjennomsyn (annen modell enn Opus-bygget), fersk kontekst.
Ingen substansiell defekt. Verifiserte selv: adaptiv knapp prioriterer uleste
(both-read-and-unread edge case dekket); alle 7 TopBar-call-sites oppdatert;
`role`-bindingen droppet kun på de 3 sidene der `role.userId` var eneste bruk,
beholdt på spillere (linje 177 bruker den fortsatt); catalog-parity grønn med
nøyaktig to fjernede nøkler; BottomNav uendret (`bottomnav-innboks-dot` intakt);
tsc rent; de to lint-warningsene (spillere/liga complexity) pre-eksisterer
identisk på main. → CONFIRM, lever som review-klar (steg 5).
