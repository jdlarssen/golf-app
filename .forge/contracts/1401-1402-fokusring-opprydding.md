# Spec: Fokusring-opprydding — inset-variant på klippede wrappere (#1402) + fjern døde fokus-utilities (#1401)

**Issues:** #1402 · #1401 · **Branch:** claude/fokusring-1401-1402

Oppfølging av #1386 (global fokusring). Kartlegging for #1402 ligger som kommentar på issuet
(2026-08-16): 13 wrappere klipper ringen; 7 av dem bærer alt døde `focus:outline-none
focus-visible:ring-2 focus-visible:ring-accent/40`-utilities (#1401 sitt tema). Ingen
produktvalg — ren a11y-/opprydding. To commits (`fix` for #1402 med notat, `refactor` for
#1401 uten), `Refs #N`; PR-body `Closes #N` begge. Staging-verifisering: Tab-runde.

## #1402 — `data-focus-inset` på de 13 klippede wrapperne (fix)
1. Legg `data-focus-inset` på wrapper-elementet i hvert av de 13 punktene i tabellen på
   issuet (SettingRow.tsx:132 SettingList · ActionItemsStripe:53 · ActivityLedger:169 ·
   GettingStartedChecklist:82 · CoursesLedgerClient:311 · PlayersListClient:106 ·
   admin/games/page.tsx:242 · GenerateMatchesWizard:286 · FormatGrid:70 ·
   TeamRegistrationForm:388 (`<ul>`) · profile/historikk/page.tsx:473 ·
   FinishedRoundsSection:69 · NotificationCard.tsx:110 `rootClassName` — linjenumre er
   omtrentlige, grep `overflow-hidden` i hver fil og finn wrapperen som er forelder til
   det fokuserbare elementet). Referansemønster: `components/LocaleSwitcher.tsx:47–48`.
2. `app/globals.css:424`: utvid `:where([data-focus-inset]) :where(a[href], button)` til samme
   elementliste som hovedregelen (:404–416) så `input`/`summary`/`[role=tab]`/`[tabindex]` i
   en merket wrapper også får inset. Oppdater kommentaren over.
3. Test: hvis en komponent har render-test som asserter attributter, én assert på
   `data-focus-inset` er OK (SettingRow/NotificationCard); ellers ingen ny test — dette er
   CSS-styring, staging-Tab-runden er oraklet.
`.changes/1402-fokusring-klipp.md` (fix): «Tastaturfokus er nå synlig også i lister og kort
som før klippet bort ringen (profil, klubbhus, varsler, rundehistorikk).»

## #1401 — fjern døde `focus:outline-none` + `ring-accent/40`-utilities (refactor)
1. Grep `focus:outline-none` (~111 treff/60 filer) og `ring-accent/40` (~81 treff) i `app/` +
   `components/`. Den globale `:focus-visible`-regelen vinner uansett; utilitiene er dødt
   ordforråd som ser ut som lokal fokus-styring, og gullringen tegnes som et blekt bånd
   innenfor outlinen.
2. Fjern `focus:outline-none`, `focus-visible:outline-none`, `focus-visible:ring-2`,
   `focus-visible:ring-accent/40`, `focus:ring-*accent/40*`, `focus-visible:ring-offset-*` (og
   tilhørende `ring-offset-bg`) fra className-strenger — men BEHOLD ring-klasser som gjør noe
   annet enn fokus (f.eks. `ring-1 ring-border` som visuell kant uten `focus`-prefiks) og
   behold alt inne i `app/globals.css`. Vær særlig forsiktig i template-literals og
   `clsx`/`cn`-kall — fjern kun tokens, ikke bryt strengen. Der en komponent bevisst har egen
   fokus-stil av annen grunn (kommentar sier det), la stå og nevn i commit-body.
3. Kjør `npx tsc`, `npx eslint`, hele `npx vitest run` (mange render-tester asserter
   className-snapshots — oppdater snapshots KUN der endringen er de fjernede tokenene;
   `npx vitest -u` er OK etter visuell diff-sjekk av at kun fokus-tokens forsvant).
4. Ingen `.changes`-notat (refactor); `[no-changelog]` unødvendig for `refactor:`-prefiks.

## Success Criteria
- [x] #1402: alle 13 wrappere har `data-focus-inset`; globals.css-selektoren dekker hele elementlista; staging: Tab gjennom `/profile`, `/admin` (ActionItems + Activity + checklist), `/innboks`, `/profile/historikk` viser synlig ring på hver rad, lys + mørk.
- [x] #1401: `grep -rn "focus:outline-none\|ring-accent/40" app components` = 0 (eller kun bevisst beholdte, listet i commit-body); ingen visuell regresjon på staging-Tab-runden.
- [x] `.changes/1402-*.md` parser; `npm run build`, `npm run lint`, full `npx vitest run` grønt.

## Gates
- [x] `npx vitest run` (hele suiten — className-endringer sprer seg)
- [x] `npm run build` · `npm run lint`
- [x] Staging Tab-runde m/ Playwright: `document.activeElement` per Tab-steg + `getComputedStyle(el).outlineOffset` = `-2px` inne i merkede wrappere, `2px` ellers; skjermbilder lys/mørk.

## Out of Scope
- (C)-tilfellene (`SectionCard`, `Card p-0`) — dokumentert i kartleggingen; #1388/#1390 (kontrast, mikrotypografi).


## Evidens (runde 1, ACCEPT)
- 13 wrappere m/ `data-focus-inset` (grep), globals.css inset-selektor = hovedregelens 11 elementer; 111 tokens fjernet 1:1 i 59 filer; full vitest 485/6307 grønn, tsc 0, lint 0 errors, build 0. Staging Tab-runde (Playwright): 9 sider, alle fokuserte elementer m/ outline 2px, `-2px` inne i merkede wrappere ellers `2px`, lys+mørk, klipp målt umulig (ring 3 px innenfor klippekant). Funn: FormatGrid ring usynlig mot inset primary-shadow → #1673; tre blanke array-entries (F2) fikset i herding. Commits 208e96a8 + 7da69aef.
