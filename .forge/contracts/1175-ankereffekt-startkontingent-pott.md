# Spec: Ankereffekt — vis startkontingent relativt til potten (#1175)

## Problem
UX Peak-prinsippet **kontrast-/ankereffekten**: en pris i isolasjon vurderes absolutt; ved siden av et større tall vurderes den relativt. Tørnys eneste pris-flate er **startkontingent** (#1049), som i dag vises isolert i `PaymentInfo` («Startkontingent: X kr»). Det finnes **intet pott-total** å ankre mot. Denne kontrakten innfører et ærlig pott-total og viser kontingenten relativt: «Startkontingent 100 kr — potten er nå 800 kr».

## Prior Decisions (carry-forward)
- **#1049 del 1** (`.forge/contracts/1039-part1-vipps-startkontingent.md`): `games.entry_fee_kr` + `games.payment_link` + `game_players.paid_at` (timestamp, `null` = ikke betalt). `paid_at` settes KUN av admin/creator (guard-trigger + RLS); aldri av spilleren selv. `PaymentInfo` + `isPaymentUrl` er visnings-laget. **Ingen refusjon ved withdrawal** (Out of Scope der) → betalt `paid_at` beholdes selv om spiller trekker seg.
- **#1145** (`.forge/contracts/1145-...withdrawn.md`): admin-tellingen «X av Y betalt» ekskluderer `withdrawn_at`-spillere. Kontrakten advarte eksplisitt mot **to divergerende tellemåter** side om side — pott-tellingen må følge samme regel for å unngå nettopp den bugen.
- **EIER-BESLUTNING (denne økten):** potten = **innbetalt sum** — sum av kontingenter der `paid_at` er satt. Et ærlig tall som vokser; overlover aldri (ingen «forventet pott» av ubetalte).

## Research Findings (in-repo, verifisert)
- Kolonner finnes allerede — **ingen skjemaendring**: `lib/database.types.ts` — `game_players.paid_at` (`:469`), `withdrawn_at` (`:478`); `games.entry_fee_kr` (`:673`), `payment_link` (`:684`).
- `PaymentInfo` (`components/PaymentInfo.tsx`): props `entryFeeKr`, `paymentLink`, `paid`, `compact`, `className`. Full-variant `:107-146`, compact `:77-104`, beløp via `formatKr(entryFeeKr)`. Returnerer `null` når `entryFeeKr <= 0` (`:49`).
- **RLS er moot — potten regnes server-side:** begge visnings-helperne bruker **admin-client (service-role, bypasser RLS)**:
  - Spill-hjem: `lib/games/getGameWithPlayers.ts:197` (`getAdminClient`) laster allerede `game_players.paid_at` for ALLE spillere (`:209`). Potten regnes fra data som allerede er i minnet — **null ekstra query**.
  - Signup/offentlig plakat: `lib/games/getGameByShortId.ts:2,60` (`getAdminClient`) — men henter **ikke** `game_players`. En pott der krever en liten server-side aggregering (admin-client `count`), aldri per-spiller `paid_at` til klienten.
- `PaymentInfo`-kall-steder: spill-hjem `app/[locale]/games/[id]/(home)/page.tsx:527` (venterom), `:802` (aktiv full), `:882` (aktiv compact, gated `me.paid_at == null`); signup `app/[locale]/signup/[shortId]/page.tsx:141` + `:330`, `PublicLandingView.tsx:75`.
- `formatKr(amount)` (`lib/format/formatKr.ts`): «800 kr», «1 400 kr». i18n-namespace `payment` finnes (`messages/no.json:431`, nøkler: label/payVia/vippsTo/copy/copied/arrangeWithHost/paidBadge/compactLine).

## Design

### Pott-beregning (ren logikk, Type A / TDD)
- Ny ren helper `computePaidPotKr(players, entryFeeKr)` i `lib/games/` (foreslått `paidPot.ts`):
  `entryFeeKr * players.filter(p => p.paid_at != null && p.withdrawn_at == null).length`.
- **Spill-hjem:** kall med `gwp.players` (allerede lastet) i server-komponenten → pass `potKr` som prop. Null ekstra DB-runde.
- **Signup:** legg en liten admin-client-aggregering (server-side i `page.tsx`, evt. helper `getPaidPotKr(gameId, entryFeeKr)`) som teller `paid_at IS NOT NULL AND withdrawn_at IS NULL`; pass `potKr` ned. Per-spiller `paid_at` forlater aldri serveren.

### Visning (`PaymentInfo` får ett nytt, valgfritt prop)
- Nytt prop `potKr?: number` (default `undefined`). Når satt og over terskel, rendres en ankerlinje i full-varianten: «potten er nå {pott}» (ny i18n-nøkkel `payment.potLine`, `{pot}` via `formatKr`). Kontingenten er allerede synlig i samme kort → kontrasten oppstår.
- **Terskel:** vis anker kun når `potKr >= entryFeeKr` (≥ 1 betalende). Pott = 0 → ikke render «potten er 0 kr» (ville vært en anti-anker).
- Compact-varianten holdes minimal; anker der er Claude's Discretion (terse « · potten X kr» vs. ingenting).
- `PaymentInfo` forblir en ren presentasjons-komponent — den regner ikke potten selv, den mottar `potKr` ferdig fra server.

## Edge Cases & Guardrails
- **Pott = 0** (ingen har betalt): ingen ankerlinje (terskel). Kontingenten vises isolert som før.
- **Trukket spiller med `paid_at`:** ekskluderes fra potten (`withdrawn_at == null`-filter) — **bevisst likt #1145 sin admin-telling** for å unngå to divergerende tall. `paid_at` beholdes i DB (historikk, #1049), men teller ikke i pott-ankeret.
- Kun én betalende (pott == kontingent): anker vises (terskel oppfylt), men kontrasten er svak (1:1). Akseptabelt — tallet vokser ærlig når flere betaler.
- RLS: potten regnes utelukkende server-side via admin-client; ingen per-spiller-betalingsstatus sendes til uinnloggede/vanlige klienter. Ingen ny policy, ingen skjemaendring.
- `entry_fee_kr <= 0`: `PaymentInfo` returnerer `null` allerede — `potKr` ignoreres, ingen anker.
- Cache: spill-hjem leser `getGameWithPlayers` (tag `game-${id}`); `togglePlayerPaid` (#1049) kaller allerede `revalidateTag(game-${id})`, så potten oppdateres når admin huker av — verifiser at ny betaling reflekteres uten ekstra invalidasjon.

## Key Decisions
- **Potten = innbetalt sum, ekskl. withdrawn** (eier + #1145-konsistens): `sum(entry_fee_kr)` over `paid_at != null AND withdrawn_at == null`. Ærlig, voksende, aldri overlovende. Alternativet (inkluder withdrawn-betalte) forkastet for å unngå to divergerende tellemåter.
- **Ingen skjemaendring** — kolonnene finnes; potten er en avledet visning.
- **Server-side beregning, `PaymentInfo` mottar `potKr`** — RLS-trygt, holder komponenten ren.
- **Terskel `potKr >= entryFeeKr`** — pott = 0 gir ingen anti-anker.

**Claude's Discretion:**
- Eksakt ankercopy (humanizer-vasket): «potten er nå {pott}» vs. «{pott} i potten så langt».
- Om compact-varianten (aktiv-runde, #1068) også får anker eller holdes ren.
- Om signup-potten legges i egen helper eller foldes inn i `page.tsx`; om `getGameByShortId` utvides eller får en søster-aggregering.
- Nøyaktig terskel (`>= entryFeeKr` vs. `> entryFeeKr` for ≥ 2 betalende).

## Success Criteria
- [x] `computePaidPotKr` summerer kun betalte, ikke-trukne spillere × `entry_fee_kr`; Type A-test dekker 0 betalt, N betalt, trukket-men-betalt (ekskludert), `entry_fee_kr = 0`. → `lib/games/paidPot.ts` + `paidPot.test.ts` (8 grønne).
- [x] Spill-hjem viser «Startkontingent X kr — potten er nå Y kr» når ≥ 1 har betalt, uten ekstra DB-query (gjenbruker `gwp.players`). → staging: `/games/461e1da3…` viste `data-testid=payment-pot-anchor` = «Potten er oppe i 100 kr» (potKr = `computePaidPotKr(gwp.players, fee)`, ingen ekstra query).
- [x] Signup/offentlig plakat viser samme anker når ≥ 1 har betalt; per-spiller `paid_at` eksponeres aldri til klienten (kun aggregert `potKr`). → staging: `/signup/e2epot01` viste anker «Potten er oppe i 200 kr»; `getPaidPotKr` returnerer kun ett `count`-tall.
- [x] Pott = 0 → ingen ankerlinje noe sted (kontingenten vises isolert som før). → staging: etter `paid_at=null` viste `/signup/e2epot01` kontingent-kortet uten anker (`anchorPresent=false`).
- [x] Pott-tallet matcher admin-sidens «X av Y betalt»-telling (samme withdrawn-eksklusjon — ingen divergens). → identisk predikat `paid_at is not null and withdrawn_at is null`; staging SQL-orakel: 2 betalende, 1 trukket-betalt ekskludert → 200 kr.

## Gates
- [x] `npx tsc --noEmit` grønn → exit 0.
- [x] `npm run lint` grønn → 0 errors (kun 2 eksisterende complexity-advarsler på de store side-funksjonene).
- [x] `npx vitest run` for berørte co-located tester: `paidPot` (ny, Type A) + evt. én render-test på `PaymentInfo` kun hvis ingen finnes fra før (maks én) → 16 grønne (paidPot 8, PaymentInfo-anker 3, PublicLandingView 1, i18n-parity 2×).
- [x] Ny norsk copy → `humanizer:humanizer`; nb+en next-intl-nøkler (`payment.potLine`, `catalogParity` grønn) → «Potten er oppe i {pot}» / «The pot is now {pot}»; catalogParity grønn.
- [x] Bruker-synlig → `feat`, **minor** bump + CHANGELOG-linje (Funksjoner) → 1.199.0 → 1.200.0, CHANGELOG «1.200 · Se hvor stor potten er blitt».
- [x] Staging-klikkrunde: sett `entry_fee_kr` > 0, huk av 2 spillere som betalt → anker viser potten på både spill-hjem og signup; huk av ingen → intet anker. Bevis på PR. → verifisert på PR #1232 (spill-hjem + signup viste anker; pott=0 skjulte det); bevis-kommentar postet.

## Files Likely Touched
- `lib/games/paidPot.ts` (+ `.test.ts`) — ren pott-summering
- `components/PaymentInfo.tsx` — nytt `potKr?`-prop + ankerlinje (terskel-gated)
- `app/[locale]/games/[id]/(home)/page.tsx` — regn `potKr` fra `gwp.players`, send til PaymentInfo-kallene
- `app/[locale]/signup/[shortId]/page.tsx` (+ evt. helper for paid-count) + `PublicLandingView.tsx` — server-aggregert `potKr` til PaymentInfo
- `messages/no.json` + `messages/en.json` — `payment.potLine`
- `package.json` (+ lock) + `CHANGELOG.md`

## Out of Scope
- Refusjon ved withdrawal / betalings-gate / ekte Vipps-API (fortsatt ute, #1049).
- Premiepott i kr / premieverdi-aggregering (#1051 var eksplisitt uten pott-total).
- «Forventet pott» av ubetalte kontingenter (bryter eier-beslutningen om ærlig innbetalt sum).
- Liga-/cup-nivå aggregert kontingent.
- Endring av `paid_at`-skrivevei, RLS eller guard-trigger (#1049 — uendret).
