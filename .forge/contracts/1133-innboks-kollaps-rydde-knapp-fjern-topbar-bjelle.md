# Spec: Innboks — kollaps rydde-knappene til én + fjern duplikat-bjella i TopBar

**Issue:** #1133 · **Branch:** claude/1133-innboks-kollaps-rydde-knapp-fjern-topbar-bjelle

## Problem
To små subtraksjoner på innboks-flata (spillerens daglige flate):

1. `app/[locale]/innboks/InboxClient.tsx:126-152` rendrer to alltid-samsynlige piller — «Tøm leste» (`clearRead`, gated på `hasRead`) og «Marker alle som lest» (`markAllAsRead`, gated på `hasUnread`). Når begge finnes samtidig står de side om side og tvinger en to-tap-rydding i «riktig rekkefølge». Det er knapperot på en flate som ellers er ren.

2. `components/ui/TopBar.tsx:56,74-78` rendrer en `NotificationBell` når `userId` er satt. Bjella er ren duplikat: bunn-nav-fanen Innboks (`components/ui/BottomNav.tsx:80`, globalt montert via `BottomNavGate` i `app/[locale]/layout.tsx`) viser allerede samme champagne-prikk via samme `useUnreadNotificationsCount`-hook — BottomNav-kommentaren (`BottomNav.tsx:38`) sier eksplisitt at fanen «overtar rollen til den gamle NotificationBell». Verifisert: begge kaller `useUnreadNotificationsCount`, som via `subscribeRealtimeChannel` (`lib/sync/realtimeChannel.ts:54`) minter en unik topic-suffix per montering — så hver TopBar-bjelle åpner en egen live-kanal oppå den BottomNav allerede holder. Å fjerne bjella fjerner altså én dobbel realtime-sub per skjerm.

Etter fjerning er `userId`-propen på TopBar død (bjella er dens eneste bruk), så den skal fjernes i sin helhet sammen med de 7 call-sitene som sender den (T2 change-propagation).

## Design

### Del 1 — kollaps rydde-knappene (InboxClient)
1. I `app/[locale]/innboks/InboxClient.tsx:126-152`: erstatt de to samsynlige pillene med **én tilstands-adaptiv knapp** (se Key Decisions for semantikk):
   - `hasUnread` → knappen viser `t('markAllAsRead')` og kaller `handleMarkAll` (pending: `markAllPending`/`t('markingPending')`).
   - `!hasUnread && hasRead` → knappen viser `t('clearRead')` og kaller `handleClearRead` (pending: `clearReadPending`/`t('clearingPending')`).
   - ellers (tom liste) → ingen knapp (allerede dekket av `items.length === 0`-tom-tilstanden på linje 109).
2. Behold begge server-actions (`markAllAsRead`, `clearRead`) og begge handlerne (`handleMarkAll` linje 82, `handleClearRead` linje 101) uendret — kun render-laget kollapser. Behold per-kort ✕-arkivering (`handleArchive`).
3. Behold pill-stylingen (`min-h-0 rounded-full border ... text-[11px]`) og `flex justify-end`-containeren; nå med kun ett `<Button>`-barn.
4. Behold alle fire i18n-nøklene (`markAllAsRead`, `markingPending`, `clearRead`, `clearingPending`) i `messages/no.json:53-56` og `messages/en.json` — begge er fortsatt i bruk.

### Del 2 — fjern bjella fra TopBar
5. I `components/ui/TopBar.tsx`: fjern import (`:4`), `userId`-propen fra type-signaturen (`:47,54`), `hasBell`-utledningen (`:56`) og hele bjelle-`<div>`-blokken (`:74-78`). Oppdater JSDoc-avsnittet om `userId`/bjella (`:33-39`) — fjern det.
6. Slett komponenten `components/notifications/NotificationBell.tsx` (etter fjerning er TopBar eneste importør — verifisert via grep; øvrige treff er kommentarer/tester).
7. Fjern `userId`-argumentet fra alle 7 TopBar-call-sitene (T2 — komplett liste, verifisert via `grep -rn "<TopBar" | userId`):
   - `app/[locale]/liga/[id]/page.tsx:174`
   - `app/[locale]/liga/[id]/runde/[roundId]/spill/page.tsx:80-86` (multi-linje, `userId={currentUserId}` på egen linje)
   - `app/[locale]/foreslaa-ide/page.tsx:44`
   - `app/[locale]/games/[id]/rediger/page.tsx:98`
   - `app/[locale]/games/[id]/spillere/page.tsx:226`
   - `app/[locale]/games/[id]/avslutt/page.tsx:256`
   - `app/[locale]/games/[id]/slett/page.tsx:112`
   Fjern kun `userId`-attributtet; ikke rør `currentUserId`/`role.userId`-variablene ellers på siden (de brukes typisk til annet — la byggeren sjekke om variabelen blir helt ubrukt og først da rydde importen/utledningen). Ikke rør `<TopBar>` uten `userId` (alle andre call-sites).
8. Fjern de nå-foreldreløse i18n-nøklene `bellAriaLabel` og `bellUnreadAria` fra BÅDE `messages/no.json:46-47` og `messages/en.json:46-47` (catalog-parity krever identiske leaf-nøkler — `messages/catalogParity.test.ts` feiler ellers). Verifisert: eneste konsumenter var `NotificationBell.tsx:27-28`.

### Del 3 — tester
9. `components/notifications/NotificationBell.test.tsx` — slett (komponenten er borte).
10. `components/ui/TopBar.test.tsx` — fjern de tre bjelle-relaterte testene (`:22-25`, `:27-32`, `:34-44`) og den nå-unødvendige `vi.mock('@/hooks/useUnreadNotificationsCount', …)` (`:5-9`). Behold back-link- og kicker-testene.
11. `app/[locale]/innboks/InboxClient.test.tsx` — juster testene som brytes av tilstands-adaptiv knapp:
    - «viser «Tøm leste» og arkiverer alle leste, beholder uleste» (`:246-258`): fixturen er i dag `[read, unread]`, men under den nye semantikken viser knappen «Marker alle som lest» (uleste har prioritet), ikke «Tøm leste». Endre fixturen til kun leste rader (f.eks. `[makeInvite('a', true), makeInvite('b', true)]`) så «Tøm leste»-knappen faktisk rendres, og assert at `clearReadMock` kalles.
    - De øvrige knapp-testene (`:106-118`, `:147-152`, `:260-265`) passerer uendret under semantikken, men verifiser dem etter endringen (I8: kjør suiten).
    Ikke legg til nye Type C-tester utover det som trengs for å dekke den endrede oppførselen (test-disiplin: maks nødvendig, ingen «mens jeg var her»-tester).

### Del 4 — bruker-synlig utrulling
12. Dette er en bruker-synlig endring (knapp kollapser, bjella forsvinner fra toppbaren). Version-bump + CHANGELOG-linje (se Key Decisions for feat/fix-valg). Commits med `Refs #1133` i body; PR med `Closes #1133` i body.
13. Staging-verify (`staging-verify`-skill) FØR merge: last `/innboks` innlogget, bekreft (a) kun én rydde-knapp vises, morfer korrekt mellom mark-all og tøm-leste, (b) ingen bjelle i TopBar på f.eks. `/games/[id]/spillere` eller `/liga/[id]`, (c) BottomNav-prikken oppfører seg som før.

## Edge Cases & Guardrails
- **Både uleste og leste finnes samtidig:** knappen viser «Marker alle som lest» (uleste prioriteres). Bulk «Tøm leste» blir tilgjengelig etter at alt er markert lest; enkelt-leste kort kan uansett arkiveres via per-kort ✕. Ingen funksjonalitet tapt, kun rekkefølge-tvangen fjernet.
- **Ingen server-endring:** begge actions (`markAllAsRead`, `clearRead`) og deres RLS/soft-archive-oppførsel er uendret — ingen T3-migrasjon, ingen 0-rad-skriv-risiko introdusert.
- **`userId`-variabler på call-sitene:** noen sider utleder `currentUserId`/`role.userId` kun for TopBar-bjella, andre bruker den til flere ting. Fjern attributtet; rydd variabel/import kun der den blir beviselig ubrukt (unngå ny lint-feil `no-unused-vars`). `npm run lint` er porten.

## Key Decisions
- **Én tilstands-adaptiv knapp, ikke en ny «Tøm innboks»-samle-action.** Den adaptive knappen (mark-all når uleste finnes, ellers tøm-leste) løser issuets kjerneplage — knapperot + rekkefølge-tvang — uten server-endring og uten å arkivere uleste varsler (som ville skjult ting brukeren ikke har sett). En ekte ett-tap «tøm alt inkl. uleste» ville krevd ny bulk-arkiver-alle-modus i `archiveNotifications` som også nullstiller `read_at` for uleste rader (for å ikke etterlate hengende bunn-nav-prikk) — det er en større, høyere-risiko endring enn issuet beskriver («risiko: lav»). Hvis eier heller vil ha ett-tap-tøm, er det et oppfølgings-issue, ikke dette.
- **Fjern `userId`-propen helt fra TopBar** (ikke bare la den stå ubrukt) — bjella er dens eneste bruk, og en død prop på 7 call-sites er nettopp den slags drift issuet rydder.
- **Slett `NotificationBell.tsx` + test + foreldreløse i18n-nøkler** framfor å la dem ligge — subtraksjonen er hele poenget.

**Claude's Discretion:** Eksakt JSX-struktur for den kollapsede knappen (én `<Button>` med betinget `label`/`onClick`/`pending`, eller to betingede `<Button>`-grener i containeren — begge er greit så lenge kun én knapp rendres om gangen). Om `currentUserId`/`role.userId`-utledninger ryddes på call-sitene der de blir ubrukte. feat vs fix-prefiks (se under). Nøyaktig CHANGELOG-formulering (følg `docs/changelog-conventions.md`).

## Success Criteria
- [ ] `/innboks` viser aldri mer enn én rydde-knapp om gangen; den viser «Marker alle som lest» når det finnes uleste, ellers «Tøm leste».
- [ ] «Marker alle som lest» kaller `markAllAsRead`; «Tøm leste» kaller `clearRead` — begge med uendret optimistisk oppdatering.
- [ ] `NotificationBell` rendres ikke lenger noe sted; komponentfila er slettet.
- [ ] `TopBar` har ingen `userId`-prop; alle 7 tidligere call-sites er oppdatert.
- [ ] `messages/no.json` og `messages/en.json` har identiske leaf-nøkler (parity), uten `bellAriaLabel`/`bellUnreadAria`.
- [ ] BottomNav-innboks-prikken (`data-testid="bottomnav-innboks-dot"`) fungerer som før.
- [ ] Ingen død kode / ubrukte importer igjen (lint grønn).

## Gates
- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npx vitest run app/[locale]/innboks/InboxClient.test.tsx components/ui/TopBar.test.tsx messages/catalogParity.test.ts`
- [ ] staging-verify (bruker-synlig) — se Design del 4, punkt 13

## Files Likely Touched
- `app/[locale]/innboks/InboxClient.tsx` — kollaps to piller til én adaptiv knapp
- `app/[locale]/innboks/InboxClient.test.tsx` — juster «Tøm leste»-fixturen
- `components/ui/TopBar.tsx` — fjern bjelle-import, `userId`-prop, bjelle-blokk, JSDoc
- `components/ui/TopBar.test.tsx` — fjern bjelle-tester + hook-mock
- `components/notifications/NotificationBell.tsx` — slett
- `components/notifications/NotificationBell.test.tsx` — slett
- `app/[locale]/liga/[id]/page.tsx` · `app/[locale]/liga/[id]/runde/[roundId]/spill/page.tsx` · `app/[locale]/foreslaa-ide/page.tsx` · `app/[locale]/games/[id]/rediger/page.tsx` · `app/[locale]/games/[id]/spillere/page.tsx` · `app/[locale]/games/[id]/avslutt/page.tsx` · `app/[locale]/games/[id]/slett/page.tsx` — fjern `userId`-attributt fra TopBar
- `messages/no.json` · `messages/en.json` — fjern `bellAriaLabel`/`bellUnreadAria`
- `package.json` (+ `package-lock.json`) · `CHANGELOG.md` — version-bump + Funksjoner-linje
- `docs/copy-style.md`-hensyn: ingen ny norsk copy introduseres (gjenbruker eksisterende nøkler), så humanizer-kjøring er ikke påkrevd.

## Out of Scope
- Ny «Tøm innboks»-samle-action som arkiverer uleste varsler i ett tap (mulig oppfølging; krever server-endring i `archiveNotifications`).
- Endringer i `useUnreadNotificationsCount`, `lib/sync/realtimeChannel.ts` eller BottomNav — realtime-sub-gevinsten faller ut som bieffekt av å fjerne bjella, ingen kode der skal røres.
- Endringer i server-actions (`markAllAsRead`, `clearRead`, `archiveNotifications`, `markNotificationsRead`) eller RLS.
- Redesign av innboks-kortene, dag-gruppering eller månedsbrev-toggle.
