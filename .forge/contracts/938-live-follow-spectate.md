# Spec: #938 — Live-følg / spectate-modus for pågående spill

**Issue:** [#938](https://github.com/jdlarssen/golf-app/issues/938) — Live-følg / spectate-modus
**Epic:** [#951](https://github.com/jdlarssen/golf-app/issues/951) (live + sosial turneringsfølelse) — **fundamentet**; låser opp #24 (push), og spektator-synlighet for #943 (reaksjoner).
**Type:** `feat` (bruker-synlig) → minor-bump + CHANGELOG-Funksjon-rad.

## Problem

I dag er halve feltet usynlig for den andre halvparten til runden er ferdig. Under
et aktivt **live-modus**-spill ser en deltaker bare egen flight (RLS-gatet på
`same_flight_or_solo`) — flight 1 kan ikke se flight 4s netto-stableford mens den
lander. Og en ektefelle/klubbmedlem som vil følge uten å spille har ingen vei inn
i det hele tatt: `scores`/`games`/`game_players` har **null** anonym lese-tilgang.
Resultatet: leaderboardet er en obduksjon, ikke en live-begivenhet. Dette rammer
kjernesløyfa (spill→avslutt).

## Prior Decisions (videreført fra tidligere kontrakter)

- **#943 (emoji-reaksjoner), linje 276:** «Tilskuer-synlighet (ikke-deltakere) —
  avhenger av #938 (spectate-modus).» Dette issuet er den eksplisitte avhengigheten.
- **#598/#610 (delt leaderboard-chrome):** nye flater IMPORTERER de delte
  primitivene + per-format `render*`-funksjoner — ikke copy-paste. Spectate-ruten
  gjenbruker `formats/*`-render-stien, ikke en parallell visning.
- **#679 (live leaderboard):** realtime via `subscribeRealtimeChannel` (eier
  `setAuth`-quirken); leaderboards er server-rendret + refresh-drevet.
- **#942 (del-resultat-kort):** `navigator.share`-mønster finnes
  (`ShareResultButton.tsx`) — del-knappen for live-lenken gjenbruker samme idé.
- **0104/0107 RLS-herding:** nye `SECURITY DEFINER`-helpere MÅ ha `set search_path`;
  kolonne-immutabilitet via UPDATE-triggere. (Ingen ny helper strengt nødvendig her.)
- **Reveal er presentasjonslag, ikke RLS:** `revealState()` + `shouldHideNetto()`
  (`lib/games/visibility.ts`) avgjør server-side hva som vises. Gjenbruk av
  render-stien gir reveal-respekt gratis.

## Eier-beslutninger (denne runden)

1. **Tilgang:** offentlig lenke, **ingen innlogging** (ektefelle/klubbmedlem følger uten konto).
2. **Aktivering:** **opt-in per spill, default av** (privacy-first; oppretter genererer lenken).
3. **Omfang:** **også vri in-app-gating** — i live-modus skal deltakere se *alle* flights live i appen, ikke bare egen flight (i tillegg til den offentlige lenken).
4. **Reveal + levetid:** **respekter reveal-modus** (live-spill = live; reveal-spill holder netto tilbake til avslutning); lenken blir **permanent resultat-permalink** etter avslutning.

## Design

Featuren har **to flater** (begge en del av #938):

### Flate A — In-app cross-flight (RLS-utvidelse, kun live-modus)

I dag, live-modus aktivt: deltaker ser `own ∪ same_flight_or_solo`. Vri dette så
**enhver deltaker i et live-modus, aktivt spill ser ALLE scores** — symmetrisk med
den eksisterende reveal-grenen. Reveal-modus røres ikke (drama bevares).

Migrasjon **0121** utvider `"scores select gating per mode"` med én ny gren
(`to public`, `(select auth.uid())`-form per 0092):

```sql
-- NY gren: live-modus + aktivt + deltaker → alle scores i spillet
OR ( exists (select 1 from public.games g
             where g.id = scores.game_id
               and g.status = 'active'::game_status
               and g.score_visibility = 'live')
     and exists (select 1 from public.game_players gp
                 where gp.game_id = scores.game_id
                   and gp.user_id = (select auth.uid())) )
```

- Ingen UI-endring nødvendig i prinsippet: leaderboard-`page.tsx` rendrer de scores
  RLS returnerer. **Guardrail:** verifiser at ingen *view-lag* same-flight-filter
  også begrenser live-modus (hvis det finnes, må det løftes for live-modus).
- Eksisterende `LeaderboardRealtime` (authed) leverer nå motflight-events automatisk
  fordi RLS slipper dem gjennom — ingen realtime-endring in-app.
- Ikke-deltakere (anon eller innlogget ikke-deltaker) er fortsatt blokkert: ingen
  ny gren slipper dem inn.

### Flate B — Offentlig spectate-lenke (token-gatet public route)

**Token:** ny kolonne `games.spectate_token uuid` (nullable, unik der not null),
satt til `gen_random_uuid()` når oppretteren slår på live-følg, `null` når av.
`null` = funksjonen er deaktivert (lenken dør).

**Aktivering (server-action):** authed server-klient (RLS håndhever at kun
`created_by`/admin kan UPDATE games — eksisterende `games creator/admin update`
policies dekker dette). Sett/nullstill token, assert affected-rows
(`expectAffected`). Ingen ny RLS-policy for games nødvendig.

**Public route** `app/[locale]/spectate/[token]/page.tsx`:
- Legg `spectate` til `PUBLIC_PATH_PATTERN` i `proxy.ts`
  (`/^\/(login|register)$|^\/(legal|signup|spectate)(\/|$)/`).
- Server-component slår opp spillet på `spectate_token` via **admin-klient**
  (RLS-bypass, samme presedens som `getGameWithPlayers` + signup-by-shortId).
  Token ikke funnet / `null` → `notFound()` (404).
- Rendrer leaderboardet **read-only** ved å gjenbruke `formats/*`-render-stien.
  Reveal respekteres automatisk (samme `revealState()`-branching). Etter
  `status='finished'` viser den fulle resultater (permalink).
- **Ingen** score-inntasting (leaderboardet har uansett ingen — det ligger på
  `/hull`), **ingen** reaksjons-interaktivitet (anon har ingen `reactions`-tilgang;
  ikke monter `ReactionsProvider`), **ingen** deltaker-only-chrome (in-app
  tilbake-pil / game-home-nav). En lett spectate-header med banenavn + spillnavn +
  «følger live»/«resultat»-status.
- **Live-oppdatering uten realtime:** anon kan ikke abonnere på `postgres_changes`
  (RLS blokkerer JWT-løse). Bruk en liten klient-øy som poller
  (`router.refresh()` på intervall, ~20s default — Claude's discretion) mens
  `status='active'`; stopp polling når `finished`.

**Del-affordans:** en oppretter/admin-only kontroll som (a) slår live-følg på/av og
(b) viser/deler lenken (`navigator.share` med copy-fallback, #942-mønster). Plassering
= Claude's discretion; anbefalt på game-home (`/games/[id]`, der spillet forvaltes,
jf. «one door per room») med en rask del-knapp på leaderboardet når påslått.

### Datamodell-eksponering

Spectate-flaten viser nøyaktig **samme felter som den in-app live-leaderboarden**
(navn, scores, netto/brutto per reveal-state, banehandicap slik det allerede vises).
Eier har valgt offentlig-uten-login og aksepterer at navn+scores+banehandicap er
synlige for alle med lenken. **Ikke** send hele `PlayerForHole`-objekter (e-post,
timestamps, withdrawn-state) til klienten utover det visningene allerede rendrer.

## Edge Cases & Guardrails

- **Hostile PATCH/anon-probe (AGENTS.md):** ikke-deltaker authed-bruker kan IKKE
  lese andres scores i live-modus (kun deltakere); anon REST-GET mot `scores`/`games`
  returnerer 0 rader (RLS uendret for anon). Verifiseres mot staging.
- **Ugyldig/deaktivert token:** `/spectate/<random>` og token til et spill der
  live-følg er av → 404 (`notFound()`), aldri en tom/halv-rendret side.
- **Reveal-modus spectate:** før avslutning vises brutto-only (eller «resultater
  kommer»-tilstand) — netto-rangering lekker IKKE før `finished`. Arves fra
  `revealState('reveal','active')='reveal-active'` + `shouldHideNetto`.
- **Token-rotasjon:** slå av → på genererer ny token; gammel lenke dør (forventet).
- **0-rad-skriv på toggle:** server-action asserterer affected-rows (PostgREST gir
  `error==null` på 0 treff — AGENTS.md trap #2).
- **Draft/scheduled spill:** intet leaderboard → spectate-lenken (hvis token finnes)
  viser tom/«ikke startet»-tilstand, ikke 500. Hver public route trenger `error.tsx`.
- **Reveal + in-app flip-interaksjon:** flippen gjelder KUN `score_visibility='live'`.
  Reveal-modus beholder dagens deltaker-opplevelse uendret.
- **Cache:** spectate-ruten kan gjenbruke `getGameWithPlayers`-cachen (samme
  `game-${id}`-tag) for game+players; scores hentes ucachet (som i dag) via
  admin-klient.

## Key Decisions

- **To flater, begge i #938:** RLS-flip (in-app) + offentlig token-lenke — *eier-valg*.
- **Offentlig uten login** via admin-klient + token, **ikke** anon-RLS-åpning —
  holder RLS lukket (AGENTS.md «RLS er ekte authz»); ingen anon-lese-overflate på `scores`.
- **Opt-in, default av** — token `null` til oppretter slår på.
- **Polling (ikke realtime) på spectate** — anon kan ikke få realtime-events; polling
  er den robuste MVP-en for read-only-flaten.
- **Reveal respekteres** på begge flater via eksisterende server-side branching.

**Claude's Discretion:**
- Poll-intervall (~20s) + om in-app realtime-grensen trenger justering.
- Plassering av toggle/del-knapp (game-home vs leaderboard) per «one door per room».
- Om 0121 er én migrasjon (RLS + kolonne) eller deles i to.
- Eksakt spectate-header-utforming og i18n-nøkler (no/en).
- Om token genereres i SQL (`gen_random_uuid()`) eller action (`crypto.randomUUID()`).

## Success Criteria

- [ ] **K1 — In-app cross-flight (RLS):** Migrasjon 0121 utvider `scores`-SELECT så en
      deltaker i et **live-modus, aktivt** spill ser alle flights. **Bevis:** påført
      staging; SQL-probe som `set role authenticated` + ulik `request.jwt.claims`:
      deltaker i flight A leser flight B's score (≥1 rad) i live-modus aktivt; samme
      probe i reveal-modus uendret; ikke-deltaker authed-bruker → 0 rader; anon → 0 rader.
- [ ] **K2 — In-app render:** Et live-modus, fler-flight aktivt spill viser alle
      flights på den authede `/leaderboard` (ikke bare egen flight). **Bevis:**
      staging-render/-skjermbilde av et 2-flight live stableford-spill der begge
      flights' rader vises for en deltaker.
- [ ] **K3 — Token-toggle:** Oppretter/admin kan slå live-følg på (token settes) og av
      (token nullstilles); ikke-oppretter kan ikke (RLS). **Bevis:** server-action +
      staging: oppretter slår på → `spectate_token` ikke-null; hostile authed PATCH fra
      ikke-oppretter → blokkert/0-rad; av → token null.
- [ ] **K4 — Offentlig spectate-rute:** `/spectate/<token>` laster **uten innlogging**
      og viser read-only leaderboardet for et live-spill; ugyldig/deaktivert token → 404.
      **Bevis:** staging headless/curl uten session-cookie henter siden (200 + rader);
      `/spectate/<random>` → 404; `proxy.ts` slipper `spectate` forbi auth-gaten.
- [ ] **K5 — Reveal + permalink:** Reveal-modus spectate holder netto tilbake til
      `finished`, så viser fulle resultater; lenken virker etter avslutning. **Bevis:**
      staging: reveal-spill aktivt → brutto-only på spectate; etter `finished` → full
      resultatside på samme lenke.
- [ ] **K6 — Live uten reload:** Spectate-siden oppdaterer seg under aktivt spill uten
      manuell reload (polling). **Bevis:** ny score injisert på staging dukker opp på
      den åpne spectate-siden innen ett poll-intervall, uten reload.
- [ ] **K7 — Ingen anon-lekkasje + read-only:** Spectate-siden eksponerer kun
      navn/scores/banehandicap (ingen e-post/private felter), har ingen score-inntasting
      og ingen reaksjons-interaktivitet. **Bevis:** DOM/markup-inspeksjon + grep at
      `ReactionsProvider` ikke monteres på spectate-stien.

## Gates (kjøres per chunk, scoped til endret)

- [ ] `npx tsc --noEmit` — rent.
- [ ] `npm run build` — grønn (autoritativ for exhaustive switch / Record-maps).
- [ ] `npm run lint` — rent på endrede filer.
- [ ] `npx vitest run app/[locale]/games/[id]/leaderboard/ app/[locale]/spectate/ lib/games/` —
      grønn (eksisterende leaderboard-suite uendret + nye spectate/toggle-tester).
- [ ] **Staging (mandatory før merge):** 0121 påført + verifisert (catalog-probe på
      kolonne+policy); hostile-probe (K1/K3); klikk/curl-runde av spectate-flyten
      (K4/K5/K6/K7) på ekte staging-spill. **0 prod-skriv.**
- [ ] **Versjon:** `feat` → minor-bump (`npm version minor --no-git-tag-version`) +
      én Funksjon-rad i `CHANGELOG.md`.

## Files Likely Touched

- `supabase/migrations/0121_live_follow.sql` — utvid `scores`-SELECT (live-flip) + ny
  `games.spectate_token`-kolonne + unik-indeks.
- `proxy.ts` — legg `spectate` til `PUBLIC_PATH_PATTERN`.
- `app/[locale]/spectate/[token]/page.tsx` (+ `error.tsx`, `not-found` håndtering) —
  public token-gatet read-only leaderboard, admin-klient-fetch, reveal-respekt.
- `app/[locale]/spectate/[token]/SpectatePoller.tsx` — klient-øy som poller mens aktiv.
- En delt render-hjelp hvis `page.tsx`-format-dispatchen må løftes ut for gjenbruk
  (ellers gjenbruk `formats/*` direkte) — Claude's discretion.
- `lib/games/` — `setSpectateToken`/`getGameBySpectateToken`-helpere + server-action
  (med `expectAffected`).
- Game-home/leaderboard-flate — oppretter/admin-only toggle + del-knapp
  (`navigator.share` + copy-fallback).
- `lib/games/getGameWithPlayers.ts` — `GameForHole`-typen må inkludere
  `spectate_token` hvis cachen brukes for toggle-state (ellers slank direkte-call).
- `messages/no.json` + `messages/en.json` — spectate-header + toggle/del + aria-nøkler.
- `package.json` + `package-lock.json` + `CHANGELOG.md` — minor-bump + Funksjon-rad.
- Tester: RLS-flip (Type A/probe), spectate-rute (Type C/D-light), toggle-action.

## Out of Scope

- **Web Push «kom og se»-trigger** (#24) — bygger oppå denne; egen runde.
- **Spektator-synlige reaksjoner / banter for ikke-deltakere** (#943-utvidelse) —
  spectate er read-only i denne MVP-en.
- **Anon Supabase realtime / `signInAnonymously`** — polling er valgt; realtime for
  anon er en bevisst utsatt optimalisering.
- **Egendefinert tilgangskontroll utover token** (passord, utløp, deltaker-liste-skjul)
  — token-i-URL er hele authz-en for offentlig flate.
- **Lag-/matchplay-spesifikk spectate-polish** — gjenbruker eksisterende format-visninger
  som de er; ingen ny per-format spectate-design.
- **Flip av in-app gating for reveal-modus** — bevisst urørt (drama bevares).
