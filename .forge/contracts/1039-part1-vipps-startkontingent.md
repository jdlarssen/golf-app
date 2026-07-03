# Spec: Startkontingent med Vipps-sporing (epic #1039, del 1)

## Problem
Arrangører (kompisgjenger, klubbkvelder) samler ofte inn en startkontingent før en runde — men i dag finnes ingen støtte for det i Tørny. Beløpet avtales på si, betalingen skjer via Vipps utenfor appen, og arrangøren holder styr på hvem som har betalt i hodet eller i en chat. Denne delen gir arrangøren et sted å sette beløp + betalingsmåte, viser det til spillerne der de melder seg på, og lar arrangøren huke av og purre. Board-møtet 2026-07-03 rangerte dette som betalingsvillighet-data for arrangør-segmentet (#1039, køplass 2).

**Avgrensning (fra #1039):** Dette er *sporing + lenke*, IKKE integrert betaling. Ingen Vipps-API (krever bedriftsavtale + koster penger), intet betalingsbevis, ingen refusjon, ingen betalings-gate. Spilleren blir aldri blokkert fra å melde seg på fordi hun ikke har betalt — arrangøren huker av manuelt.

## Prior Decisions (carry-forward)
- **#937 pengeoppgjør** (`.forge/contracts/937-pengeoppgjor-veddemaal.md`) innførte `formatKr()` (`lib/format/formatKr.ts`) og `kr_per_unit` i `mode_config` for *veddemåls-oppgjør* (hvem skylder hvem etter Skins/Wolf/Nassau). Det er et ANNET penge-konsept enn startkontingent. → Gjenbruk `formatKr()`; navngi våre kolonner distinkt (`entry_fee_kr`, ikke noe «kr»-generisk) for å unngå forveksling.
- **Skjema-konvensjon:** game-nivå-valg lagres som egne kolonner på `games` (ikke JSON-blob). `game_players`-livssyklus kodes i timestamps, ikke status-kolonner (`accepted_at`/`approved_at`/`withdrawn_at`). → Vi følger begge: `entry_fee_kr`+`payment_link` på `games`, `paid_at` på `game_players`.
- **5 feller (`docs/bug-prevention.md`):** ny kolonne + ny skrivevei ⇒ RLS-policy må matche (trap 3), `expectAffected` mot 0-rad-skriv (trap 2), regel-én-hjem (trap 4), live-DB-verifisering (trap 1), atomisk/kompensert skriv (trap 5).

## Design

### Datamodell (migrasjon 0133)
`games`:
- `entry_fee_kr int NOT NULL DEFAULT 0 CHECK (entry_fee_kr >= 0 AND entry_fee_kr <= 100000)` — 0 = ingen kontingent (feature av).
- `payment_link text` (nullable) — Vipps-nummer ELLER URL. Fritekst; appen tolker ved visning (se «smart-visning»).

`game_players`:
- `paid_at timestamptz` (nullable) — `null` = ikke betalt, satt = betalt. Speiler `accepted_at`/`approved_at`-konvensjonen. Ingen per-spiller beløps-kolonne — beløpet er alltid `games.entry_fee_kr` flatt per spiller.

RLS / guard-trigger:
- Arrangør (admin ELLER `games.created_by = auth.uid()`) kan sette `entry_fee_kr`+`payment_link` — verifiser at eksisterende games-update-policy dekker det; ellers utvid.
- `game_players.paid_at` skal KUN settes/nulles av admin eller spillets creator — **aldri av spilleren selv**. Utvid `guard_game_players_self_update`-triggeren (0103/0106-mønster, jsonb-allowlist) så `paid_at` blokkeres for self-writes, og legg/utvid creator+admin UPDATE-policy som tillater `paid_at`. Test med hostile-PATCH-rig (#440): en vanlig spiller som PATCH-er egen `paid_at` skal få 0 rader / avvist.

### Arrangør — sette kontingent (opprett + rediger spill)
- Nytt felt i wizardens **steg 2 / `RegistrationSection`** (der `registration_mode` bor): «Startkontingent (valgfritt)» → tallfelt i kr. Når > 0, avdekkes felt 2: «Vipps-nummer (eller betalingslenke)» — fritekst, hint/placeholder lener mot Vipps-nr siden ~99 % bruker det.
- Tråkles gjennom `useGameFormState` (speil `krPerUnit`-mønsteret, `useGameFormState.ts:~448`), serialiseres i `FormDataInputs` (`GameWizard.tsx:~1137`), valideres i `gamePayload.ts parseBase` (`entry_fee_kr` ikke-negativ int ≤ 100000; `payment_link` trimmes), settes i INSERT (`actions.ts:196–231`). Rediger-flyten prefyller fra eksisterende verdier (samme builders — gratis).

### Spiller — se beløp + lenke (påmelding + spill-hjem)
- **Smart-visning av `payment_link`** (delt komponent `PaymentInfo` + ren `isPaymentUrl()`-helper):
  - Matcher `http(s)://…` → klikkbar «Betal her»-lenke (`target=_blank rel="noopener noreferrer"`). **Kun** `http`/`https` gjøres klikkbar (blokker `javascript:` o.l. — XSS-vakt).
  - Ellers → behandles som Vipps-nummer: «Vipps til {nummer}» med kopier-knapp.
  - Beløp vises alltid via `formatKr(entry_fee_kr)`.
- **Påmelding:** `PaymentInfo` på `/signup/[shortId]` — både `PublicLandingView` (uinnlogget) og i `RegistrationForm` — så folk vet kostnaden før de blir med. Utvid `getGameByShortId`/`ShortIdGame` til å eksponere `entry_fee_kr` + `payment_link`.
- **Spill-hjem:** `PaymentInfo` på `/games/[id]/(home)` så lenge `entry_fee_kr > 0` OG spillerens `paid_at IS NULL`. Når arrangøren har huket av, forsvinner betal-oppfordringen (erstattes av diskret «Startkontingent betalt ✓»).
- Alltid informativt, aldri blokkerende.

### Arrangør — spore + purre (admin)
- **Betalt-kort** på admin-spillsiden (`[id]/page.tsx`, etter `RegistrationOverviewSection`): kompakt `SectionCard` som viser «{X} av {Y} betalt» + lenke til egen underside `/admin/games/[id]/betaling`. Speiler `/signups`-IA (kort med telling → underside med per-rad-handlinger). Vises kun når `entry_fee_kr > 0`.
- **Betaling-underside** (`/admin/games/[id]/betaling`): per-spiller-liste (`tabular-nums`, `GuestBadge`, eksplisitt FK-hint `users!game_players_user_id_fkey`) med betalt-checkbox. Withdrawn-spillere vises men telles ikke i «X av Y» (speil readiness-count `page.tsx:505`). Summering «{X} av {Y} mangler». «Purr de som mangler»-knapp.
- **`togglePlayerPaid(gameId, userId, paid)`** server-action: setter/nuller `paid_at`, `loadAdminOrCreatorContext`-gated, `.select()`+`expectAffected`, `revalidateTag(\`game-${gameId}\`, 'max')`.
- **Purring — `remindUnpaidPlayers`** server-action: speiler `remindUnsubmittedPlayers` (`admin/games/[id]/status/actions.ts`) — `Promise.allSettled` over spillere med `paid_at IS NULL` (ekskl. withdrawn), kaller `notify()` med ny kind `payment_reminder` (in-app + mail-if-off-app via eksisterende gating). Varsel inneholder beløp + lenke; deeplink → `/games/[id]/(home)`. Ingen idempotens-stamp (arrangør kan purre flere ganger, som `remindUnconfirmedPlayers`).
- **Stille avhuking:** å sette `paid_at` gir INGEN varsel til spilleren. Kun purring varsler.

### Ny notification-kind `payment_reminder`
- `NotificationKind`-union + Zod-schema i `lib/notifications/types.ts` (payload: `gameId`, `gameName`, `entryFeeKr`, `paymentLink?`).
- Case i `cardContent.ts` (tittel/detalj), case i `deeplink.ts` (→ `/games/[gameId]`), mail-mal `lib/mail/paymentReminderNotification.ts` (Resend-mønster, locale-aware, `escapeHtml` på `payment_link`). `npm run build` fanger manglende exhaustive-cases.

## Edge Cases & Guardrails
- `entry_fee_kr = 0` → hele featuren skjult (ingen felt i påmelding/hjem/admin, intet kort, ingen purre-knapp).
- `payment_link` tom mens `entry_fee_kr > 0` → **tillatt**; vis kun beløpet med nøytral «Avtal betaling med arrangøren». (En kontingent uten lenke er lov — kontant på banen finnes.)
- Withdrawn (`withdrawn_at` satt): vist i betaling-panelet, men ekskludert fra «X av Y»-tellingen. Behold `paid_at` om satt (historikk).
- `game_players` har TO FK til `users` → alle selects må ha eksplisitt FK-hint, ellers PGRST201.
- 0-rad-skriv: `togglePlayerPaid` chainer `.select()` + `expectAffected`.
- `payment_link` er fritekst → `escapeHtml` i mail-HTML; ved URL-render kun `http(s)` klikkbar (XSS).
- Club-scoped spill (`group_id` satt): startkontingent tillatt (klubbkveld kan ha avgift på toppen av medlemskap) — ingen ekstra gating.
- Cup/liga-koblede spill: `paid_at` er per `game_players`-rad; fungerer likt. Ingen turnering-nivå-aggregering her.

## Key Decisions
- **Ett smart `payment_link`-felt** (bruker-valg); copy lener mot Vipps-nummer (99 %-tilfellet). URL → klikkbar lenke; ellers Vipps-nr + kopier-knapp.
- **Beløp+lenke vist både i påmelding og på spill-hjem** (bruker-valg); forsvinner på hjem når betalt.
- **Stille avhuking** (bruker-valg) — kun purring varsler.
- **`paid_at`-timestamp** (ikke boolean/status) — følger app-konvensjon.
- **Egen `/betaling`-underside + kompakt telle-kort** (speil `/signups`-IA), ikke inline-panel — skalerer til klubb-skala (~150).

**Claude's Discretion:**
- `payment_link` valgfri selv når beløp > 0 (vis beløp alene hvis tom).
- Eksakt plassering/copy for `PaymentInfo`; om «betalt total» (X × `entry_fee_kr`) vises i kortet eller bare antall.
- Kopier-knapp for Vipps-nr (gjenbruk evt. eksisterende copy-share-knapp `CopyShareLinkButton`).

## Success Criteria
- [ ] Migrasjon 0133 legger til `games.entry_fee_kr` + `games.payment_link` + `game_players.paid_at`; `npm run gen:types` reflekterer dem (verifiser: grep `database.types.ts`).
- [ ] Arrangør kan sette startkontingent + betalingsinfo i **opprett OG rediger** spill; verdiene lagres (verifiser: opprett spill på staging → se `games`-rad).
- [ ] Spiller ser beløp + smart lenke/Vipps-nr på `/signup/[shortId]` (uinnlogget + innlogget) og på `/games/[id]/(home)` til `paid_at` settes.
- [ ] Admin ser «X av Y betalt» + kan huke av per spiller på `/admin/games/[id]/betaling`; avhuking setter/nuller `paid_at` (`expectAffected` verifisert).
- [ ] «Purr de som mangler» sender `payment_reminder` (in-app + mail-if-off-app) til spillere med `paid_at IS NULL`; inneholder beløp + lenke.
- [ ] Direkte hostile PATCH av `game_players.paid_at` fra vanlig spiller blokkeres av RLS/trigger (hostile-PATCH-test).
- [ ] `entry_fee_kr = 0` skjuler hele featuren (ingen UI noe sted).

## Gates
- [ ] `npm run build` (tsc + Next build — fanger exhaustive switch på `payment_reminder` + GameMode-mirrors)
- [ ] `npx vitest run` for berørte filer: `gamePayload`-validering (Type A), `isPaymentUrl()` URL-deteksjon (Type A ren helper), `paymentReminderNotification` mail-snapshot (Type B, én chrome-lås)
- [ ] `npm run lint`
- [ ] Ny norsk copy → `humanizer:humanizer`-skill før commit; bilingual nb+en next-intl-nøkler for alle nye strenger
- [ ] Bruker-synlig → staging-klikkrunde av berørt flyt (opprett→påmeld→betal-spor→purr) FØR merge

## Files Likely Touched
- `supabase/migrations/0133_game_entry_fee.sql` — kolonner + RLS-policy + guard-trigger-utvidelse
- `lib/database.types.ts` — regenerert
- `app/[locale]/admin/games/new/useGameFormState.ts` — `entryFeeKr`/`paymentLink` state (speil `krPerUnit`)
- `app/[locale]/admin/games/new/GameWizard.tsx` — `FormDataInputs` hidden inputs
- `app/[locale]/admin/games/new/sections/RegistrationSection.tsx` — arrangør-felt
- `lib/games/gamePayload.ts` — `parseBase`-validering + payload
- `app/[locale]/admin/games/new/actions.ts` — INSERT-kolonner
- `lib/games/getGameByShortId.ts` — eksponer `entry_fee_kr` + `payment_link`
- `app/[locale]/signup/[shortId]/page.tsx` + `PublicLandingView.tsx` + `RegistrationForm.tsx` — `PaymentInfo`
- `app/[locale]/games/[id]/(home)/page.tsx` — `PaymentInfo` til betalt
- `components/**/PaymentInfo.tsx` + `lib/**/isPaymentUrl.ts` — ny delt komponent + URL-detect helper
- `app/[locale]/admin/games/[id]/page.tsx` — betalt-telle-kort
- `app/[locale]/admin/games/[id]/betaling/page.tsx` (+ client) — per-spiller-liste + toggle + purre-knapp
- `app/[locale]/admin/games/[id]/betaling/actions.ts` (eller eksisterende `actions.ts`) — `togglePlayerPaid` + `remindUnpaidPlayers`
- `lib/notifications/types.ts` + `cardContent.ts` + `deeplink.ts` — `payment_reminder`-kind
- `lib/mail/paymentReminderNotification.ts` (+ i18n-katalog-nøkler) — Resend-mal
- i18n nb+en nøkler for alle nye strenger (next-intl)
- `package.json` + `CHANGELOG.md` — feat, **minor** bump, én Funksjon-linje

## Out of Scope (denne delen)
- **Sponsor og premiebord** (#1039 del 2 — eget spec-issue + PR)
- Ekte Vipps-API-integrasjon / betalingsbevis / automatisk avstemming
- Betalings-gate (blokkere påmelding til betalt)
- Refusjon ved withdrawal
- Turnering-nivå (cup/liga) aggregert kontingent-oversikt
- Spiller-selv-markering «jeg har betalt» (kun arrangør huker av, per issue)
