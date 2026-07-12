# Spec: Sosialt bevis i join-funnelen («din venn X er også med») (#1193)

**Issue:** [#1193](https://github.com/jdlarssen/golf-app/issues/1193) · UX-psykologi: sosialt bevis (Cialdinis nest sterkeste driver) · Flyt 2 (bli med i spill)
**Type:** `feat` (bruker-synlig) → MINOR-bump + CHANGELOG Funksjoner-rad

## Problem

Ingen sosialt-bevis-signaler i join-funnelen i dag. Folk gjør det de ser at folk de kjenner
gjør — «Jonas og 2 andre du kjenner er med» / «3 har blitt med» senker terskelen for å hoppe
på. Tørny har alt grafen (vennskap + offentlig roster); den brukes bare ikke til å motivere
påmelding.

## Research Findings (verifisert)

- **Venne-oppslaget finnes:** `getFriendIds(userId)`
  ([lib/friends/getFriendIds.ts](lib/friends/getFriendIds.ts)) → aksepterte venners
  bruker-ider via admin-client, begge retninger; `friendIdsFromRows` filtrerer
  `status === 'accepted'` ([lib/friends/friendGraph.ts:24-29](lib/friends/friendGraph.ts)).
  **En akseptert `friendships`-rad ER gjensidig** (én rad, `accepted`, begge retninger telles)
  — så `getFriendIds` er nettopp settet av gjensidige venner. Ingen ny gjensidighets-regel.
- **Roster-helperen finnes:** `getPublicSignupRoster(gameId)`
  ([lib/games/getPublicSignupRoster.ts](lib/games/getPublicSignupRoster.ts)) → `{ count,
  names[], overflow }` for ikke-trukne spillere (`withdrawn_at is null`), admin-client,
  felt-whitelist (kun navn/kallenavn). `count = rows.length` (inkluderer visning av seg selv
  hvis man er påmeldt).
- **Plakaten er ANON-ONLY:** `PublicLandingView`
  ([app/[locale]/signup/[shortId]/PublicLandingView.tsx](app/[locale]/signup/[shortId]/PublicLandingView.tsx))
  rendres KUN når `!user` ([signup/[shortId]/page.tsx:117-146](app/[locale]/signup/[shortId]/page.tsx)).
  Den viser alt aggregert antall (`registeredCount`) + offentlig-formaterte navn (#1022), og
  ved `count === 0` en `emptyRoster`-tekst «Ingen har meldt seg på ennå. Bli den første.»
  ([messages/no.json:4527](messages/no.json)). En anonym besøkende har ingen identitet → kan
  ikke ha gjensidige venner. **Det venn-navngitte signalet kan derfor kun rendres for
  innloggede besøkende.**
- **Innlogget join-flate:** den autentiserte `signup/[shortId]/page.tsx`-grenen rendrer
  påmeldings-skjemaet og henter alt `getFriendIds(user.id)` for `viewerIsFriend`
  ([page.tsx:235-243](app/[locale]/signup/[shortId]/page.tsx)), men viser INGEN generell
  roster/sosialt-bevis-linje for den innloggede (kun `matchplaySideData` for matchplay).
- **Finn turneringer (innlogget):** `getDiscoverableGames(userId)`
  ([lib/games/getDiscoverableGames.ts](lib/games/getDiscoverableGames.ts)) regner alt
  `friendGames` (spill opprettet AV venner) via `getFriendIds`, men vet ikke hvilke venner
  som er PÅMELDT et gitt spill. `HomeDiscoverySection` rendrer kortene. Anon-lista (#1185, hvis
  bygget) er metadata-only.

## Prior Decisions

- **Eier (denne økten) — Key Decision:** innloggede med relasjon ser NAVN («Jonas og 2 andre
  du kjenner er med») basert KUN på gjensidige venner; anonyme/uten relasjon ser KUN aggregert
  antall («3 har blitt med»). Ekte tall, aldri oppblåst. **Ved 0 påmeldte (ekskl. deg selv):
  vis INGENTING** (negativt sosialt bevis er verre enn ingenting). Spilleren selv ekskluderes
  fra tellingen.
- **#1022:** felt-whitelist er sikkerhetsgrensen for offentlig spill-data; plakaten viser alt
  `count` + public-navn. **#1169:** login-kontekstkort for inviterte (betinget del under). **#1185:**
  anon-lista viser kun metadata/antall, aldri roster. **#1179-mønsteret:** en del leveres kun
  hvis den avhengige flaten (#1169) er bygget, ellers noteres den utestående.

## Design

**Ny server-helper `lib/games/getGameSocialProof.ts`** (admin-client, felt-whitelist): gitt
`gameId(s)` + `viewerUserId | null`, returner per spill `{ joinedCount, knownFriendNames[],
knownFriendOverflow }` der:
- `joinedCount` = ikke-trukne spillere **ekskl. `viewerUserId`**.
- `knownFriendNames` = kun når `viewerUserId != null`: skjæringen av roster-brukere ∩
  `getFriendIds(viewerUserId)`, formatert med `formatPublicName`, **cap 1-2 navn**, resten som
  `knownFriendOverflow`. Beregnes SERVER-SIDE; klienten får aldri rå venneliste.
- Ren kjerne (Type A): `buildSocialProof(rosterUserIds, friendIds, viewerId, nameLookup)` for
  ekskludering/skjæring/cap — testbar uten DB.

**Presentational `components/games/SocialProofLine.tsx`** (Type C): tar ferdige props
(`joinedCount`, `knownFriendNames`, `knownFriendOverflow`) + i18n-strenger; rendrer venn-linje
når navn finnes, ellers aggregert antall, ellers `null`. `tabular-nums` på tall.

**Flater:**
1. **Innlogget `signup/[shortId]` (påmeldings-grenen):** render `SocialProofLine` over/under
   skjemaet — venn-linje ved gjensidige venner, aggregert antall ellers, ingenting ved 0.
2. **Anon `PublicLandingView`:** aggregert antall vises alt. Eneste #1193-delta: ikke render
   noe ved `count === 0` (guardrail) — dagens `emptyRoster`-linje er separat #1022-copy;
   Claude's Discretion om den skal bevares eller dempes.
3. **Finn turneringer (innlogget):** per kort i `HomeDiscoverySection`, vis `SocialProofLine`
   — batch social-proof for de listede spillene (én venne-oppslag + roster-oppslag).
4. **#1169-kortet (betinget):** hvis #1169 er bygget, legg venn-linja på `InviteContextCard`;
   ellers noteres som utestående (leveres når #1169 lander).

## Edge Cases & Guardrails

- **0 påmeldte (ekskl. deg selv) → ingenting.** Ingen «Ingen har meldt seg på»-variant fra
  #1193. Viewer er eneste påmeldte → `joinedCount = 0` → ingenting.
- **Store spill:** «Jonas og N andre du kjenner er med» — cap navn på 1-2, rest som antall.
- **Gjensidighet er ekte gjensidig:** `getFriendIds` gir kun `accepted` (bidireksjonell rad) —
  pending/utgående forespørsler teller ALDRI.
- **Spilleren selv ekskluderes** fra `joinedCount` og fra `knownFriendNames`.
- **Ingen råvenneliste til klienten:** kun ferdig-resolverte antall + capped navn forlater
  helperen (RLS-grensen er server-side skjæring, jf. felt-whitelist-mønsteret).
- **Ingen oppblåsing:** tallene er ekte roster-tall; ingen «join now»-FOMO. Sporty
  kompis-tone.

## Key Decisions

- **Venn-navngitt signal kun for innloggede med gjensidig relasjon; aggregert antall for anon /
  uten relasjon; ingenting ved 0** (eier).
- **Gjensidige venner = `getFriendIds` (accepted friendships)** — ingen ny graf-regel, gjenbruk
  eksisterende resolver.
- **Server-side skjæring, admin-client + felt-whitelist** — samme grense som roster/discovery;
  ingen ny RLS-policy/RPC.
- **Plakaten (anon) endres minimalt** — aggregert antall er alt der; kun 0-tilstanden er en
  guardrail.

**Claude's Discretion:**
- Navn-cap (1 vs. 2 navn før «+N andre») og eksakt ICU-copy (humaniseres) — «Jonas og 2 andre
  du kjenner er med» / «Jonas og Kari er med» / «3 har blitt med».
- Om anon-plakatens `emptyRoster`-linje bevares (#1022-copy) eller dempes for å oppfylle
  0-guardrailen mest mulig rent.
- Batch-strategien i Finn turneringer (ett samlet oppslag vs. per kort).
- Plassering av linja på påmeldings-siden (over skjema vs. under tee-off/roster).
- Om #1169-delen leveres i denne PR-en (hvis #1169 er merget) eller noteres utestående.

## Success Criteria

- [x] Innlogget besøkende med ≥1 gjensidig venn påmeldt et spill ser venn-navngitt linje
      («Jonas …») på påmeldings-flaten og i Finn turneringer — staging-klikkrunde.
      → `SocialProofLine` på signup-header ([page.tsx](app/[locale]/signup/[shortId]/page.tsx)) +
      per funn-kort ([HomeDiscoverySection.tsx](app/[locale]/HomeDiscoverySection.tsx)); staging-verifisert:
      «Bjørn B. er med» på både `/signup/<id>` og hjem-discovery (PR #1227-kommentar).
- [x] Innlogget uten relasjon / anonym ser kun aggregert antall; **ved 0 påmeldte vises
      ingenting** (verifisert på plakat + påmeldings-flate).
      → anon `viewerUserId=null` → `buildSocialProof` gir tom navneliste; `joinedCount===0` → `SocialProofLine`
      returnerer `null`; plakat 0-tilstand rendrer ingenting ([PublicLandingView.tsx](app/[locale]/signup/[shortId]/PublicLandingView.tsx)). Type A + Type C-dekket.
- [x] Tallene er ekte (roster-count ekskl. seg selv); venner er kun `accepted` gjensidige;
      pending teller aldri — Type A-dekket.
      → 12 Type A-cases i [socialProof.test.ts](lib/games/socialProof.test.ts) (self-eksklusjon, dedup, skjæring, anon).
- [x] Klienten mottar aldri rå venneliste — kun resolverte antall + capped navn (diff-review).
      → `getGameSocialProof` returnerer kun `{joinedCount, knownFriendNames, knownFriendOverflow}`; `user_id`
      + venneliste brukes bare serverside til skjæring ([getGameSocialProof.ts](lib/games/getGameSocialProof.ts)). Login-kortet får kun `joinedCount` (strukturelt navn-fritt).
- [x] Maks én Type C-rendertest på `SocialProofLine` (venn / aggregert / null-grener); ingen
      norsk copy i test.
      → [SocialProofLine.test.tsx](components/games/SocialProofLine.test.tsx) — 3 grener, asserter på testid + interpolerte tall/navn.
- [x] Copy i `no.json` + `en.json` (catalogParity grønn), norsk humanizer-kjørt.
      → ny `socialProof`-ns i begge kataloger; catalogParity grønn; humanizer-skillet kjørt (ingen tells).

## Gates

- [x] `npx tsc --noEmit` grønn · `npm run lint` grønn (0 errors) · `npm run build` grønn.
- [x] `npx vitest run lib/games` (ny helper + Type A-kjerne) grønn.
- [x] Bruker-synlig → staging-klikkrunde av flyt 2 (påmeldings-flate + Finn turneringer + plakat + kontekstkort) — staging-verifisert (PR #1227-kommentar).
- [x] `feat` → MINOR-bump (1.197→1.198) + CHANGELOG Funksjoner-rad; alle commits `Refs #1193`.

## Files Likely Touched

- `lib/games/getGameSocialProof.ts` (+ Type A-test) — NY: batch venn/antall-resolver + ren kjerne
- `components/games/SocialProofLine.tsx` (+ Type C-test) — NY presentational
- `app/[locale]/signup/[shortId]/page.tsx` — venn-linje på innlogget påmeldings-gren
- `app/[locale]/signup/[shortId]/PublicLandingView.tsx` — 0-tilstands-guardrail (minimal)
- `app/[locale]/HomeDiscoverySection.tsx` (+ evt. `getDiscoverableGames`) — social proof per kort
- (betinget) `app/[locale]/(auth)/login/_components/InviteContextCard.tsx` — hvis #1169 bygget
- `messages/no.json` + `messages/en.json` — `signup.socialProof*` / discover-namespace
- `package.json` + `CHANGELOG.md`

## Out of Scope

- Anon-lista (#1185) utover aggregert antall — eier: kun antall.
- Klubb-medlemskap som eget sosialt-bevis-signal (issuet nevner det; hold til venne-grafen i v1).
- Sømløs innlogging (#318); endring av roster-formateringen (#1022).
- Oppblåsing / kunstige tall / countdown-FOMO.
