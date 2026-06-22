# Spec: Hjem-bunt — ærlig feil-håndtering (#877) + vedvarende funn-feed (#879)

**Issues:** [#877](https://github.com/jdlarssen/golf-app/issues/877) (bug, P2) + [#879](https://github.com/jdlarssen/golf-app/issues/879) (enhancement, P2)
**Branch:** `claude/fervent-cannon-7c6c82`
**Flate:** `app/[locale]/page.tsx` (Hjem-navet, «/») + to game-helpers
**Bump:** #877 = PATCH (bug-fix), #879 = MINOR (ny synlig feature). To commits, to bumps.

## Problem

Hjem er play + discover-navet og kjerne-løkkas inngang. To svakheter rammer tilbakevendende spillere:

1. **#877 — stille feil-svelging.** `rawActiveRes.error` sjekkes aldri ([page.tsx:173](app/[locale]/page.tsx:173)) og `getFinishedGamesForUser` destrukturerer kun `{ data }` ([getFinishedGamesForUser.ts:52](lib/games/getFinishedGamesForUser.ts:52)). Ved en forbigående DB-/RLS-feil blir `activeGames` til `[]`, `isEmptyState` regnes til `true`, og siden rendrer «Velkommen, start her»-helten — som om spilleren ikke har noen spill. En pågående runde forsvinner uten signal akkurat når spilleren skal taste slag. `profileRes` kaster allerede sin feil (linje 166–168); de to andre spørringene gjør det ikke.

2. **#879 — funn-feeden forsvinner i fylt tilstand.** `getDiscoverableGames()` returnerer fire lister (klubb-spill, venne-spill, åpne turneringer, egne ventende forespørsler), men hentes kun når `isEmptyState` og rendres bare i tom-grenen ([page.tsx:211–212](app/[locale]/page.tsx:211), [248–250](app/[locale]/page.tsx:248)). Idet en spiller får sitt første spill forsvinner klubb-/venne-konteksten (#442/#369) som driver gjentatt deltakelse — usynlig for nettopp de mest aktive brukerne — og spillerens egne utestående forespørsler. Det eneste som står igjen er ett anonymt lenke-kort som ser likt ut enten det finnes 0 eller 30 turneringer.

## Research Findings

Verifisert mot live kode i denne flaten (ikke treningsdata-antakelser):

- **`app/[locale]/error.tsx` finnes** (catch-all for locale-segmentet, #680) og rendrer `ErrorScreen` med `unstable_retry` (Next 16-API) + «Til Hjem»-fallback. En kastet feil fra en RSC under `[locale]` degraderer dermed pent til en retry-skjerm. Samme grense dekker `/spill-arkiv`.
- **`profileRes`-mønsteret** ([page.tsx:166–168](app/[locale]/page.tsx:166)) er den etablerte måten å håndtere fetch-feil på i denne filen: `if (error) { throw error; }`. #877-fiksen speiler dette.
- **`HomeDiscoverySection`** ([HomeDiscoverySection.tsx](app/[locale]/HomeDiscoverySection.tsx)) er en server-rendret next-intl-komponent som allerede rendrer hver av de fire listene betinget (kun når non-empty). Gjenbrukbar i fylt tilstand uten omskriving. Eksisterende test: `HomeDiscoverySection.test.tsx` — en valgfri ny prop (default = dagens oppførsel) holder den grønn.
- **Perf:** `getDiscoverableGames` kjøres i dag *serielt etter* `Promise.all`-en (egen `await`, [page.tsx:211](app/[locale]/page.tsx:211)). Den avhenger ikke av profil-/aktiv-/avsluttet-resultatene → kan parallelliseres inn i samme `Promise.all` (wall-clock = max, ikke sum).

## Prior Decisions

- **#392 / #355 / #571 / #257:** Hjem er play + discover-navet. Arrangering (create-dører) bor i Klubbhuset. Funn-seksjonen skjules når den er tom (#257). **Ingen av disse forbyr funn-*innhold* i fylt tilstand** — de sier kun at create-dører bor i Klubbhuset. → Ikke legg til opprett-knapper i funn-seksjonen.
- **#572 / #569 (`getFinishedGamesForUser`):** delt single-source-of-truth for Hjem + `/spill-arkiv`, sortert `byEndedAtDesc` i JS. #877-fiksen må bevare signatur + retur-form; kun feil-grenen endres.

## Design

### Del 1 — #877: kast i stedet for å svelge

Speil `profileRes`-mønsteret på begge de andre konsumentene:

1. **`page.tsx` `HomeBody`:** etter `Promise.all`-en, sjekk `rawActiveRes.error` og kast den **før** `activeGames`/`isEmptyState` beregnes. Plasseres ved siden av den eksisterende `if (profileError) throw profileError;`.
2. **`getFinishedGamesForUser.ts`:** destrukturer `{ data, error }` og `if (error) throw error;` før `data ?? []`. Dette dekker både Hjem og `/spill-arkiv` (delt helper) — begge konsumenter får ærlig feil-degradering via locale-`error.tsx`.

Resultat: ved en fetch-feil ser brukeren den eksisterende «Noe gikk galt — prøv igjen»-skjermen i stedet for en villedende tom velkomst. Et tomt array maskerer aldri en feilet spørring igjen.

### Del 2 — #879: vedvarende funn-feed i fylt tilstand

1. **Ungate + parallelliser:** flytt `getDiscoverableGames(userId)`-hentingen ut av `isEmptyState`-gaten og parallelliser den med de andre fetchene (inn i `Promise.all`, eller tilsvarende, så den ikke lenger legger til seriell latens). Profil-completion-redirecten må fortsatt fungere (en ufullført bruker redirectes som før; en bortkastet discovery-fetch på den sjeldne stien er akseptabelt).

2. **Forhåndsvisning-modus på `HomeDiscoverySection`:** legg til en valgfri prop (f.eks. `preview?: boolean` eller `maxPerList?: number`) som:
   - Kapper de **passive** listene (klubb / venne / åpne) til topp ~3 hver.
   - Lar **`pendingRequests` vises i sin helhet** — det er spillerens egen handling, ikke passiv discovery, og er typisk få.
   - Rendrer en **«Se alle →»-hale** til `/finn-turneringer` nederst i seksjonen.
   - Default (uten prop) = dagens uavkortede oppførsel → tom-tilstand-bruken og eksisterende test uendret.

3. **Fylt-tilstand-rendering** (erstatter dagens statiske «Finn turneringer»-lenkekort, [page.tsx:406–421](app/[locale]/page.tsx:406)):
   - `hasDiscoveryContent` → `<HomeDiscoverySection preview … />` (kappet) i samme slot, mellom «Mine spill» og «Avsluttede spill».
   - `!hasDiscoveryContent` → behold det statiske lenkekortet (alltid én funn-inngang; respekterer #257 ved å ikke vise en tom seksjon med headere).
   - Seksjonen skal passe Hjem-navets rytme visuelt (samme `Section`-divider-følelse som «Pågår nå»/«Mine spill»/«Avsluttede»), ikke se påklistret ut.

4. **Copy-stramming:** `home.discoverCard` («Se åpne turneringer du kan bli med i») duplisere seksjons-labelen «Finn turneringer» og er passiv. Stram til action-verb (kortere, ikke-duplikativ). Ny streng for «Se alle»-halen. Begge i `no.json` **og** `en.json`, humanizer-pass på norsk. Ingen nye tester for copy-endring (per test-disiplin).

## Edge Cases & Guardrails

- **#877 rekkefølge:** feil-kastet MÅ skje før `isEmptyState`/`activeGames` utledes — ellers maskerer `[]` fortsatt feilen før kastet.
- **`/spill-arkiv`-medvirkning:** `getFinishedGamesForUser`-kastet treffer også arkiv-siden. Det er ønsket — et arkiv som stille viser tomt er like villedende. Locale-`error.tsx` fanger begge.
- **Tom funn-feed i fylt tilstand:** ingen tom seksjon med headere — fall tilbake til ett lenkekort.
- **`pendingRequests` aldri kappet:** spillerens egen utestående forespørsel skal alltid være fullt synlig.
- **Ingen create-dører** i funn-seksjonen (#392). Kun discovery-innhold + «Se alle»-lenke.
- **`HomeDiscoverySection.test.tsx` + `getDiscoverableGames.test.ts`** må forbli grønne — valgfri prop med bakoverkompatibel default.
- **Ikke rør** den urelaterte «enda»→«ennå»-typoen i `home.emptyBodyWithDiscovery` (egen issue #883).

## Key Decisions

- **#877 → kast (full feilskjerm), ikke inline-banner** — eier-valg. Enklest, konsistent med `profileRes`, kan aldri lure spilleren til å tro runden er borte, og dekker `/spill-arkiv` likt. `error.tsx` gir retry.
- **#879 → kort forhåndsvisning (topp ~3/liste) + «Se alle»-hale** — eier-valg. Holder Hjem skannbar; avsluttede spill nederst beholder plass.
- **`pendingRequests` vises fullt** — spillerens egen handling, ikke passiv discovery.
- **Funn-feed parallelliseres inn i hoved-fetchen** — fjerner dagens serielle latens; den dypere Suspense-strømmingen er #886.

**Claude's Discretion:**
- Eksakt prop-form/-navn på `HomeDiscoverySection` (preview-bool vs maxPerList) og cap-tallet (2–3).
- Eksakt copy: tightened `discoverCard` + «Se alle»-streng. Kanon-retning: action-verb, kort, ikke-duplikativ av «Finn turneringer». Humanizer-pass; unngå anglisme/em-dash-kjeder.
- Eksakt visuell integrasjon av funn-seksjonen i nav-rytmen (wrappe i `Section`, eller la komponenten bære headere) — så lenge det ser koherent ut.
- Den nøyaktige mekanismen for parallellisering vs. profil-redirect-rekkefølgen.

## Success Criteria

- [x] `getFinishedGamesForUser` kaster ved `error` (ikke `data ?? []`-svelging). **Evidens:** `getFinishedGamesForUser.ts:52` destrukturerer `{ data, error }`, `if (error) throw error;` før `data ?? []`. (commit df5fc9c6)
- [x] `HomeBody` kaster `rawActiveRes.error` før `activeGames`/`isEmptyState` beregnes. **Evidens:** `page.tsx` — `if (rawActiveRes.error) { throw rawActiveRes.error; }` plassert rett etter profil-completion-redirecten, før `const activeGames = ...`. (commit df5fc9c6)
- [x] Funn-feeden hentes for alle innloggede (ikke gated på `isEmptyState`) og legger ikke til seriell latens. **Evidens:** `getDiscoverableGames(userId!)` er 4. element i `HomeBody`s `Promise.all`; den gamle `isEmptyState && userId ? await … : null`-gaten er fjernet. (commit 11d9a4a7)
- [x] I fylt tilstand med funn-innhold rendres kappede funn-kort (topp ~3/passiv liste) + «Se alle →»-hale; uten innhold rendres fallback-lenkekortet. **Evidens:** `page.tsx` fylt-gren: `{hasDiscoveryContent ? <HomeDiscoverySection data={discoveryData} preview /> : <Section …><lenkekort/></Section>}`; `HomeDiscoverySection` `PREVIEW_CAP=3` + `seeAllTournaments`-hale. Staging-spot-sjekk gjenstår for evaluator.
- [x] `pendingRequests` vises i sin helhet (ikke kappet) når present. **Evidens:** `HomeDiscoverySection` — kun `clubGames`/`friendGames`/`openGames` slices med `PREVIEW_CAP`; `pendingRequests` brukes uavkortet fra `data`.
- [x] `home.discoverCard` strammet + ny «Se alle»-streng, begge i `no.json` + `en.json`; humanizer-pass uten advarsler. **Evidens:** `discoverCard`: «Bli med i en åpen turnering» / «Join an open tournament»; ny `discover.seeAllTournaments`: «Se alle turneringer» / «See all tournaments». Humanizer kjørt (fanget «funn-feeden»-anglisme i CHANGELOG, fikset). Pre-commit-hook ren.
- [x] `package.json` + `CHANGELOG.md` bumpet: PATCH for #877-commit, MINOR for #879-commit. **Evidens:** df5fc9c6 = 1.134.5 (nestet i åpen 1.134.y-tema), 11d9a4a7 = 1.135.0 (nytt tema «Funn rett på Hjem»).

## Gates

- [x] `npx tsc --noEmit` passerer — exit 0
- [x] `npm run lint` (eslint på endrede filer) passerer — exit 0
- [x] `npx vitest run app/[locale]/HomeDiscoverySection.test.tsx lib/games/getDiscoverableGames.test.ts` grønne — 18/18 passed, eksisterende tester ikke brutt
- [x] `.githooks/pre-commit` ingen humanizer-advarsler på nye norske linjer — begge commits passerte hooken
- [ ] Playwright/preview mot `torny-staging`: (a) Hjem i fylt tilstand viser funn-forhåndsvisning + «Se alle»; (b) en bruker med spill ser fortsatt «Pågår nå»/«Mine spill». (#877-feilskjermen verifiseres ved kode-lesing — vanskelig å fremtvinge en RLS-feil på staging.) — overlatt til formell evaluator

## Files Likely Touched

- `lib/games/getFinishedGamesForUser.ts` — kast ved fetch-feil (#877)
- `app/[locale]/page.tsx` — kast `rawActiveRes.error` (#877); ungate + parallelliser discovery, fylt-tilstand-rendering med kappet `HomeDiscoverySection` + fallback (#879)
- `app/[locale]/HomeDiscoverySection.tsx` — valgfri preview/cap-prop + «Se alle»-hale (#879)
- `messages/no.json` + `messages/en.json` — strammet `discoverCard` + ny «Se alle»-streng (#879)
- `CHANGELOG.md` + `package.json` — PATCH (#877) + MINOR (#879)

## Out of Scope

- **Egen Suspense-grense / heltestrømming for discovery** — #886 (tom-tilstand-latens). Her parallelliserer vi kun inn i hoved-fetchen.
- **«enda»→«ennå»-typo** i `emptyBodyWithDiscovery` — #883.
- **Endring av `getDiscoverableGames`-spørringene/dedup-logikken** — kun konsum-siden + en valgfri presentasjons-prop endres.
- **Create-dører / arranger-snarveier på Hjem** — bevisst utelatt (#392).
- **Per-rad signaler (uleste/«liga pågår») på funn-kort** — fremtidig, ikke nå.
