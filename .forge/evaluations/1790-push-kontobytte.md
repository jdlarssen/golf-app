# Evaluering #1790 — push ved kontobytte: **ACCEPT**

Evaluert 2026-08-30 av fersk-kontekst-evaluator på branch `claude/push-error-account-switch-8dd0bc`
(HEAD `e2fe06e1`, commits `a7ac5d91` + `e2fe06e1`). Alle kommandoer kjørt selv i denne økten;
byggerens rapport er ikke lagt til grunn for noe kriterium.

## Omfang mot kontrakten

`git diff HEAD~2 --stat`: 12 filer, +703/−19. Stemmer med «Files Likely Touched»:
migrasjon 0167, begge actions-filene, LogoutForm, localDataCleanup, hardening-testen,
ny pgTAP-fil, `.changes/1790-push-kontobytte.md`. `lib/pwa/push.ts`, `PushToggle.tsx`
og `PushNudge.tsx` er urørt — kontrakten merket dem «evt.»/«ved behov», og gjenbruken av
eksisterende `disablePush` gjorde endring unødvendig. `lib/supabase/affectedRows.ts` er
urørt som påkrevd (Out of Scope); fallbacken bor i ny `lib/supabase/claimFallback.ts`.
Ingen scope-fremmede endringer funnet i diffen.

## Success Criteria

### 1. Konto B kan registrere push uten 42501 — OPPFYLT (staging-runtime-bevis)

Kjørt `verify-1790-staging.mjs` mot torny-staging (prod-guard i skriptet, kun
`e2e-1790-*`-rader, opprydding bekreftet): **14/14 checks passed, exit 0**. Nøkkelbevis:

- Repro av selve buggen: B's upsert på A's token → `status=403 code=42501` (begge tabeller).
- `claim_apns_token` for B → 204; raden eies etterpå av B, nøyaktig én rad.
- Etter claim virker B's **ordinære** upsert igjen (status 200) — selvhelende sti.
- `claim_push_subscription` speilet: claimet rad har B's `p256dh`, ikke A's gamle nøkler.
- A's andre enhetsrad urørt av claimet (scope = presentert verdi, ikke bruker).

Dette er REST-nivå på nøyaktig de skriveoperasjonene `registerApnsToken`/`savePushSubscription`
utfører. Web-**UI**-togglen kan ikke klikk-testes på staging (ingen `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
→ `enablePush` = 'unsupported') og iOS-skallets re-registrering krever eierens enhet — begge
kjente, kontrakts-aksepterte hull; fallbacken bor i actions-laget som begge stiene deler.

### 2. Hostile-tester — OPPFYLT

- Live på staging: direkte PATCH som prøver å rebinde A's rad → 200 med **0 rader**
  (RLS-avvist); anon-kall mot RPC-en → 401/`42501` (ingen EXECUTE).
- pgTAP `supabase/tests/push_device_claim_rls_test.sql` (ny): 17 asserts lest kritisk —
  refusert upsert, urørt rad etter refusjon, hostile PATCH, claim-suksess, eierskifte,
  én-rad-invariant, nabo-rad urørt, fresh-value-claim binder til kaller, anon-refusjon;
  speilet for push_subscriptions. `plan(17)` stemmer med min egen opptelling (10 + 7).
  Probene følger fixture-riggen (`torny_rls.as_user`/`as_service`/`seed_active_game`),
  og den nye `as_anon()` bruker samme `set_config(..., null, true)`-mønster som
  eksisterende `as_service()` (fixtures/rls_helpers.psql:124) — presedens i CI.
- RPC-ene tar aldri user_id fra klient: parametre er kun token/endpoint + metadata
  (0167:36, 75); `auth.uid()` bindes i funksjonskroppen (0167:43, 84).

### 3. Logout rydder enhetens push-tilstand — OPPFYLT (kode + unit + delvis runtime)

- `LogoutForm.tsx:43–54`: injiserer `disablePush(removePushSubscription, removeApnsToken)`
  inn i `prepareLogoutBrowser` — server-rad + browser-sub + `torny-apns-token` dekkes av
  eksisterende `disablePush` (push.ts:242–266: native-gren kaller `nativeRemove` +
  `forgetNativeToken` + `plugin.unregister`; web-gren `unsubscribe()` + `remove(endpoint)`).
- `prepareLogout` (localDataCleanup.ts:90–92, 111): cleanupen starter parallelt med drainen,
  har egen `.catch(() => {})`, avgjør aldri drain-utfallet, og hele kjøringen ligger inne i
  4 s-racen (`prepareLogoutBrowser:187–190`) — logout kan aldri blokkeres; formen submitter
  i tillegg uansett via egen try/catch (`LogoutForm.tsx:55–58`).
- `lib/sync/` er fri for server-action-imports (grep: CLEAN) — callbacken injiseres av formen.
- Runtime: server-delete-semantikken (removeApnsToken-stien) verifisert live under bruker-JWT
  (staging-check 14: DELETE på egen claimet rad → 200, 1 rad). Byggerens staging-klikkrunde
  (login → Logg ut → /login uten heng) er notert men ikke gjentatt av meg.
- **VERIFICATION GAP** (kontrakts-forutsett): logout offline / uten SW kan ikke bekreftes i
  økten — men koden beviser at grenen kun kan ende i timeout→'kept', aldri i blokkert logout.

### 4. Type A-tester for fallback-logikken — OPPFYLT

`lib/supabase/claimFallback.test.ts` (7 tester): suksess → claim aldri kalt; 42501 → claim
én gang; claim-feil → kast med kontekst; 23505 og kodeløs feil → `expectOne`-kast uten claim;
0 rader → `NoRowsAffectedError`; 2+ rader → kast. Rå `error.code` leses FØR `expectOne`
(claimFallback.ts:27–34) — delt helper urørt, akkurat som kontrakten krever.
I tillegg 8 nye `prepareLogout`-tester (cleanupPush kjøres én gang, awaites før retur,
sluker rejection OG synkron throw, blokkerer hverken cleared- eller kept-stien).

### 5. Ny assert i security_definer_hardening_test.sql — OPPFYLT

`plan(7→13)`; 6 nye asserts (linje 115–181): search_path i proconfig, anon UTEN EXECUTE,
authenticated MED EXECUTE — per RPC. Samme katalog-mønster som de eksisterende #671-assertene.

### 6. Gates — GRØNNE (egne kjøringer)

| Gate | Resultat |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` (5 berørte filer) | exit 0 |
| `npx vitest run` (full suite) | **518 filer / 6984 tester passed, exit 0** (exit-koden sjekket — ikke bare tallene) |
| pgTAP | **VERIFICATION GAP** — ingen container-runtime lokalt; kontrakts-forutsett. SQL-en manuelt vurdert (plan-tall korrekte, prober konsistente med fixture-riggen); `migrations-gate.yml` kjører `supabase test db` på main etter merge |
| Staging-runtime | 14/14, exit 0 (skript med prod-guard, selvryddende) |
| CI / merge | Venter — **aldri-auto** (auth-endring): merge krever eksplisitt eier-godkjenning, prod-migrasjon bak #1074-brannmuren |

## Migrasjons- og kodekvalitet (kritisk lesing)

- 0167 følger herdingsmønsteret eksakt: `security definer` + `set search_path = ''` +
  skjema-kvalifiserte referanser + `revoke from public, anon` + `grant to authenticated`.
  FORCE-RLS-premisset er dokumentert som guardrail i migrasjonen (0167:24–27), som krevd.
- Migrasjonen er påført staging (bevist live: RPC-ene svarer 204 under bruker-JWT);
  prod IKKE påført — korrekt per kontrakten.
- Docstringene i begge actions er omskrevet til ny semantikk (naiv upsert avvises fortsatt;
  takeover kun via possession-RPC).
- `lib/database.types.ts`-tilleggene matcher generator-stilen (`Returns: undefined` for
  void-RPC-er, alfabetisk Args) — men se merknad 2 under.
- `.changes/1790-push-kontobytte.md`: `type: fix` + `issue: 1790`, brødtekst én setning
  (~140 tegn ≤ 400), ingen feat-felter. `weekly-release.mjs --dry-run` aksepterer notatet
  (fail-closed-validatoren passerte, 1.235.0-blokka genereres).
- Begge commit-meldingene har `Refs #1790`; logout-commiten korrekt `[no-changelog]`
  (notatet rir på claim-commiten).

## Merknader (ikke blokkerende)

1. **Grant til service_role i tillegg til authenticated** (0167:67, 110) — kontrakten nevnte
   kun authenticated (0161-mønsteret). Harmløst (service_role bypasser RLS uansett), men et
   lite avvik fra referansemønsteret.
2. **`lib/database.types.ts` er håndskrevet** i generator-stil — neste `gen:types` mot prod
   FØR prod-migrasjonen er påført ville fjernet RPC-typene igjen. Rekkefølgen (prod-migrasjon
   → evt. typegen) må holdes; dette er allerede normal prosedyre.
3. En hengende `cleanupPush` konverterer et ville-vært-'cleared'-utfall til 'kept' via racen —
   trygg retning (eierbytte-vakta i SyncBoot dekker nestemann), og dokumentert i koden.

## Kjente, aksepterte hull (fra oppdraget — nevnt, ikke tellende mot verdict)

pgTAP ikke kjørt lokalt (CI-gate på main tar den) · web-toggle uklikkbar på staging (mangler
VAPID-nøkkel) · iOS-skallets re-registrering testes av eier på TestFlight-enhet ·
logout-klikkrunden på staging kjørt av byggeren, ikke gjentatt her.

## Konklusjon

Begge kontraktsdeler er bygget som spesifisert (Alternativ A), sikkerhetsgrensene holder
under live hostile prober, alle kjørbare gates er grønne i egne kjøringer, og de to
verifikasjonshullene er nøyaktig dem kontrakten forutså. **ACCEPT.**
