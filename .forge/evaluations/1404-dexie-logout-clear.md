# Evaluering: #1404 — Dexie tømmes trygt ved utlogging

**Dato:** 2026-08-14
**Branch:** `claude/1404-dexie-logout-clear` (PR #1641, draft per #1516-flyten)
**Evaluator:** fresh-context forge-evaluator

## Per kriterium

### S1 — Type A-tester for kjernen: PASS

`lib/sync/localDataCleanup.test.ts` — 11 tester, alle grønne (kjørt isolert:
`Tests 11 passed (11)`). Dekning mot kontrakten:

- `detectOwnerChange`: first/same/switched via `it.each` — alle tre.
- `ensureLocalDataOwner`: no_session rører ingenting (clear + stamp assertert
  ikke-kalt); first stempler uten tømming; same no-op; switched tømmer FØR
  stempling — verifisert med ekte ordre-array (`['clear', 'stamp']`), ikke
  bare kall-tellinger.
- `prepareLogout`: tom kø → cleared + `clearStoredOwner` kalt; kø > 0 → kept
  + stempel består; drain-throw + kø > 0 → kept; drain-throw + tom kø →
  cleared (én test utover kontrakten, i riktig retning).

Ikke tautologisk: testene importerer de reelle funksjonene og asserterer
returverdier, interaksjoner og rekkefølge på injiserte mocks. Fjernes
pending-sjekken i `prepareLogout` blir «queue still holding»-testen rød;
snus clear/stamp-rekkefølgen blir ordre-testen rød. Uten modulen feiler
importen. D4-substansen holder: beslutningsfunksjonene er dep-injiserte og
kjører uten indexedDB-shim (bevist av grønn kjøring). Bokstav-avvik: modulen
har `import { localDb } from './db'` på toppnivå, så modulen selv er ikke
Dexie-fri — kun funksjonene. Harmløst (Dexie-konstruktøren åpner ikke DB-en,
og alle konsumenter laster modulen lazy), notert som presisjon, ikke funn.

### S2 — SyncBoot-vakt + LogoutForm: PASS

- `components/sync/SyncBoot.tsx`: `await cleanup.ensureLocalDataOwnerBrowser()`
  fullfører før `import('@/lib/sync/syncWorker')` → `startSyncListener()` —
  sekvensiell await i samme async IIFE, vakta kan ikke løpe forbi motoren.
- `components/auth/LogoutForm.tsx` erstatter profil-formen:
  `app/[locale]/profile/page.tsx` bruker `<LogoutForm label={t('logoutButton')}
  pendingLabel={t('logoutPending')} />` — samme i18n-nøkler, samme
  `action="/logout" method="post"`. `formRef.current?.submit()` er nativ
  submit som per HTML-spec IKKE re-fyrer onSubmit — ingen loop. Catch rundt
  oppryddingen faller gjennom til submit, så utlogging blokkeres aldri; med
  JS av POSTer formen nativt (onSubmit kjører aldri). `Button` sprer
  `{...props}` så `type="submit"` når den native knappen, og `pending`-visning
  matcher gamle SubmitButton-oppførselen.
- **D2:** hele diffen inneholder kun tabell-`.clear()` (i én rw-transaksjon
  over scores/syncQueue/conflicts); ingen `db.delete()`, ingen rename.
- **D5:** eneste nye Dexie-berøringer er `lib/sync/localDataCleanup.ts`
  (i sync-laget) lastet lazy fra SyncBoot (montert KUN i
  `app/[locale]/games/[id]/layout.tsx` — verifisert med grep) og fra
  LogoutForm (profil — sanksjonert i kontrakten). /demo og /embed uberørt.
- **4s-racet:** timeout → 'kept' er alltid trygt; bakgrunns-run som fullfører
  etterpå lander også trygt i alle interleavings (atomisk transaksjons-clear;
  «cleared uten stempel-fjerning» → neste boot no-op/re-clear; «cleared mens
  fortsatt innlogget» skjer kun med tom kø = alt på serveren, lokale tabeller
  er cache som spillsidene selv refyller).

### S3 — Gates: PASS

- `npx vitest run lib/sync/` → **8 filer, 104/104 grønne** (kjørt denne økten,
  Node 22).
- `npx tsc --noEmit` → **exit 0** (kjørt denne økten).
- Builder kjørte full `npm run build` exit 0 (PR-body + kontrakts-logg);
  tsc-kjøringen min korroborerer. CI på PR: verify/scan/e2e alle SUCCESS.

### S4 — Staging-bevis: PASS (bevisvurdering)

Bevis-kommentar på PR #1641 (eier-konto) + `staging-verified`-label satt.
Tre faser: (A) eier-stempel = admin-id etter login + game-side; (B) utlogging
med tom kø → 0/0/0 i alle tre tabeller + stempel fjernet; (C) seedet
etterlatenskaps-rad (`testgame:testuser:1`) + ADMIN-stempel, login som
spiller → seedet rad borte, stempel flippet. Kommentaren er ærlig om at
første fase-C-orakel («0 rader») var feil — spillsiden refyller Dexie
legitimt ETTER vasken — og at fasen ble re-kjørt med skjerpet
rad-nøkkel-orakel (`seededRowGone: true`, 36 friske rader = samme antall som
fase A). Det skjerpede orakelet er det riktige beviset: det skiller vaskede
etterlatenskaper fra legitim refill. Prod-vakt attestert (0 kall utenfor
staging-ref). Vurdert som troverdig og dekkende for kontraktens tre punkter.

### S5 — Changes-notat: PASS

`.changes/1404-ren-enhet-ved-brukerbytte.md`: `type: fix`, `issue: 1404`,
body ~155 tegn (fil 189 bytes). `node scripts/weekly-release.mjs --dry-run`
aksepterer notatet (listet som `fix: 1404-ren-enhet-ved-brukerbytte.md`,
ingen fail-closed-feil).

### D6 — Produktvalg-markør i PR-body: PASS

PR #1641 har ordrett `## Produktvalg`-heading (maskin-markøren kortet
matcher), med anbefaling øverst, A/B med fordeler/ulemper for BEGGE,
ombyggingskostnad (middels + frase), reversibilitet, svar-instruks
(«svar 'alternativ B' her …») og «ingen hast». Auto-merge stoppes korrekt;
PR-en er draft inntil bokføringen er ferdig (#1516-flyten).

## Funn (ikke-blokkerende)

1. **`localStorage-degraded-comment-imprecise`** —
   `lib/sync/localDataCleanup.ts`, catch i `setStoredOwnerId`-bindingen:
   kommentaren hevder at utilgjengelig storage degraderer til «clearing on
   every boot-with-session». Det stemmer kun for hjørnet setItem-feiler /
   getItem-virker MED eksisterende stale stempel (switched → clear per boot).
   Er storage helt blokkert (getItem kaster → null) klassifiseres hver boot
   som 'first' → vakta blir inert og #1404-buggen består i det hjørnet.
   Ikke kontraktsbrudd (D3 valgte localStorage; edge-tabellen dekker ikke
   storage-unavailable; primærplattformen iOS Safari PWA har localStorage),
   men kommentaren bør presiseres ved neste berøring.
2. **`syncboot-guard-fail-open`** — SyncBoot-catchen starter motoren selv om
   vakta kastet (f.eks. Dexie-`clear()`-feil ved switched). Akseptert per
   kontraktens defensive holdning (sync = progressive enhancement), og en
   Dexie som feiler clear feiler normalt også drain-lesing. Residualrisiko
   notert, ingen handling kreves.

## Konklusjon

Alle fem suksesskriterier verifisert med egne kjøringer eller
førstehånds-lesing av bevis. Diffen er stram (6 filer, ingen scope-lekkasje),
kjernen er reelt testbar og testet, invariantene D2/D5 holder, og
produktvalg-markøren stopper auto-merge som bestilt.

VERDICT: ACCEPT
