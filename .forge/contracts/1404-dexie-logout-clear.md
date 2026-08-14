# Kontrakt: #1404 — Lokale scorer overlever ikke brukerbytte

**Issue:** [#1404](https://github.com/jdlarssen/golf-app/issues/1404)
**Branch:** `claude/1404-dexie-logout-clear`
**Type:** fix, security (bruker-synlig → `.changes/`-notat + staging-verifisering).
**PRODUKTVALG:** ja — se D6. PR-en får `## Produktvalg`-seksjon og venter på eier.

## Rotårsak

Dexie-basen `golf-app` (scores + syncQueue + conflicts) tømmes aldri ved
utlogging. På en delt enhet overlever én brukers lokale slag inn i neste
brukers økt (#819-klassen): neste brukers drain prøver å pushe forrige brukers
rader (karantene-støy i SyncBanner), og forrige brukers data ligger lesbar på
enheten. Blind `delete()` ved utlogging ville mistet usynkede slag — designet
må drenere først eller skille per bruker (issue-teksten).

## Arkitektur-fakta (lest denne økten)

- Utlogging er en server-route (`(auth)/logout/route.ts`) — kan ikke røre
  IndexedDB. Klient-flaten er profil-sidens form (`profile/page.tsx:322`).
- `SyncBoot` (game-layouten) starter sync-motoren med bootstrap-drain; monteres
  KUN på game-sider (bevisst: /demo og /embed skal aldri åpne Dexie-basen).
- `drainQueue` leser sesjonen via `getSession` (lokal, offline-trygg).
- Dexie-DB-en heter `'golf-app'` — ALDRI rename/DB-delete (CLAUDE.md).

## Avgjørelser

- **D1 — to lag:**
  1. *Utloggings-tømming:* profil-formen byttes til klient-komponenten
     `LogoutForm` som FØR POST-en kjører best-effort drain (racet mot 4 s
     timeout) og tømmer alle tre tabellene KUN hvis køen da er tom.
     Ikke-tom kø (offline/karantene) → data beholdes («kept») og POST-en går
     som før — laget under er backstoppen.
  2. *Eierbytte-vakta:* `SyncBoot` kaller `ensureLocalDataOwner()` FØR
     `startSyncListener()`: sesjonens user-id sammenlignes med
     `localStorage['golf-app:local-data-owner']`; bytte → tøm tabellene før
     motoren (og dermed første drain) starter. Første eier → bare stemple.
- **D2 — tabell-`clear()`, aldri DB-`delete()`:** skjemaet og DB-navnet består.
- **D3 — eier-stempel i localStorage** (synkront, overlever uavhengig av
  Dexie); ved «cleared»-utlogging fjernes stempelet (ren enhet = 'first' for
  nestemann), ved «kept» står det så vakta kan trigge senere.
- **D4 — ren logikk-kjerne med injiserte avhengigheter**
  (`lib/sync/localDataCleanup.ts`): `detectOwnerChange` +
  `ensureLocalDataOwner(deps)` + `prepareLogout(deps)` er Dexie-frie og
  unit-testes (Type A); browser-bindingene er tynne wrappere.
- **D5 — /demo/embed-invarianten består:** ingen nye Dexie-åpninger utenfor
  game-sidene/profil-knappen; lazy imports beholdes.
- **D6 — PRODUKTVALG (A bygget):**
  - **A:** Ren enhet ved brukerbytte — forrige brukers ikke-synkede slag
    slettes idet en ANNEN bruker logger inn (synkede slag er alltid trygt på
    serveren; vanlig utlogging på nett drenerer alt først).
  - **B:** Per-bruker-oppbevaring — forrige brukers lokale data beholdes
    adskilt og synkes når de selv logger inn igjen; neste bruker ser dem
    aldri. Ingen datatap, men mer kode (scoping av alle lesere + drain).
  Beskrives i PR-body med fordeler/ulemper; kortet lar eieren velge.

## Suksesskriterier

- [ ] **S1:** Type A-tester (RED først) for kjernen: `detectOwnerChange`
      (first/same/switched), `ensureLocalDataOwner` (no_session rører
      ingenting; switched tømmer FØR stempling; first stempler uten tømming;
      same no-op), `prepareLogout` (tom kø etter drain → cleared + stempel
      fjernet; drain feiler/kø ikke tom → kept + stempel består; drain-throw
      svelges).
- [ ] **S2:** `SyncBoot` awaiter eier-vakta før motorstart; `LogoutForm`
      erstatter profil-formen (samme copy-nøkler, samme route-POST).
- [ ] **S3:** Gates: `npx vitest run lib/sync/` + `npm run build` exit 0.
- [ ] **S4:** Staging: (1) som bruker A på game-side → eier-stempel = A;
      (2) simulert etterlatenskap (rå IndexedDB-rad + stempel A) → login som
      bruker B, åpne game-side → rad borte + stempel = B; (3) utlogging med
      tom kø → tabeller tomme + stempel fjernet. Bevis + `staging-verified`.
- [ ] **S5:** `.changes/1404-*.md`-notat (type fix).

## Gates

- `npx vitest run lib/sync/`
- `npm run build`

## Edge-case-tabell

| Input-klasse | Forventet |
|---|---|
| Første innlogging på enheten | Stemple eier, ingen tømming |
| Samme bruker igjen | No-op |
| Annen bruker | Tøm alle tre tabeller FØR første drain, stemple ny eier |
| Ingen sesjon (anonym flate) | Rør ingenting (verken stempel eller data) |
| Utlogging online, alt synket | Drain → tom kø → tøm + fjern stempel |
| Utlogging offline / kø ikke tom | Behold data + stempel; POST går uansett (racet timeout) |
| Karantene-rader i køen | Køen er ikke tom → «kept» (bevis-sporet består) |
| Drain kaster | Svelges — samme som ikke-tom kø |
| /demo, /embed | Uendret — åpner fortsatt aldri Dexie |
| SSR | Bindinger no-op-er uten window |
