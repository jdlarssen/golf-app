# Evaluering: #1797 + #1798 (kontrakt #1069, K6 + K7)

**VERDICT: ACCEPT**

Branch `claude/hjem-paret-sammen-1797-1798-d1b1a2` (da06e7dd + de770de5) mot origin/main.
Evaluator: fresh-context forge-evaluator, 2026-08-30.

## Per-kriterium

### K6 — Hjem: én nudge om gangen (#1797)

| Kriterium | Status | Evidens |
|---|---|---|
| Maks én synlig nudge om gangen | MET | `HomeNudgeRail.tsx`: alle fire slots gates på `visible === '<slot>'` mot én enkelt `visible`-verdi (`latched ?? resolved`); `ProductUpdateBannerClient` mountes kun når `visible === 'productUpdate'`. Ingen vei til to samtidige. |
| Prioritet Install > Push > ProductUpdate > Passkey | MET | `lib/home/nudgeQueue.ts:14–19` (`NUDGE_PRIORITY`), låst av test i `nudgeQueue.test.ts`. Greedy walk i `resolveVisibleNudge`. |
| Suksess-/kvitteringsbannere unntatt køen | MET | `page.tsx:137–147`: profileUpdated/gameDeleted-bannerne står utenfor `HomeNudges`. Done-kvitteringene i PushNudge/PasskeyEnrollmentPrompt rendres i egen slot etter brukertap (slot alltid latched når done kan bli true). |
| Ingen synlig banner-bytting ved sidelast (flicker) | MET | To mekanismer: (1) `resolveVisibleNudge` returnerer `null` så lenge en høyere slot er `'pending'` — ingen lavere vises på gjetning; (2) render-fase-latch i `HomeNudgeRail.tsx:158–160` fryser første vinner ut sidevisningen. Adversarial timing-analyse (under) fant ingen reachable swap-scenario. Staging-klikk bekreftet (PR #1812-kommentar). |
| Dismiss forfremmer IKKE nestemann mid-view | MET | Latch består etter dismiss; dismisset komponent skjuler seg selv (`!qualified`/`!show` → null) mens `visible` peker på samme slot. Staging-klikk steg 2 bekreftet (felt ble tomt). |
| Async probe som rejecter kiler ikke fast køen | MET | `.catch(() => onVerdict(false))` i PushNudge (`getPushState`) og PasskeyEnrollmentPrompt (`passkey.list()`), begge med cancelled-guard. |
| SSR/hydration uten mismatch/flash | MET | Initial state alle klient-slots `'pending'` → SSR og hydration-render viser ingenting. `useInstallPrompt` starter `'loading'` og verdict-effekten skipper `'loading'`, så første install-verdikt beregnes ETTER at uSES-snapshots (dismissed/visit-gate) har byttet til reelle klientverdier — hydration-stale verdikt er ikke mulig. |
| Slettede filer uten dangling imports | MET | Grep hele repo: `ProductUpdateBanner\b` → kun én doc-kommentar (NotificationCard.tsx:87); `PasskeyEnrollmentNudge` → 0 treff. `tsc` exit 0. |

**Adversarial timing-analyse (swap-scenarioer, alle avvist):**
- Install kan ikke flippe no→yes etter første verdikt: verdiktet beregnes først når status ≠ 'loading' og visit-gate-inkrementet + uSES-bytte alt er batchet inn i samme render; senere `beforeinstallprompt` endrer 'unsupported'→'native' (begge qualified), `appinstalled` gir yes→no (banner skjuler seg selv, latch hindrer forfremmelse).
- Push: ett verdikt per mount (stabil `onVerdict`-identitet via useCallback-kjede), kan ikke flippe.
- ProductUpdate: server-avgjort før klient-mount.
- Passkey: KAN flippe no→yes (useWebAuthnSupported server-snapshot false → klient true → effekt-rerun → probe), men er lavest prioritet — sen kvalifisering gir kun sen visning, aldri fortrengning.

### K7 — Hjem: totaltak på funn-kortene (#1798)

| Kriterium | Status | Evidens |
|---|---|---|
| Ett samlet tak på ~3 kort på tvers av listene | MET | `lib/games/discoveryPreviewCap.ts`: `DISCOVERY_PREVIEW_TOTAL_CAP = 3`, kaskade-slicing club→friends→open. Parametrisert test dekker 8 kombinasjoner inkl. [2,5,4]→[2,1,0] og [3,2,2]→[3,0,0]. |
| Kuratering klubb > venner > åpne, IKKE nærmeste tee-off | MET | Grådig fyll i fast rekkefølge; ingen sortering på tee-off på tvers av listene. Per-liste intern rekkefølge bevares (front-of-list, testet). |
| Egne ventende forespørsler kappes aldri | MET | `pendingRequests` holdes helt utenfor `capDiscoveryPreview`; rendres ukappet i `HomeDiscoverySection.tsx:127–140`. Staging bekreftet (1 forespørsel vist ukappet). |
| «Se alle»-hale keyed på PRE-cap-tilstedeværelse | MET | `hasPassiveDiscovery` leser `data.*` (ukappet) på `HomeDiscoverySection.tsx:60–63`, ikke de kappede listene. |
| Ikke-preview-konsumenter uberørt | MET | Tom-tilstand Hjem (`page.tsx:401`) og `/finn-turneringer` (`finn-turneringer/page.tsx:165`) kaller uten `preview` → fulle lister. Kun fylt-tilstand (`page.tsx:707`) sender `preview`. |
| Reverserer per-liste-taket fra #879/#901 | MET | `PREVIEW_CAP` slettet, ingen gjenværende referanser (grep). Eier-godkjenning dokumentert i kontraktens «Prior Decisions». |

### Tverrgående (Edge Cases & Guardrails + Gates)

| Krav | Status | Evidens |
|---|---|---|
| Drift-tabell mot HEAD | MET | PR #1812-body har drift-tabell (5 rader, alle BEKREFTET/INGEN). |
| `.changes/`-notat per issue, feat-commits | MET | `1797-hjem-en-nudge.md` + `1798-funn-kort-tak.md`; `weekly-release.mjs --dry-run` exit 0 (begge validerer). Begge commits har `Refs #N`. |
| Staging-bevis + `staging-verified`-label før merge | MET | Label satt; bevis-kommentar på PR #1812 (se hull-vurdering under). |
| Ingen DB-endringer, ingen mail-endringer | MET | Diff rører kun app/components/lib/.changes. |
| e2e-specs asserter ikke på nudges/funn-kort | MET | Grep i `e2e/` → 0 treff på testids/komponentnavn. |

## Gates (kjørt av evaluator i denne økta)

| Gate | Exit |
|---|---|
| `npx tsc --noEmit` | 0 |
| `npx vitest run` (nudgeQueue, discoveryPreviewCap, PasskeyEnrollmentPrompt, ProductUpdateBannerClient, HomeDiscoverySection) — 5 filer / 31 tester | 0 |
| `npx eslint` på 12 endrede/berørte filer | 0 (2 warnings i page.tsx — begge pre-eksisterende på main: `PairableGame` unused, HomeBody complexity 30) |
| CI på PR #1812 (verify + e2e @gate + scan) | alle pass |

## Vurdering av staging-beviset (PR #1812)

Beviset demonstrerer akseptkriteriet direkte: to samtidig kvalifiserte nudges
(Install + produktnytt) → kun Install vist med DOM-sjekk på fraværende
`product-update-banner`; dismiss uten forfremmelse; ny sidelast → fall-through
til produktnytt med avlest kø-tilstand. K7: 0/1/4-fordeling → nøyaktig 3 kort,
forespørsel ukappet, hale til stede.

**Hull (ikke-blokkerende, dekket av Type A-tester):**
- Push- og Passkey-slotsene ble aldri vist i staging-klikket (push krever
  installert PWA — udrivbart fra harnesset; passkey-gaten var 'no' for
  testspilleren). Prioritetsposisjonene deres hviler på `nudgeQueue.test.ts` +
  komponent-testene.
- K7s klubb-først-kuratering ikke demonstrert i klikk (0 klubbspill hos
  testspilleren) — dekket av `discoveryPreviewCap.test.ts`.

## Funn (normalisert `fil + kriterium`)

1. `components/notifications/NotificationCard.tsx:87` + K6-opprydding —
   doc-kommentaren «Speiler ProductUpdateBanner» refererer til det slettede
   server-skallets navn; layouten den speiler bor i `ProductUpdateBannerClient`
   (som fortsatt finnes). Trivielt doc-nit, ingen kodekonsekvens.
2. `components/pwa/PushNudge.tsx` + K6-flicker — en probe som ALDRI settler
   (henger, hverken resolve/reject) holder slotten på 'pending' og blokkerer
   productUpdate/passkey ut sidevisningen. Fail-safe i riktig retning (ingenting
   vises, ingen flicker); rejects håndteres. Kontrakten krever ingen timeout —
   observasjon, ikke mangel.
3. `app/[locale]/HomeNudges.tsx` + K6-oppførselsendring — produktnytt-banneret
   var før SSR-malt (server-komponent), nå klient-malt etter at install/push har
   avklart seg → vises marginalt senere. Innenfor kontraktens eksplisitte
   aksept («kan dukke opp litt senere, men aldri bli byttet ut»).

Ingen funn blokkerer. ACCEPT.
