# Evaluering: #1380 veiviser-persistens

**Verdikt: ACCEPT**

Evaluert mot `.forge/contracts/1380-wizard-survives.md` (Alternativ A) på branch
`claude/1380-wizard-survives` (HEAD 7246d9a3, tre commits over origin/main).
NB: to-dot-diffen mot origin/main viser fantom-slettinger av #1444-filer — branchen
ligger bak main; tre-dot-diffen (reelle endringer) er kun veiviser-filene +
`lib/games/prizes.ts`.

## Kriterier

- **S1 (back = forrige steg)** — PASS (unit) / DEFERRED (staging).
  `goToStep` pusher (`GameWizard.tsx:365-370`), `GameWizardStepHistory.test.tsx`
  asserter push per Neste/Forrige og replace-only på `?step=99` (ingen back-felle).
  Ekte history-oppførsel kan ikke drives i vitest (delt setup stubber push) —
  staging-klikket er den reelle porten, som kontrakten selv sier.
- **S2 (reload → samme steg + inndata)** — PASS (unit) / DEFERRED (staging).
  Steg leses fra URL (`?step=4` overlever reload); restore-testen i
  `GameWizard.test.tsx` («gjenoppretter arrangement, format, bane og spillere»)
  verifiserer seeding gjennom alle fire stegene.
- **S3 (publish/draft → payload borte; cup-gren rydder)** — PASS.
  Begge knappene i `sections/ReadyStep.tsx:551/592` er `type="submit"` +
  `formAction` inne i veiviserens `<form onSubmit={handleSubmitStart}>` —
  påstanden «begge flyter gjennom onSubmit» stemmer i koden. `handleSubmitStart`
  rydder nøkkel + timer + ref; cup-grenen (`isNewCupFlow`) kaller
  `clearWizardDraft` og skriver aldri. Test dekker draft-lagring-sletting.
- **S4 (TTL + korrupt payload forkastes stille, nøkkel sveipes)** — PASS.
  `loadWizardDraft` forkaster og `removeItem`-er ved korrupt JSON, feil versjon,
  ikke-numerisk/framtidig `savedAt` (age < 0) og alder > 60 min; `it.each`-suiten
  i `wizardStatePersistence.test.ts:110-134` + TTL-/klokke-testene dekker alle.
- **S5 (kommentarene beskriver faktisk oppførsel)** — PASS.
  Header (`GameWizard.tsx:24-34`) beskriver push-ved-intensjon /
  replace-ved-normalisering + sessionStorage-speiling; normaliserings-effektens
  kommentar (`:356-375`) matcher koden linje for linje. Den gamle løgnen
  («replace … én entry per steg-overgang») er borte.

### Adversarielle sjekker

- **a (intent-ref race)** — PASS. Ref settes synkront FØR `setStep`; effekter
  kjører først etter commit, så flagget kan aldri leses stale. Paringen er 1:1:
  `goToStep` early-returner på `next === step`, så hvert flagg-sett gir nøyaktig
  én kjøring av `[step]`-effekten som konsumerer det. To raske navigasjoner før
  URL-en rekker å oppdatere gir i verste fall en transient ekstra sync-runde som
  konvergerer (URL→state-effekten setter steget tilbake, normaliserings-effekten
  ser URL == steg og no-op-er) — ingen tapt push, ingen løkke.
- **b (remount-via-key)** — PASS. Uten utkast: `loadWizardDraft` → null → ingen
  setState → `key='fresh'` uendret, null remount (vanlig sti urørt). Med utkast:
  én remount etter første paint (useEffect) — én frame blank form før restore,
  akseptabel UX. SSR-trygt: sessionStorage kun i effekt + `typeof window`-guard.
- **c (mount-kontekst-fingeravtrykk)** — PASS. Fingeravtrykket
  (intent | tournament_id | game_mode | lock_game_mode | group_id/defaultGroupId)
  skiller cup-lenke (`?tournament_id` → tournament_id + låst mode), revansje
  (`/opprett-spill?fra=` setter initialIntent + game_mode via
  `buildRevansjeInitialValues`) og klubb-dyplenke (defaultGroupId) fra vanlig
  besøk — verifisert mot begge page.tsx-ene. Ny-cup-flyten skriver aldri utkast
  (isNewCupFlow-grenen rydder) og CupSetup eier egen state, så restore lekker
  ikke inn. Se funn 2–3 for to ikke-blokkerende nyanser.
- **d (reconciliation)** — PASS. Slettet bane → course + tee nulles; fremmed tee
  → kun tee; players OG player_genders filtreres mot `players`-prop ∪
  `extra_players` (økt-gjester beholdes). Alle fire har egne tester.
- **e (debounce)** — PASS. 400 ms setTimeout med cleanup, dedupe på serialisert
  JSON, `lastWrittenRef` seedes til mount-snapshotet → åpne-og-forlate skriver
  ingenting på et vanlig besøk (verifisert i kode; se funn 1 for prefill-unntaket).
- **f (goPrev pusher, ikke router.back())** — PASS. Begrunnelsen står i koden
  (direktelenke-landing på `?step=3` ville fått back til å forlate veiviseren);
  browser-back/-forward håndteres fortsatt av den uendrede URL→state-effekten
  (`:333-344`), som fungerer identisk med push-entries.
- **g (vitest.setup.ts urørt)** — PASS. Ikke i tre-dot-diffen; de lokale
  navigasjons-mockene bor i egen fil (`GameWizardStepHistory.test.tsx`) med
  fil-scope — `GameWizard.test.tsx` beholder delt setup.
- **h (ingen beforeunload/localStorage/ny copy)** — PASS. Grep treffer kun
  kommentarer som forklarer fraværet; ingen `messages/*`-endringer i tre-dot-diffen.

### Gates (kjørt i denne evalueringen, Node 22)

- `npx vitest run "app/[locale]/admin/games/new" lib/games/prizes.test.ts`:
  21 filer / 273 tester grønne.
- `npm run lint`: 0 errors (55 pre-eksisterende warnings).
- `npx tsc --noEmit`: ren.
- `npm run build`: grønn — **kjørt på nytt her fordi den TRENGTES**: ci.yml har
  ingen build-steg (kun typecheck/test/lint/e2e; Vercel bygger først etter
  merge), og repoet har historikk med build-only-feil. Nå bevist grønn.
- `node scripts/weekly-release.mjs --dry-run`: notatet
  `.changes/1380-veiviser-overlever-tilbake.md` validerer (fail-closed-porten).

### Commit-hygiene — PASS

Tre commits, alle med `Refs #1380` i body. `5bf41780` og `22877a86` (refactor)
har `[no-changelog]`; `7246d9a3` (fix) bærer gyldig
`.changes/1380-veiviser-overlever-tilbake.md` (type: fix, issue: 1380).

## Funn

Ingen blokkerende. Tre ikke-blokkerende observasjoner + én kontrakt-avvik-notis:

1. `GameWizard.tsx:394-405` + `:456-483` (kriterium e) — på prefilte mounts
   (revansje `?fra=`, banelenke `?bane=`) fyrer auto-navn-effekten ved mount
   (bane finnes → `setName`), som endrer snapshotet og skriver et utkast etter
   400 ms UTEN brukerinput. «Åpne og forlate skriver ingenting» holder altså kun
   for vanlige besøk. Konsekvensen er godartet (restore legger identisk prefill
   + auto-navn over identisk prefill), men avviker fra hensikten bak
   `lastWrittenRef`-seedingen.
2. `wizardStatePersistence.ts:343-345` (kriterium c) — kontekst-mismatch ved
   lasting SLETTER det liggende utkastet (ikke bare ignorerer det): en same-tab
   omvei innom en cup-/revansje-lenke fjerner et påbegynt vanlig utkast.
   Bevisst valg (test asserter blank start), og sessionStorage er per fane, så
   sjeldent i praksis — men verdt å vite ved staging-klikket.
3. `wizardStatePersistence.ts:140-156` (kriterium c) — `?bane=`-dyplenken
   (#1023, kun course_id-prefill) deler fingeravtrykk med vanlig besøk, så et
   liggende utkast vinner over bane-prefillen. Forsvarlig (arrangørens egne
   <60 min gamle valg vinner), men ikke omtalt i kontrakten.
4. Kontrakt-avvik (Livssyklus, «eksplisitt avbryt»): veiviseren HAR ingen
   avbryt-kontroll (grep i GameWizard/ReadyStep: null treff), så det finnes
   ingenting å koble sletting til — TTL-en dekker forlatte utkast.
   Suksesskriterium 3 nevner kun publish/draft, så dette er et tekst-avvik,
   ikke et funksjonshull. Bør nevnes i PR-ens «Teknisk».

## Deferred (kontraktens egen port)

Staging-klikkrunden er IKKE kjørt i denne evalueringen: browser-back midt i
flyten (S1), reload midt i steg 4 (S2 ende-til-ende), `?step=99` uten back-felle
i ekte history, og publish-sluttrens live. Den runden er merge-porten per
kontraktens Gates-seksjon og repoets staging-verified-regel (#1076).
