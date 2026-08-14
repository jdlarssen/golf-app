# Kontrakt: veiviseren skal overleve tilbake-gest, reload og PWA-eviction (#1380)

## Problem

`GameWizard` speiler steget til URL med `router.replace` (`app/[locale]/admin/games/new/GameWizard.tsx:262`), som ALDRI lager history-entries — mens fil-headeren (:24-25) lover «Browser back fra steg N tilbake til N-1» og effekt-kommentaren (:250-251) hevder «history-stacken får én entry per steg-overgang». Begge er feil med replace. Konsekvens: Android-tilbakegest/browser-back fra steg 2-5 forlater hele veiviseren, og siden all skjema-state er ren `useState` i `useGameFormState.ts` uten persistens og uten beforeunload-vakt, er alt tapt. Samme tap når mobil-OS-et kaster PWA-en ut av minnet mens arrangøren svitsjer til meldingsappen. HCD-audit funn F39 (P2). (Søsterfunn #1383 — reload på `?step=N` gir stille defaults — løses i praksis av samme persistens; noteres i PR-en.)

## Design (alternativ A — anbefalt)

1. **Per-steg history:** steg-overganger initiert i appen bruker `router.push`; URL-normalisering uten bruker-intensjon (f.eks. `parseStepFromSearch` som kollapser ugyldig `?step=99` → 1, GameWizard.tsx:133-140) forblir `replace`. **Speil-effekten (:252-265) kan ikke selv skille intensjon fra normalisering** (den depender kun på `[step]`) — implementer med et eksplisitt signal: enten flytt `push` inn i steg-navigasjons-handlerne og la effekten beholde `replace` for normalisering, eller sett en ref i handlerne som effekten leser. Uten dette oppstår en back-felle: `?step=99` → normaliser → push → back → re-normaliser → push igjen. Den motsatte synk-effekten (URL → state ved back/forward, :237-248) er allerede på plass og gjør back = forrige steg når entriene finnes. Fil-header- og effekt-kommentarene oppdateres til å stemme.
2. **Persistens:** skjema-state speiles til `sessionStorage`, nøklet på pathname (f.eks. `wizard:new-game`), skrevet ved state-endring (throttlet/debounced). Gjenopprett ved mount hvis payload finnes. Serialiser et DEFINERT subset av JSON-trygge felt fra `useGameFormState` (intent, format, navn, bane-id/tee-valg, tee-off, roster, teams, øvrige verdi-felt) — aldri funksjoner/derivater.
3. **Livssyklus:** payload slettes ved vellykket publish, draft-lagring og eksplisitt avbryt. Payload får `savedAt`; eldre enn ~60 min → forkastes (stale oppsett skal ikke spøke igjen dagen etter). Korrupt/uparsbar payload → forkast stille og start blankt (aldri krasj).

## Edge Cases & Guardrails

- **Restore må valideres**: bane kan være slettet/endret siden payload ble skrevet — gjenoppretting er best-effort per felt; ukjente id-er droppes (behold resten).
- **Cup-short-circuit** (steg 2 → CupSetup-flyt, GameWizard.tsx:320-336/420): verifiser at persist/gjenoppretting ikke lekker inn i cup-creation-flyten.
- **Ingen beforeunload-dialog**: persistens gjør vakten overflødig — ikke legg til støy.
- sessionStorage er per-fane og forsvinner med fanen — bevisst valg (utkast på tvers av økter har egen flyt: «Lagre utkast»).
- Back fra steg 1 skal fortsatt forlate veiviseren (dokumentert intensjon).
- Ingen e2e driver veiviseren i dag (`e2e/admin/games.spec.ts` tester kun login-redirect) — browser-back-oppførselen har null automatisert dekning; staging-klikket er den reelle porten for punkt 1.

## Key Decisions

- `sessionStorage` (ikke localStorage): overlever reload + eviction i samme fane, men blør ikke mellom økter/enheter.
- Persistens-nivået er UI-state, ikke Dexie/DB — dette er ikke offline-sync, bare skjema-hukommelse.

## Alternativer (produktvalg)

**Anbefaling: Alternativ A** — back går til forrige steg OG inndata overlever; det er dette både fil-headeren og «på et par minutter»-flyten lover.

**Alternativ A — push per steg + sessionStorage (bygges):**
- Fordeler: tilbake-gesten gjør det alle mobil-apper har lært brukeren; inndata overlever reload/eviction; dokumentert intensjon og kode stemmer igjen.
- Ulemper: flere history-entries (5 steg = opptil 4 back-trykk for å forlate); noe mer kode (serialisering + validering av restore).

**Alternativ B — behold replace (back forlater veiviseren), men med persistens:**
- Fordeler: enklest mulige endring; ett back-trykk tar deg alltid ut; gjenåpning av veiviseren henter det du hadde.
- Ulemper: back-gesten «kaster» deg fortsatt ut midt i flyten (overraskelsen består, selv om dataene nå overlever); motsier fortsatt fil-headerens lovnad (den må da skrives om).
- Ombyggingskostnad: liten — samme persistens-lag, bare push-endringen reverseres.

**Reversibilitet:** full — begge deler kan snus senere uten datatap.

Svar «alternativ B» i PR-en, så bygges det om på samme branch. Ingen hast — PR-en venter til du svarer eller merger.

## Success Criteria

1. Fra steg 3: browser-back viser steg 2 med intakt state (ikke exit).
2. Reload midt i steg 4 → samme steg med intakt inndata (roster/format/bane).
3. Publish eller draft-lagring → payload borte; nytt besøk starter blankt.
4. Payload eldre enn TTL → blankt oppsett, ingen feil.
5. Kommentarene i GameWizard.tsx beskriver faktisk oppførsel.

## Gates

- `tsc` + `lint` + `vitest` grønne; `GameWizard.test.tsx` utvides målrettet (restore fra sessionStorage er unit-testbar som beskrevet) etter docs/test-discipline.md — ikke en testsuite-utbygging.
- NB: `vitest.setup.ts:18-31` stubber `useSearchParams` til alltid-tom og `push` til fersk `vi.fn()` — back-/push-oppførsel kan IKKE drives gjennom det delte oppsettet. Trengs en push-assertion, gjør en LOKAL `vi.mock`-override i `GameWizard.test.tsx`; ikke rediger det delte setup-et (bred blast radius).
- Staging-klikk: hele veiviser-flyten inkl. browser-back midt i, reload midt i, `?step=99`-normalisering uten back-felle, og publish-sluttrens.

## Files Likely Touched

- `app/[locale]/admin/games/new/GameWizard.tsx`
- `app/[locale]/admin/games/new/useGameFormState.ts` (evt. ny liten `lib/wizard/wizardStatePersistence.ts`)
- `GameWizard.test.tsx`

## Out of Scope

- Draft-gjenopptak i annet UI (#1385) og «Lagre utkast»-gating (#1384).
- Reload-defaults-issuet #1383 som SAK (men noter i PR-en at leveransen trolig lukker den — eieren avgjør).
- Endringer i selve steg-innholdet eller valideringen.


---

## Drift-sjekk (2026-08-14): ankere verifisert mot HEAD — ingen drift. (`router.replace` på `:262` med villedende kommentar `:250`; header-lovnaden `:24`; `parseStepFromSearch` `:133`; ingen sessionStorage i wizard-filene; vitest.setup-stubbene `:16–40` som beskrevet.) Bruker-synlig fix → `.changes/1380-<slug>.md`-notatfil (ukesregimet #1562).

---

## Bygge-evidens (2026-08-14)

S1–S5 + adversarial a–h: PASS på unit-/kodenivå (evaluator runde 1 ACCEPT — `.forge/evaluations/1380-wizard-survives.md`); S1/S2 ekte back-/reload-oppførsel: staging-runden er porten. Gates: vitest 273/273 (suite-bredt 6109 hos builder), lint 0, tsc ren, build grønn (kjørt av BÅDE builder og evaluator). 4 ikke-blokkerende funn dokumentert i evalueringen (prefill-mounts skriver utkast; kontekst-mismatch sletter; ?bane=-fingeravtrykk; ingen avbryt-UI → TTL dekker).

Staging-porten: PASS 2026-08-14 — S1/S2/S3/S4 + step99-uten-felle alle grønne i Playwright-runde (bevis: kommentar på PR #1620). Testdata ryddet.
