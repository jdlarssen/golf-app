# Beslutnings-doc: Behold Dexie (ikke migrer til idb direkte)

**Issue:** [#35](https://github.com/jdlarssen/golf-app/issues/35)
**Type:** Beslutnings-doc, ikke build-kontrakt. Formaliserer «ikke migrer nå»-konklusjonen fra forutgående analyse + definerer trigger-betingelser for senere revurdering.
**Dato:** 2026-05-25 (6 dager etter underliggende analyse 2026-05-19)

## Beslutning

**Behold Dexie. Ikke migrer til idb direkte i nåværende sesong.**

Issue #35 forblir åpen som watchlist-markering. Revurdering trigges av kriteriene under, ikke av kalendertid.

## Begrunnelse

Komplett analyse ligger i [#35 sin issue-kommentar](https://github.com/jdlarssen/golf-app/issues/35#issuecomment-...) fra 2026-05-19. Hovedfunn som binder beslutningen:

- **Bundle-besparelse:** ~30-32 KB gzipped på de mest brukte rutene. Reell, men ikke smerte-skapende i dag — ingen bruker-klager på initial load, ingen Lighthouse-target som krever det.
- **Engineering-kost:** ~250 LOC ny kode, inkludert hjemmebrygget `useIdbLiveQuery`-erstatning. Treffer produksjons-kritisk sync-systemet ([lib/sync/](lib/sync/)). Cross-tab live-queries er en kjent fallgruve — én glemt broadcast-trigger i `syncWorker.ts` betyr at `SyncBanner` blir stum til refresh.
- **Stabilitets-vindu:** vi er nå på v1.8.7 (var v1.0 da analysen ble skrevet) — stabilitets-argumentet er noe svakere, men sync-arkitekturen har ikke endret seg.
- **Strategisk timing:** hvis vi senere bytter underliggende sync-arkitektur (CRDT/Yjs, eller annen offline-modell), forsvinner store deler av `lib/sync/` likevel. Migrer underlaget samtidig, ikke separat.

## Trigger-betingelser for revurdering

Issue revurderes når en av disse inntreffer:

1. **Bundle-klage fra ekte bruker** — noen rapporterer slow first-load på golf-banen (eller Lighthouse-RUM viser konsistent over budsjett).
2. **Dexie-bug i prod** — vi får et konkret feilbilde uten åpenbar fix på Dexie-nivå.
3. **Sync-arkitektur-omskrivning** — vi planlegger å erstatte `lib/sync/` med ny modell (CRDT, push-based, etc.). Da bytter vi underlaget samtidig.
4. **Dexie ute av vedlikehold** — hvis biblioteket ikke får oppdatering på 12+ måneder eller får security-CVE uten patch.

## Hva som IKKE er trigger

- «Det er en stund siden vi sjekket» — ren kalendertid kvalifiserer ikke.
- «Idb fikk en cool ny feature» — nye feature i konkurrerende lib endrer ikke kostnads-analysen.
- «Vi har lyst å rydde» — refactor uten konkret bruker-effekt rettferdiggjør ikke 250 LOC risiko mot sync-systemet.

## Pre-existing observasjon (ikke fiks her)

Compound-indekser `[gameId+userId]` og `[gameId+holeNumber]` deklareres i [lib/sync/db.ts](lib/sync/db.ts) men brukes ikke av noen kode. De kan trygt fjernes ved neste schema-touch — men det krever en `version(2)`-bump. Ikke verdt en egen migrasjon. Hvis vi en gang gjør et `version(2)`-bump (av annen grunn), drop disse to indeksene samtidig som bonus-cleanup.

## Hvis migrasjon blir aktuelt: angreps-plan

Note for fremtidig sesjon. Ikke utfør nå.

1. **Aldri big-bang.** Bygg `useIdbLiveQuery` først med tester.
2. **Shadow-mode-runde** — kjør begge (`useLiveQuery` + `useIdbLiveQuery`) parallelt i én release, sammenlign return-values for å avdekke broadcast-gaps.
3. **Cross-tab via `BroadcastChannel('golf-app-writes')`** — post fra alle write-paths: `writeScore`, `syncWorker.merge`, `RealtimeMount.catchUp`, syncWorker update/delete.
4. **Same-tab via intern `EventTarget`** — komponenter subscribe.
5. **DB-navn bevares som `'golf-app'`** (kritisk, per CLAUDE.md `### Aldri gjør disse`).
6. **E2E-testen** ([e2e/sync/offline-sync.spec.ts](e2e/sync/offline-sync.spec.ts)) må bytte CDN-import fra dexie til idb-ESM-tilsvarende.

## Issue-state

#35 forblir **åpen**. Ingen lukke-kommentar. Denne beslutnings-doc-en er bare arkitektur-spor.

Ved trigger-event: opprett ny build-kontrakt mot da-eksisterende kode. Ikke gjenbruk denne doc-en som spec — situasjon kan ha endret seg.
