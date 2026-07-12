# Spec: Avstand til green — crowdsourcet green-pinning (#1210)

**Issue:** [#1210](https://github.com/jdlarssen/golf-app/issues/1210) · eier-godkjent design: `docs/superpowers/specs/2026-07-10-avstand-til-green-design.md` (board-slice «ren pinning, én avstand», 2026-07-10) · hva-er-nok §-pull (docs/hva-er-nok.md:57)
**Type:** `feat` → MINOR-bump + CHANGELOG Funksjon-rad

## Problem

Spillerne mangler avstand til green uten klokke/laser. Score-tastingen skjer på/ved greenen —
det øyeblikket crowdsourcer green-senteret: ett-trykks pin, medianen per hull blir senteret, og
hullskjermen viser «~X m til green» fra spillerens GPS. Suksessmål: flere app-åpninger per runde.

## Research Findings

- **HoleHero-slots** ([components/hole/HoleHero.tsx](components/hole/HoleHero.tsx)): midt-kolonnen
  `contextLine` (linje 154, #639) er opptatt av modus-bannere (Wolf/Skins/RR/Florida,
  HoleClient.tsx:762-794); høyre kolonne (155-165) har `puttsToggle` + Par + indeks-linja
  (`hullIndex`-copy «indeks {si}», messages/no.json:1900).
- **Score-lagret-øyeblikket:** `onSetScore` i [HoleClient.tsx:643-655](app/[locale]/games/[id]/holes/[holeNumber]/HoleClient.tsx);
  `onSetPutts` (664-675) holdes utenfor chip-trigger. `SyncStatusLine` nederst i kort-lista
  (~997-1003) er chipens naturlige nabolag. `key={holeNumber}` på wrapper (page.tsx:734)
  remounter HoleClient per hull → gratis `watchPosition`-restart/-cleanup.
- **Geolocation og `useOnline`-hook finnes ikke i repoet** (grep = 0 treff) — bygg inline-sjekker.
- **Migrasjonsmønster:** [0119_game_reactions.sql](supabase/migrations/0119_game_reactions.sql)
  har samme policy-STRUKTUR (SELECT/INSERT/DELETE-egen-rad, ingen UPDATE — kommentert 0119:81).
  Selve 0119-uttrykkene er deltaker-scopede og skal IKKE kopieres; Design §1 staver green_pins-
  policyene. Siste migrasjon lokal + origin/main: 0141 → **neste = 0142**.
- **⚠️ ALDRI composite-FK til `course_holes`:** bane-redigering gjør delete+reinsert av
  `course_holes` i RPC `update_course_with_layout`
  ([edit/actions.ts:70-90](app/[locale]/admin/courses/[id]/edit/actions.ts)) — en FK dit m/
  CASCADE sletter ALLE pins ved hver «Lagre». FK går til `courses(id)`, hullnr = CHECK 1..18.
- **Konto-sletting er soft delete:** `anonymize_user` (0131:100-153) sletter aldri `users`-raden
  (kun UPDATE-scrub av navn/e-post/hcp, 0131:123-134) → `ON DELETE SET NULL` fyrer ALDRI der.
  0142 må re-definere funksjonen m/ green_pins-nulling
  (`update public.green_pins set user_id = null where user_id = p_user_id;`).
- **i18n:** hullskjerm-copy under `holes` i `messages/no.json`; `catalogParity.test.ts` krever
  leaf-paritet no/en. `gen:types` leser PROD (package.json:11) — staging-typer interim.

## Prior Decisions

- **#639/#939/#1172:** header-raden er en bevisst plasskamp — nye elementer tuckes inn via
  valgfri slot-prop, aldri ny full-bredde rad. `TOTAL_HOLES` (lib/games/deliveryStatus.ts) = 18.
- **#1194-mønsteret:** ren I/O-fri `lib/`-funksjon, `it.each`-tabell rett fra designdok, maks
  én Type C-rendertest, avledet on-read framfor materialisering.
- **Designdok binder over issue-body** (< 1 km-skjul, 30 m-avvisning, CHECK, fetch-arkitektur).
  **#1012:** dugnadsdata overlever sletting, sporbarheten ikke.

## Design

1. **DB (0142_green_pins.sql, mønster 0119):** `green_pins` — `id` uuid pk gen_random_uuid();
   `course_id` uuid not null FK `courses(id)` ON DELETE CASCADE; `hole_number` int not null
   CHECK 1..18; `lat`/`lng` double precision not null CHECK -90..90 / -180..180; `accuracy_m`
   real null CHECK (null eller >= 0); `user_id` uuid null FK `users(id)` **ON DELETE SET NULL**;
   `created_at` timestamptz **not null** default now() (designdok:44). Index
   `(course_id, hole_number)`. RLS: SELECT `to authenticated using (true)`; INSERT
   `with check (user_id = auth.uid())` (blokkerer også NULL-user_id); DELETE kun egen rad;
   **ingen UPDATE-policy** (trap 3, kommentér som 0119:81).
   **Kolonne-privilegier (presence-vern):** `user_id` skal IKKE være klient-lesbar — revoke
   select fra `authenticated`, grant select på kolonnelisten uten `user_id` (rå pins m/ hvem-
   var-hvor er ellers en presence-flate; klienten trenger aldri user_id, medianen regnes
   server-side).
   **Gate-backstop (trap 4, to hjem + paritetstest):** BEFORE INSERT-trigger `green_pins_gate`
   avviser insert når antall pins nyere enn `PIN_GATE_WINDOW_DAYS` for `(course_id,
   hole_number)` allerede er ≥ `PIN_GATE_MAX_PINS` — DB-hjemmet som stopper hostile masse-
   insert fra å flytte medianen; konstantene speiles fra `pinRules.ts` med paritetstest
   (0119-mønsteret: DB er ytre vakt).
   Samme fil: re-definer `anonymize_user` m/ green_pins-nulling — baser på 0131-definisjonen
   (den eneste; verifisert ingen 0132–0141-redefinering), oppdater også `comment on function`
   (0131:155-162) så DB-dokumentasjonen forblir sann; CREATE OR REPLACE bevarer grants;
   0 berørte pins-rader er legitimt der (bruker uten pins) — ingen `expectAffected`.
2. **`lib/geo/`** (ren TS, TDD Type A): `distance.ts` (haversine, meter), `greenCenter.ts`
   (median av lat og lng hver for seg; null ved 0 pins), `pinRules.ts` (`MAX_PIN_ACCURACY_M = 30`,
   `MAX_DISPLAY_DISTANCE_M = 1000`, `PIN_GATE_MAX_PINS = 3`, `PIN_GATE_WINDOW_DAYS = 30` —
   TS-hjemmet, importeres av klient og server-action; gate-konstantene speiles i DB-triggeren
   med paritetstest) + `shouldShowDistance(distanceM)` (ren funksjon for ≤ 1 km-terskelen, egen
   `it.each`-rad — så visningsterskelen har et testhjem og ikke bor løst i klientkomponenten).
3. **Henting:** hull-page.tsx fetcher hullets pins server-side parallelt med course-slimfetchen;
   pins er course-data, UTENFOR `game-${id}`-cachen. Props: `greenCenter` (ferdigregnet,
   `{lat,lng} | null`) + `freshPinCount`.
4. **Visning:** ny valgfri `distanceLine?: ReactNode`-slot i HoleHero, rendret i høyre kolonne
   rett under indeks-linja (kolliderer aldri med contextLine, null vertikal plass).
   Klientkomponent i HoleClient: første gang «Vis avstand»-tekstknapp → `watchPosition`
   (utløser prompten); granted huskes (localStorage) så senere hull starter automatisk —
   MEN watchPosition-error ETTER granted-flagg (iOS PWA kan re-prompte/stoppe stille) skal
   falle grasiøst tilbake til «Vis avstand»-knappen, aldri stille tomrom. Viser «~X m til
   green»; skjules når `shouldShowDistance` sier nei (> 1 km) eller uten posisjon/senter.
   Ryddes ved unmount, pauses ved `visibilitychange: hidden`.
5. **Pinning:** chip «Står du ved greenen? Lagre punkt» ved SyncStatusLine-plassen; vises når
   (a) minst ett `onSetScore`-kall på hullet denne økten — ALLE kall tastes av brukeren selv
   (`enteredBy: myUserId`, HoleClient.tsx:649-650), så vilkåret er format-agnostisk og fyrer
   også i team-collapsed-modi der kortets `playerId` er lag-representantens, ikke ens egen
   (HoleClient.tsx:305-311, #1058-fella — `playerId === myUserId` ville ekskludert
   ikke-kapteiner i Texas-familien/alternate-shot/Patsome),
   (b) `freshPinCount < 3` (server-talt ved page-load), (c) `navigator.onLine`. Trykk →
   `getCurrentPosition({ enableHighAccuracy: true })` → server-action → insert m/ `expectAffected`
   → takk, chip borte. Accuracy > 30 m ELLER mangler → «GPS-signalet er for svakt akkurat nå»
   (server-action autoritativ, klienten pre-sjekker samme konstant; DB-triggeren er ytre vakt).
   **Server-action bruker `getServerClient` (user-scoped) — ALDRI `getAdminClient`** (ville
   bypasset akkurat den RLS-en testen asserter); `user_id` håndheves av `with check
   (user_id = auth.uid())`, aldri fra klient-payload. Ingen Dexie-/sync-kø-endring.
6. **i18n:** ny nøkkelgruppe `holes.distance` i `no.json` + `en.json` (copy via humanizer).

## Edge Cases & Guardrails

- Type A-tabellen fra designdok §Edge-cases er testgrunnlaget (0/1/2 pins, outlier, duplikat,
  0 m, > 1 km, lat/lng-grenser, dateline N/A) — `it.each` i `lib/geo/*.test.ts`.
- Permission denied: «Vis avstand»-knappen består m/ kort hint; chip-trykk med denied →
  avvisnings-copy, ingen krasj, ingen retry-løkke.
- Chip-gaten evalueres server-side ved page-load; stale i løpet av runden er akseptert (verste
  fall pin #4 samme dag — harmløst, append-only). Gaten teller kun pins nyere enn 30 dager:
  hullplassering flytter seg, innsamlingen gjenåpner over tid (løser designdok-spenningen
  «< 3 pins» vs. «flere pins er ønsket data»).
- Aldri lov mer presisjon enn «~» (±5–10 m); aldri ny full-bredde rad i HoleHero; aldri FK til
  `course_holes`; aldri UPDATE-policy; prøvespill-demoen (`live={false}`) røres ikke.
- hva-er-nok-raden for #1210 finnes allerede på main (39a75c65, docs/hva-er-nok.md:57) —
  ikke re-skriv, ingenting å committe der.

## Key Decisions

- **Plassering = egen `distanceLine`-slot i høyre kolonne** (ikke contextLine-slotten,
  som er opptatt i Wolf/Skins/RR/Florida — avstanden er format-uavhengig).
- **Gate-regelen har to hjem med paritetstest** (pinRules.ts + `green_pins_gate`-triggeren,
  trap 4 / 0119-mønsteret «DB er ytre vakt») — det stopper hostile masse-insert fra å flytte
  medianen. **Accuracy-taket (30 m) forblir ett hjem** (server-action; DB-CHECK kun sanity
  >= 0): spam INNENFOR gaten er akseptert designrisiko — reelle grunner: eier-akseptert
  (designdok:47), invitasjons-gated brukermasse, lav skade, service-role kan rydde. (Ikke
  «medianen er robust» — den tåler ikke antalls-styrt flytting; det er gaten som gjør jobben.)
- **Chip vises før tillatelse er gitt** (trykk utløser prompten); denied håndteres i
  avvisnings-stien, chip skjules ikke pre-emptivt via Permissions API i v1.
- **DELETE-RLS er policy-only i v1** — ingen angre-UI (holder døra åpen billig).
- **`anonymize_user`-utvidelsen er del av 0142** — uten den er ON DELETE SET NULL død kode
  i den eneste reelle sletteflyten (soft delete, jf. Research Findings).

**Claude's Discretion:** chip-/knapp-utforming og all copy (humanizer); localStorage-nøkkel;
om `watchPosition` også pauses ved `blur`; avrunding (hel meter vs. nærmeste 5 m, innafor
«~»-løftet); filnavn i `lib/geo/`; Type C-testens innretning (vises/skjules på senter-prop).

## Success Criteria

1. `green_pins` finnes på staging med RLS-settet over; ny `supabase/tests/green_pins_rls_test.sql`
   asserter: SELECT ok (uten `user_id`-kolonnen — kolonne-privilegiet testes), INSERT m/
   forfalsket `user_id` blokkeres, INSERT m/ `user_id` NULL blokkeres, anon-rollen har null
   tilgang, UPDATE blokkeres totalt, DELETE av andres pin blokkeres, og insert nr. 4 innenfor
   vinduet avvises av `green_pins_gate` (`npm run test:rls`; CLI-SKIP → `VERIFICATION GAP:
   test:rls not run`).
2. `lib/geo/distance.test.ts` + `greenCenter.test.ts` + `pinRules.test.ts` dekker designdok-
   edge-tabellen (`it.each`), inkl. `shouldShowDistance`-terskelen (≤/> 1 km) og paritetstesten
   gate-konstanter TS ↔ DB-trigger — alle grønne.
3. Hull med ≥ 1 pin viser «~X m til green» når posisjon finnes og avstand ≤ 1 km; hull uten
   pins viser ingen linje; nøyaktig ÉN Type C-rendertest låser vises/skjules på senter-prop
   (terskellogikken er Type A-testet i `shouldShowDistance`, ikke i rendertesten).
4. Pinning ende-til-ende på staging: score tastet → chip → trykk → rad i `green_pins` m/
   riktig `course_id`/`hole_number`/`user_id` (SELECT-verifisert); accuracy > 30 m avvises;
   offline → chip vises ikke. Verifiser OGSÅ at chippen vises i ett team-collapsed-spill
   (f.eks. Texas scramble) etter tasting — triggeren er tastings-økten, ikke `playerId`.
5. `anonymize_user` på staging nuller `green_pins.user_id`; pin-raden består (SELECT før/etter).
6. `catalogParity` grønn (no+en), norsk copy humanizer-kjørt; MINOR-bump + CHANGELOG
   Funksjon-rad; alle commits `Refs #1210`.

## Gates

- `npx tsc --noEmit` · `npm run lint` · `npm run build` — alle grønne (exit 0) · co-located
  vitest for endrede filer + `catalogParity` + evt. berørte HoleHero-/HoleClient-tester
- Migrasjon: **staging først via Supabase MCP → verifiser → prod KUN etter eksplisitt eier-luke**
  (`touch .claude/approve-prod`, #1074). Typer interim fra staging (gen types mot
  `snwmueecmfqqdurxedxv` eller hand-extend); `npm run gen:types` etter prod-påføring.
- Staging-klikkrunde av hullskjerm + pinning før merge; bevis + label på PR-en (#1076).
  **KAN verifiseres uten iPhone:** permission-prompt, watchPosition, avstandsvisning, chip-insert
  — via Playwright `context.setGeolocation()` + `permissions: ['geolocation']` (ad-hoc drive,
  IKKE committet e2e; preview-MCP kan ikke drive React-interaksjoner, #1219).
  **VERIFICATION GAP:** ekte GPS-nøyaktighet og batteri på iPhone PWA på banen — OG
  permission-persistens/auto-start i iOS PWA-standalone (localStorage-flagget kan si granted
  mens iOS re-prompter eller stopper stille mellom launches; Playwright-geolocation
  verifiserer web-flyten, ikke PWA-shell-persistensen). Design §4s grasiøse fallback til
  «Vis avstand»-knappen er kravet som gjør gapet trygt — eier tester på banen.

## Files Likely Touched

- `supabase/migrations/0142_green_pins.sql` + `supabase/tests/green_pins_rls_test.sql`
- `lib/geo/distance.ts` + `greenCenter.ts` + `pinRules.ts` (m/ `shouldShowDistance`) (+ tester)
- `components/hole/HoleHero.tsx` (`distanceLine`-slot) + ny distanse-/chip-komponent(er)
- `app/[locale]/games/[id]/holes/[holeNumber]/page.tsx` (pins-fetch) + `HoleClient.tsx`
  + ny server-action for pin-insert (ved holes-ruta eller `lib/`-helper)
- `messages/no.json` + `en.json` · `lib/database.types.ts`
  · `package.json` + `package-lock.json` + `CHANGELOG.md`

## Out of Scope

- Forkant/bakkant, tee-punkter, bunkere · OSM-import/-polygoner (V2-trigger: pins fra ≥ 2
  brukere på ≥ 2 baner, målbart i `green_pins`) · dedikert kartleggingsmodus
- Prøvespill-demoen · telemetri-rigg for app-åpninger · angre-/slette-UI for pins (policyen
  finnes, UI-en ikke) · offline-pinning/Dexie · ny e2e (Type D) · flytdiagram-oppdatering
