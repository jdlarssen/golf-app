# Spec: Myk profilgate — vis spillet før profilskjemaet (#1176)

**Issue:** [#1176](https://github.com/jdlarssen/golf-app/issues/1176) · UX-psykologi: resiprositet · søsken til #1169 · Tier 1 vekstsløyfa
**Type:** `feat` → MINOR-bump + CHANGELOG Funksjon-rad

## Problem

Etter OTP-innlogging sendes en ny game-invitert spiller til `/complete-profile` FØR de får
se spillet: `verifyCode` redirecter via `/complete-profile?next=<gameDest>` når profilen er
ufullstendig ([login/actions.ts:444-448](app/[locale]/(auth)/login/actions.ts)). Sammen med
#1169 er dette den doble veggen: kode-vegg uten kontekst, så skjema-vegg uten kontekst.
Spilleren skal se spillet/leaderboardet først; navn/HCP hentes når de faktisk trengs (scoring).

## Research Findings

- **Spill-flatene har INGEN profilgate i dag** (grep `complete-profile|profile_completed_at`
  under `app/[locale]/games/` = 0 treff). Veggene bor i: `/`
  ([page.tsx:176-178](app/[locale]/page.tsx)), `/profile` (page.tsx:343), signup-visning
  ([signup/[shortId]/page.tsx:172-177](app/[locale]/signup/[shortId]/page.tsx)),
  registrerings-actions (actions.ts:119, teamActions.ts:143), venne-invite
  (invite/actions.ts:63) og verifyCode-detouren over.
- `verifyCode` inserter `game_players` for solo game-scoped invitéer FØR profilen finnes
  ([login/actions.ts:332-361](app/[locale]/(auth)/login/actions.ts)) — profil-løse rader i
  roster finnes altså allerede i dag; leaderboard har `unknownPlayer`-fallback
  ([leaderboardContent.tsx:385](app/[locale]/games/[id]/leaderboard/leaderboardContent.tsx)).
- `users.hcp_index` er NOT NULL `number` (database.types.ts:1708) — placeholder-raden har en
  verdi før profilfullføring. `startScheduledGame` regner `course_handicap` fra den
  ([startScheduledGame.ts:107-229](lib/games/startScheduledGame.ts)); fullføres profilen
  ETTER start, blir spillerens CH stående feil (ingen recompute finnes i complete-profile).
- Hull-siden leser `me.course_handicap ?? 0` ([holes/[holeNumber]/page.tsx:273](app/[locale]/games/[id]/holes/[holeNumber]/page.tsx));
  `getGameWithPlayers`-selecten har IKKE `profile_completed_at` (getGameWithPlayers.ts:209)
  — egen-profil-sjekk må være en slim egen query (RLS tillater egen rad, jf. `/`-mønsteret).
- `/complete-profile` har allerede `?next=`-videreføring og «ferdig → redirect(next)»
  ([complete-profile/page.tsx:53-72](app/[locale]/complete-profile/page.tsx)).

## Prior Decisions

- **#356:** landings-logikken (gameDest) i verifyCode består — kun detour-leddet endres.
- **#635:** spillere uten score ranker sist — en profil-løs tilskuer ødelegger ikke tavla.
- **#1169:** kontekstkort før koden; denne kontrakten fortsetter samme prinsipp etter koden.

## Design

Prinsipp: **se alt, gjøre krever profil.** Lesing slipper gjennom; mutasjoner gater.

1. **verifyCode:** fjern detour-leddet — redirect rett til `gameDest` (både solo `/games/[id]`
   og team `/signup/[shortId]/team`). `profileIncomplete`-variabelen og #356-logikken ellers
   består.
2. **Spill-hjem (`games/[id]/(home)/page.tsx`):** slim egen-profil-query; ufullstendig →
   sticky/topp-stripe «Fullfør profilen for å taste slag» med lenke
   `/complete-profile?next=/games/[id]`. Vises for medlemmer med `profile_completed_at IS NULL`.
3. **Hard gate ved scoring (NY):** `holes/[holeNumber]/page.tsx` redirecter profil-løse til
   `/complete-profile?next=<hull-URL>`. Dette LUKKER også dagens direkte-URL-hull (scoring
   med placeholder-handicap). Scorekort-/submit-sidene: samme sjekk (builder verifiserer om
   de er nåbare uten scores; gate defensivt).
4. **Signup-visning:** fjern redirecten i `signup/[shortId]/page.tsx:172-177` så innloggede
   profil-løse SER siden; registrerings-actions (actions.ts:119, teamActions.ts:143) beholder
   gaten sin (påmelding = mutasjon som eksponerer navn).
5. **CH-recompute:** `completeProfile`-action oppdaterer `course_handicap` for brukerens
   `game_players`-rader i `active` spill der CH allerede er satt (gjenbruk formelen fra
   `lib/scoring/courseHandicap.ts` + tee-data slik `startScheduledGame` gjør, kun for én
   spiller). Uten dette gir myk gate + sen fullføring feil handicap hele runden.
6. **Uendret:** `/`- og `/profile`-redirectene består (ingen spillkontekst å vise der),
   venne-invite-gaten består, admin-flater urørt (gates på `is_admin`).

## Edge Cases & Guardrails

- **Aldri fullført profil:** kan se spill/leaderboard for alltid, kan ikke taste/melde seg på.
  Roster/leaderboard viser fallback-navn — verifiser at spill-hjem-roster og spillere-siden
  tåler `name = NULL` (leaderboard gjør det allerede).
- Team-scoped invité lander på `/signup/[shortId]/team` uten profil — siden må vise, attach-
  action gater (samme prinsipp; builder verifiserer team-sidens page-nivå-gate).
- Stripe skal ikke vises for spillere med fullført profil, gjester eller på finished spill
  (der er det ingen slag å taste — men lenken skader ikke; discretion).
- Recompute må aldri røre `finished` spill eller rader med `course_handicap IS NULL`
  (ikke-startede spill får CH ved start som i dag). 0-row update = OK her (ingen aktive spill).
- Redirect i `holes` må skje FØR tunge fetches (billig slim query først).

## Key Decisions

- **Adoptert fra issuet:** myk stripe i stedet for hard redirect; navn/HCP hentes ved første
  scoring — hull-siden ER porten.
- **`/` beholder redirect:** uten spillkontekst er profilskjemaet fortsatt riktig landing;
  issuet gjelder spilleren som HAR et spill å se.
- **CH-recompute ved fullføring** er i scope: uten den er den myke gaten en scoring-feilkilde.

**Claude's Discretion:** stripe-plassering/utforming (Banner vs. egen komponent) og copy
(humanizer-pass); om primær-CTA på spill-hjem peker på profilskjemaet eller hullet når
profilen mangler; om scorecard/submit trenger egen gate eller arver via hull-porten;
recompute-implementasjonens plassering (helper i `lib/games/`).

## Success Criteria

- [ ] Staging-klikkrunde: inviter fersk e-post game-scoped → OTP-login → lander RETT på
      spill-hjem (ingen `/complete-profile`-mellomstopp), ser leaderboard + stripe.
- [ ] Profil-løs på `/games/[id]/holes/1` → redirect til `/complete-profile?next=…` →
      fullfør → lander tilbake på hullet og kan taste (staging).
- [ ] Stripe borte etter profilfullføring; `/` uinvolvert (redirecter fortsatt profil-løse).
- [ ] CH-recompute: Type A-test på recompute-logikken (aktiv-spill-rad oppdateres, finished/
      NULL-rader urørt); `expectAffected`/row-count-disiplin på writes.
- [ ] Roster + leaderboard rendrer fallback for profil-løs spiller (ingen tom/knekt rad) —
      verifisert på staging.
- [ ] Eksisterende gates uendret: signup-/team-actions-tester grønne uten endring i
      forventningene sine; venne-invite-gate består.

## Gates

- [ ] `npx tsc --noEmit` grønn · `npm run lint` grønn · `npm run build` grønn
- [ ] Co-located vitest for endrede filer grønn (login/actions.test.ts oppdatert for ny
      redirect-forventning; ny Type A for recompute)
- [ ] Staging-klikkrunde av hele invitert-spiller-flyten FØR merge (kriterium 1–2)
- [ ] Ny norsk copy humanizer-kjørt; `messages/no.json`+`en.json` i paritet
- [ ] feat-commit: MINOR-bump + CHANGELOG Funksjon-rad; alle commits `Refs #1176`

## Files Likely Touched

- `app/[locale]/(auth)/login/actions.ts` (+ `.test.ts`) — verifyCode-detour fjernes
- `app/[locale]/games/[id]/(home)/page.tsx` (+ stripe-komponent) — myk gate
- `app/[locale]/games/[id]/holes/[holeNumber]/page.tsx` — hard gate
- `app/[locale]/games/[id]/scorecard|submit/page.tsx` — evt. defensiv gate
- `app/[locale]/signup/[shortId]/page.tsx` — visnings-redirect fjernes
- `app/[locale]/complete-profile/actions.ts` + ny `lib/games/`-recompute-helper (+ test)
- `messages/no.json` + `messages/en.json` — stripe-copy
- `package.json` + `CHANGELOG.md`

## Out of Scope

- Kontekstkort på /login (#1169) og frist-visning (#1179)
- Inline profilskjema PÅ spill-siden (v1 = stripe + eksisterende `/complete-profile`)
- Endring av hva profilskjemaet krever (navn + HCP består)
- Gjestespiller-flyten (#1009) og HCP-oppdaterings-prompt (#168)
- Fjerning av `/`-redirecten for profil-løse uten spill
