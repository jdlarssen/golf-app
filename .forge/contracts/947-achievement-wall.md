# Spec: Achievement-vegg + unlock-varsel (#947)

## Problem
Når noen lager en hole-in-one, turkey eller snowman er DET historien fra runden — men appen
gjemmer det i dag som et tikkende heltall i «Mine tall»-pill-stripa på profil-landingen. Det
finnes ingen per-runde-varsel når en bragd inntreffer, og ingen dedikert badge-vegg som feirer
dem visuelt. Detection-logikken finnes allerede og er rik (`countRoundAchievements`), så gapet
er ren overflate: et varsel i avslutnings-øyeblikket + en vegg å vise dem på.

Issue: #947 (milestone «Runde 2», `area:ui`, effort M). Bygger videre på stats-momentumet
fra #936/#940/#941 (#946 sesong-recap deler allerede `lib/stats/achievements.ts`).

## Prior Decisions (carried forward)
- **Stats-HUB = `/profile/historikk`** (#936/#940 IA, cementert): personlig statistikk er
  seksjoner i historikk-sidens «Statistikk»-fane, IKKE i «Mine tall» på profil-landingen.
  → Badge-veggen blir en ny seksjon i Statistikk-fanen. (Ikke re-litigér plassering.)
- **Detection har ÉN hjemmel** (`lib/stats/achievements.ts`, #946-uttrekk): brutto mot kjønns-par,
  format-/handicap-uavhengig. Gjenbrukes uendret — ingen ny detection-logikk.
- **Notification-systemet er polymorft** (`notifications`-tabell + `kind`-CHECK): nye kinds legges
  til via drop/re-add av `notifications_kind_check` (mønster 0069/0079/0094) + zod-skjema +
  uttømmende switch i `cardContent.ts` og `deeplink.ts`. Web Push får teksten gratis
  (`sendPush` gjenbruker `buildNotificationText` + `notificationDestination`).
- **Varsel ved spill-avslutning** er etablert mønster: `notifyPlayersGameFinished` +
  `persistResultSummaries` + `persistScoreDifferentials` fyres best-effort fra BÅDE `endGame`
  (`admin/games/[id]/actions.ts:431`) og `endGameWithSideWinners` (`.../avslutt/actions.ts:52`).

## Research Findings
Ingen nye eksterne biblioteker. Bygger 100% på interne mønstre som allerede er verifisert i koden:
- Next.js 16 `revalidateTag('notifications-${userId}', 'max')` (to-arg-form) er allerede brukt
  korrekt i `lib/notifications/notify.ts` — gjenbrukes via `notify()`.
- `web-push` er allerede bekreftet kind-agnostisk: `sendPush.ts:35-36` henter title/detail/url fra
  `buildNotificationText` + `notificationDestination`, så en ny kind trenger INGEN push-spesifikk
  wiring utover de to switch-ene.

## Design

### A. Unlock-varsel (per runde, ved avslutning)

**Notable moments (besluttet):** hole-in-one, eagle, turkey, snowman. Birdie ekskluderes
(for vanlig → innboks-spam). Snowman er et «moment», ikke en bragd — copy må tåle begge toner.

**Ren beslutnings-helper (Type A, TDD):** ny pure funksjon — `selectNotableMoments(a: Achievements)`
i `lib/stats/achievements.ts` (samme hjemmel som detection) som returnerer
`Array<{ kind: 'hole_in_one' | 'eagle' | 'turkey' | 'snowman'; count: number }>` (kun count > 0,
birdie aldri med, stabil rekkefølge: hole-in-one → eagle → turkey → snowman).

**Ny notification-kind `achievement_unlocked`:**
```ts
// payload
{ game_id: uuid, game_name: string,
  moments: Array<{ kind: 'hole_in_one'|'eagle'|'turkey'|'snowman'; count: number }> } // min 1
```
- **Recipient + bundling (besluttet):** KUN spilleren som tjente bragden, ÉN samlet varsel per
  runde som oppsummerer alle hens moments. Ingen flight-broadcast (utsatt til delbart kort #942).
- **`cardContent.ts`:** ny case komponerer locale-aware tekst fra `moments`. Nøytral paraply-tittel
  som dekker både feiring og snowman (f.eks. «Øyeblikk fra runden»); detail lister momentene +
  spillnavn (f.eks. «Hole-in-one og Turkey i {gameName}», med « ×N» når count > 1).
- **`deeplink.ts`:** → `/profile/historikk` (lander på Statistikk-fanen der veggen bor).

**Fire-helper (ny, `lib/games/notifyAchievementUnlocks.ts`):** best-effort, kalt fra begge
endGame-stiene rett etter status-flip (ved siden av `notifyPlayersGameFinished`). Henter per
spiller: `game_players.tee_gender` + `course_holes` kjønns-par + `scores` (speiler `getMyStats`
i `profile/page.tsx`, men for alle spillere i ÉTT spill). For hver ikke-trukken spiller:
`countRoundAchievements` → `selectNotableMoments` → hvis ikke-tom, `notify({ kind:
'achievement_unlocked', ... })`. Bruker admin-client (som `notify`), `Promise.allSettled`,
`console.error`-prefiks `[notifyAchievementUnlocks]`. Feil blokkerer ALDRI avslutningen.

### B. Badge-vegg (seksjon i `/profile/historikk` → Statistikk-fane)

Ny presentasjons-komponent `components/stats/AchievementWall.tsx` som tar livstids-`Achievements`
og rendrer ALLE FEM badge-typer (hole-in-one, eagle, birdie, turkey, snowman) som en vegg/grid:
ikon/emoji + label + livstids-antall (`tabular-nums`). Opptjente (count > 0) fremheves
(champagne-gold-aksent kun til highlights, per palett); ikke-opptjente (count 0) dimmes/grås
(aspirasjons-følelse — «samling å fullføre»). Mobil-først, tap-targets ≥44px.

Plasseres i Statistikk-fanen i `app/[locale]/profile/historikk/page.tsx` (etter `SeasonRecapPanel`).
Livstids-totalene aggregeres fra de ferdige rundene siden allerede laster (summér per-runde
`countRoundAchievements`, eller gjenbruk `computePlayerStats().achievements`) — ingen ny DB-runde.

**«Mine tall»-pills på profil-landingen forblir uendret** (besluttet) — `MyStatsCard` i
`profile/page.tsx` røres ikke.

## Edge Cases & Guardrails
- **Birdie aldri i varsel** — `selectNotableMoments` har eksplisitt test som asserter dette.
- **Ingen notable moments** → ingen varsel (helper no-op for den spilleren). Vanligste tilfelle.
- **Trukne spillere (WD):** hoppes over i fire-helperen (ofte ufullstendige runder).
- **No-show / `allowMissing`:** spillere uten scorer gir tom moments → naturlig ingen varsel.
- **Dobbel-fyring:** status-flip-guarden (`game.status !== 'active'` → redirect) hindrer re-entry,
  så varselet fyres én gang. (Varselet er ikke idempotent i seg selv — guarden er beskyttelsen.)
- **Uttømmende switch-felle (memory):** ny `NotificationKind`-medlem MÅ treffe hver switch over
  `NotificationKind` (`cardContent.ts`, `deeplink.ts`) OG ev. `Record<NotificationKind, …>`-map,
  ellers feiler `npm run build`. Kjør build, ikke bare `tsc` på enkeltfiler.
- **Snowman-tone:** nøytral paraply-tittel unngår å gratulere med en blunder; humanizer-skill
  polerer endelig norsk copy før commit.
- **Migrasjons-nummer:** neste ledige = `0118`, men verifiser mot `origin/main` før commit
  (parallell-arbeid kan ha tatt nummeret — memory-advarsel).

## Key Decisions
- Notable moments = hole-in-one + eagle + turkey + snowman; birdie ekskludert — balanserer
  feiring mot innboks-spam.
- Achiever-only + bundlet ett varsel per runde — reneste innboks; gruppe-synlighet utsatt til #942.
- Badge-vegg i `/profile/historikk` (stats-HUB IA), «Mine tall»-pills beholdes uendret.

**Claude's Discretion:**
- Eksakt badge-ikonografi (emoji vs SVG), grid-kolonner, og hvor i Statistikk-fanen veggen sitter
  (anbefalt: etter `SeasonRecapPanel`).
- Tittel/detail-ordlyd for varselet (følg brand-stemme; humanizer før commit) og hvordan flere
  moments joines (anbefalt: «, » + « og »/« and », « ×N» kun når count > 1).
- Datakilde for livstids-totaler i veggen (aggregér eksisterende runder vs. `computePlayerStats`).
- Om fire-helperen bor i `lib/games/` (anbefalt, ved siden av `persistResultSummaries`) eller
  `lib/notifications/events.ts`.

## Success Criteria
- [x] Ny `achievement_unlocked` `NotificationKind` med zod-skjema; migrasjon `0118` dropper/re-adder
      `notifications_kind_check` med kinden lagt til. → `lib/notifications/types.ts:8-29,232-258`,
      `supabase/migrations/0118_achievement_unlocked_notification.sql`.
- [x] `selectNotableMoments` (pure, TDD) returnerer hole-in-one/eagle/turkey/snowman, ALDRI birdie;
      stabil rekkefølge; tester grønne. → `lib/stats/achievements.ts:41-67` + 8 nye cases i `.test.ts`
      (inkl. «never reports a birdie» + ace-eagle-collapse). 26/26 grønn.
- [x] Ved avslutning (BEGGE endGame-stier) får hver ikke-trukken spiller med ≥1 notable moment
      nøyaktig ÉTT bundlet `achievement_unlocked`-varsel; best-effort. → `lib/games/notifyAchievementUnlocks.ts`
      + 2 tester (withdrawn-skip, no-moment-skip, korrekt payload); kalt fra `actions.ts` + `avslutt/actions.ts`.
- [x] `cardContent.ts` rendrer locale-aware tittel+detail (no + en nøkler i `messages/`);
      `deeplink.ts` → `/profile/historikk`; uttømmende switch-er + `EMOJI`-Record oppdatert. Build grønn.
- [x] `AchievementWall` viser alle 5 badge-typer, dimmet ved 0, i `/profile/historikk`;
      «Mine tall»-pills uendret (`profile/page.tsx` ikke rørt). → render-test grønn; live-bevis nedenfor.
- [x] Web Push leverer den nye kinden uten egen push-wiring → `sendPush.ts:35-36` henter
      title/detail/url fra `buildNotificationText` + `notificationDestination` (verifisert ved lesing).

## Gates
- [x] `npm run build` passerer (fanger uttømmende-switch/Record-feller) — exit 0, full rute-tre.
- [x] `npm run lint` passerer — 0 errors (2 pre-eksisterende complexity-warnings på exhaustive switch).
- [x] `npx vitest run` grønn på endrede filer + co-located tester — 136/136 (16 filer).
- [x] Preview/staging: badge-veggen rendrer i `/profile/historikk` med ekte seedet data
      (🎯1 🦅1 🐦3 🦃1 opptjent i gull, ⛄0 dimmet) + unlock-varselet rendrer i `/innboks`
      («Øyeblikk fra runden» / «Hole-in-one, Turkey i …», 🏅) og deeplinker til `/profile/historikk`.
      Migrasjon 0118 påført + verifisert på staging; **prod-påføring gjenstår (gated deploy-steg)**.
- [x] Versjons-bump (`feat` → minor, 1.153.1 → 1.154.0) + CHANGELOG Funksjon-rad.

> **Deploy-note:** Migrasjon `0118` er påført staging (verifisert), men prod-påføring ble
> blokkert av prod-deploy-guarden under bygget. Må påføres prod ved/før merge-deploy, ellers
> feiler `notify('achievement_unlocked')` mot prod-CHECKen (additiv widen, 0107-mønster).

## Files Likely Touched
- `supabase/migrations/0118_achievement_unlocked_notification.sql` — ny: kind-CHECK drop/re-add
- `lib/notifications/types.ts` (+`.test.ts`) — union + zod-skjema for `achievement_unlocked`
- `lib/notifications/cardContent.ts` (+`.test.ts`) — switch-case + bundlet tekst-komposisjon
- `lib/notifications/deeplink.ts` (+`.test.ts`) — switch-case → `/profile/historikk`
- `lib/stats/achievements.ts` (+`.test.ts`) — `selectNotableMoments` (pure)
- `lib/games/notifyAchievementUnlocks.ts` (+`.test.ts`) — ny best-effort fire-helper
- `app/[locale]/admin/games/[id]/actions.ts` — kall helper i `endGame`
- `app/[locale]/admin/games/[id]/avslutt/actions.ts` — kall helper i `endGameWithSideWinners`
- `components/stats/AchievementWall.tsx` (+`.test.tsx`) — ny vegg-komponent
- `app/[locale]/profile/historikk/page.tsx` — render vegg-seksjon + aggregér livstids-bragder
- `messages/no.json` + `messages/en.json` — `inbox.kinds.achievementUnlocked.*` + vegg-labels
- `package.json` (+`package-lock.json`) + `CHANGELOG.md` — minor-bump + Funksjon-rad

## Out of Scope
- Flight-/gruppe-broadcast av andres bragder (achiever-only her; gruppe-synlighet via #942).
- Delbart bragd-kort / share-image (#7/#942 — egen kontrakt).
- Nye achievement-typer utover de 5 eksisterende (albatross finnes kun i sideturnering, ikke personlig).
- Endring av «Mine tall»-pills på profil-landingen.
- First-ever-unlock-sporing (varsel fyrer per forekomst i runden, ikke «første gang noensinne»).
