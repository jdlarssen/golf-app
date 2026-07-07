# Spec: Admin/lanseringer — fjern manuell månedsbrev-seksjon (cron dekker den)

**Issue:** #1140 · **Branch:** claude/1140-admin-lanseringer-fjern-manuell-manedsbrev

## Problem

Admin-siden `app/[locale]/admin/lanseringer/page.tsx` rendrer en «Månedsbrev»-seksjon (linje 154-159 → `DigestCard` linje 171-208) med en «Send månedsbrev nå»-knapp gated på `!existing` (:201). Knappens `sendDigestNowAction` (`actions.ts:100-128`) kaller `sendDigestForPeriod({ sentByUserId: userId })` — **nøyaktig samme funksjon og periode** som cron-jobben allerede kjører på skjema. Cron er verifisert live: `vercel.json:3-8` planlegger `/api/cron/product-update-digest` daglig 08:00 UTC, og `app/api/cron/product-update-digest/route.ts:36,45` gater internt på 1. i måneden (Europe/Oslo) og kaller `sendDigestForPeriod({ sentByUserId: null })` over samme `previousMonthPeriod()`. Den manuelle knappen er dermed ren redundans — subtraksjonsrevisjon runde 2 flagget den for fjerning. `sendDigestForPeriod` er idempotent (`already_sent`-gren), så det er ingen funksjonstap: månedsbrevet går ut automatisk.

## Design

1. **Fjern digest-seksjonen** i `app/[locale]/admin/lanseringer/page.tsx`:
   - Slett `<section>`-blokken linje 154-159 (MiniRibbon + Suspense + `<DigestCard />`).
   - Slett `DigestCard`-funksjonen (linje 171-208) og `DigestSkeleton` (linje 210-217) i sin helhet.
   - Fjern importen `import { previousMonthPeriod } from '@/lib/productUpdates/digest';` (linje 17) — grep bekrefter :175 (i `DigestCard`) er sidens eneste bruk; `previousMonthPeriod` beholdes eksportert i `lib/productUpdates/digest.ts` (brukes av `sendDigestForPeriod` + `digest.test.ts`).
   - Fjern `sendDigestNowAction` fra importlinja 18 → `import { publishProductUpdateAction } from './actions';`.
   - **Behold** `getAdminClient` (:6), `getLocale` (:3), `formatShortDateWithYearLocale` (:16), `Suspense` (:2), `Skeleton` (:15) — alle fortsatt brukt av `PreviousUpdatesList` / `ListSkeleton`.
   - **Behold** `subtitle` (:86 / i18n `admin.launches.subtitle`) — «månedlig oppsummering på mail» er fortsatt korrekt (cron sender den).

2. **Rydd død searchParam-håndtering** i samme fil (T2 change-propagation — disse produseres KUN av `sendDigestNowAction`-redirectene som forsvinner):
   - `SearchParams`-typen (linje 21-29): fjern `digest?` (:26) og `updates?` (:27). Behold `published`, `recipients`, `edited`, `notifs`, `error`.
   - Fjern `const digestStatus = first(params.digest);` (:55) og `const digestUpdates = first(params.updates);` (:56).
   - Forenkle `successMessage` (linje 62-75): behold `edited`- og `published`-grenene, fjern `digestStatus === 'sent' | 'already_sent' | 'no_updates'`-kaskaden (linje 66-74) og la `: undefined`-fallbacken (:75) bli den nye else-grenen rett etter `published`-grenen. `publishedCount` (:52) beholdes — den brukes fortsatt av `published`-grenen (:65).

3. **Fjern `sendDigestNowAction`** i `app/[locale]/admin/lanseringer/actions.ts`:
   - Slett funksjonen linje 100-128.
   - Fjern importen `import { sendDigestForPeriod } from '@/lib/productUpdates/digest';` (linje 11) — grep bekrefter :105 er actions-filens eneste bruk (cron-routen importerer den uavhengig fra libben).
   - `publishProductUpdateAction` og `editProductUpdateAction` røres ikke.

4. **Fjern digest-testene** i `app/[locale]/admin/lanseringer/actions.test.ts`:
   - Slett hele `describe('sendDigestNowAction', …)`-blokken (linje 228-283).
   - Fjern `sendDigestMock`-oppsettet (linje 54-57) — brukes kun av de slettede testene.

5. **Fjern foreldreløse i18n-nøkler**, symmetrisk i `messages/no.json` OG `messages/en.json` (`messages/catalogParity.test.ts` krever identiske løvnøkler i alle lokaler — asymmetrisk sletting feiler porten). Alle ligger under `admin.launches` (no.json-linjer som referanse; en.json speiler samme struktur):
   - `errors.digest_failed` (:3518)
   - `success.digestSent` (:3523), `success.digestAlreadySent` (:3524), `success.digestNoUpdates` (:3525)
   - `digestSection` (:3540), `digestHeading` (:3541), `digestSentLine` (:3542), `digestNotSentYet` (:3543), `sendDigestButton` (:3544), `sendingBusy` (:3545)
   - ⚠️ **Kun `sendingBusy` under `admin.launches` (no.json:3545 / tilsvarende i en.json).** Det finnes andre `sendingBusy`-nøkler i andre namespaces (no.json:3043, :3180) og en `resendingBusy` (:3282) — de røres IKKE.

## Key Decisions

- **Commit-type `refactor` — ingen version-bump, ingen CHANGELOG-linje.** Månedsbrevet går fortsatt ut automatisk via cron; dette fjerner en redundant admin-only kontroll uten å endre utfallet av flyten (ingen ny funksjon, ingen bug fikset). Flaten er admin-intern (`requireAdmin`-gate), ikke spiller-synlig. Det matcher `[no-changelog]`-sporet og #1138-presedensen (ren subtraksjon uten atferdsendring). `feat`/`fix`-prefiks ville trigget bump-hooken unødvendig.
- **Ingen migrasjon.** `product_update_digests`-tabellen og `sendDigestForPeriod` beholdes uendret — cron-routen er eneste gjenværende call-site og fungerer som før. Ingen DB-/RLS-endring, ingen prod-brannmur i spill.
- **Behold cron-routen + libben urørt.** `app/api/cron/product-update-digest/route.ts` og `lib/productUpdates/digest.ts` endres ikke.

**Claude's Discretion:** Om searchParam-oppryddingen (steg 2) og seksjonsfjerningen (steg 1) tas som én eller to atomiske commits; nøyaktig formulering hvis JSDoc/kommentarer i berørte filer trenger justering.

## Success Criteria
- [ ] `/admin/lanseringer` viser ikke lenger «Månedsbrev»-seksjonen eller «Send månedsbrev nå»-knappen — kun «Publiser ny lansering» + «Tidligere lanseringer».
- [ ] `sendDigestNowAction` finnes ikke lenger i `actions.ts`; ingen gjenværende import av `sendDigestForPeriod` eller `previousMonthPeriod` i verken `page.tsx` eller `actions.ts`.
- [ ] Ingen ubrukte importer, variabler eller `SearchParams`-nøkler igjen (bygg/lint grønt).
- [ ] De ti foreldreløse `admin.launches`-nøklene er fjernet fra BÅDE `no.json` og `en.json`; katalogene har fortsatt identisk løvnøkkel-mengde; de tre urelaterte `sendingBusy`/`resendingBusy`-nøklene i andre namespaces er urørt.
- [ ] `sendDigestNowAction`-testblokken + `sendDigestMock` er borte fra `actions.test.ts`; `publishProductUpdateAction`- og `editProductUpdateAction`-testene forblir grønne.
- [ ] `product-update-digest`-cron-routen + `lib/productUpdates/digest.ts` er uendret.

## Gates
- [ ] `npm run build` — grønt (fanger ubrukte importer/variabler + exhaustive-sjekker)
- [ ] `npm run lint` — grønt på berørte filer
- [ ] `npx vitest run "app/[locale]/admin/lanseringer/actions.test.ts" messages/catalogParity.test.ts messages/apostropheParity.test.ts` — grønt (gjenværende action-tester + no/en-nøkkelparitet)
- [ ] (valgfritt, cheap) staging-klikk `/admin/lanseringer` på `torny-staging` — bekreft at siden rendrer uten digest-seksjonen og uten brutt import

## Files Likely Touched
- `app/[locale]/admin/lanseringer/page.tsx` — fjern digest-seksjon + `DigestCard`/`DigestSkeleton` + imports + død searchParam-håndtering
- `app/[locale]/admin/lanseringer/actions.ts` — fjern `sendDigestNowAction` + `sendDigestForPeriod`-import
- `app/[locale]/admin/lanseringer/actions.test.ts` — fjern digest-describe-blokk + `sendDigestMock`
- `messages/no.json` — fjern ti `admin.launches`-digest-nøkler
- `messages/en.json` — samme fjerning (parity)

## Out of Scope
- `app/api/cron/product-update-digest/route.ts` og `lib/productUpdates/digest.ts` — cron-flyten som faktisk sender månedsbrevet beholdes uendret.
- `product_update_digests`-tabellen — ingen migrasjon, ingen kolonne-drop.
- Publiser-lansering- og rediger-flyten (`publishProductUpdateAction`, `editProductUpdateAction`, `PreviousUpdatesList`) — røres ikke.
- Version-bump / CHANGELOG-oppføring (bevisst utelatt, se Key Decisions).
