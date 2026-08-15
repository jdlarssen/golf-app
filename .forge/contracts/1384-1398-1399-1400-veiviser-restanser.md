# Spec: Veiviser-restanser etter #1379 — utkast-hint, pending-knapper, død param, score_visibility

**Issues:** #1384 · #1398 · #1399 · #1400 · **Branch:** claude/veiviser-restanser-1384-1398-1399-1400

Fire små funn i opprett-spill-veiviseren (`app/[locale]/admin/games/new/`), alle fra
#1379-runden / HCD-auditen. Ingen produktvalg — hvert issue har én åpenbar løsning
(#1384 velger hint-linja, ikke fokus-på-klikk: en `disabled`-knapp får ingen click).
Én commit per issue med `Refs #N`; PR-body `Closes #N` per issue. Bruker-synlig →
`.changes/`-notat per fix-commit og staging-verifisering før merge.

## Design per issue

### #1384 — hint under deaktivert «Lagre utkast» (fix)
`sections/ReadyStep.tsx` ca. :591–600: utkast-knappen er `disabled={name.trim() === ''}`
uten hint/aria. Speil publiser-knappens mønster (:551–575):
- `aria-describedby={name.trim() === '' ? 'draft-missing-name' : undefined}` på knappen.
- Rett under knappen, KUN når `name.trim() === ''`:
  `<p id="draft-missing-name" className="text-xs text-muted text-center">{t('draftMissingName')}</p>`.
- Nye nøkler `wizard.ready.draftMissingName` i `messages/no.json` + `messages/en.json`:
  no: «Sett et spillnavn først — trykk på navnet over.» · en: «Set a game name first — tap
  the name above.» (kjør humanizer-sjekk på den norske; hold den kort.)

### #1398 — pending-tilstand på publiser/utkast (fix)
`sections/ReadyStep.tsx` :209/:218: `useActionState` returnerer også `isPending` som
tredje element — `const [publishResult, publishAction, publishPending] = …` og
`[draftResult, draftAction, draftPending]`. `components/ui/Button.tsx` har allerede
`pending`/`pendingLabel` (disabled + aria-busy + spinner-tekst).
- Publiser-knapp: `pending={publishPending}` `pendingLabel={t('publishPending')}`, og
  `disabled={!canPublish || draftPending}` (ikke la utkast-forsøk og publiser-forsøk løpe
  samtidig).
- Utkast-knapp: `pending={draftPending}` `pendingLabel={t('draftPending')}`,
  `disabled={name.trim() === '' || publishPending}`.
- Nye nøkler `wizard.ready.publishPending` («Publiserer …» / "Publishing …") og
  `wizard.ready.draftPending` («Lagrer utkast …» / "Saving draft …").
- Sjekk at `Button` sin `pending` ikke kolliderer med `formAction`/`type="submit"` (les
  Button.tsx). Merk: hint-linja fra #1384 skal IKKE vises mens `draftPending` (name er da
  satt uansett).

### #1399 — død `emails`-/`error`-søkeparameter i `/opprett-spill` (refactor)
`app/[locale]/opprett-spill/page.tsx`: `SearchParams` har `error` + `emails` (:43–44),
`buildErrorMessage` (:206–215), `errorMessage` (:217) og `<Banner tone="error">`-blokka
(:262–266). Ingen kode produserer `?error=`/`?emails=` mot `/opprett-spill` lenger
(#1379 flyttet feil til action-retur; grep etter `opprett-spill?error`/redirect med error
mot ruta gir 0 treff — verifiser selv før du sletter). Admin-tvillingen
`admin/games/new/page.tsx` har allerede droppet begge. Fjern alle fire delene. IKKE rør
`messages/*.json` (`wizard.errors.*` brukes fortsatt av ReadyStep og edit-flyten) og IKKE
rør `admin/games/[id]/actions.ts` (den produserer fortsatt `?error=&emails=` mot
detaljsida — annen rute). Behold `Banner`-importen (revansje-/shortage-bannerne bruker
den). Avvik fra issue-tittel: `error` fjernes også — den er like død og `buildErrorMessage`
gir ingen mening uten `emails`; nevn det i closing-kommentaren.

### #1400 — løft `score_visibility` inn i veiviser-staten (fix)
React-doms `requestFormReset` nullstiller uncontrolled felt ved hver form-action-dispatch;
radioene i `sections/AdvancedSettingsSection.tsx` (:108–135, `defaultChecked`) hopper
derfor tilbake til «Live» når publisering feiler. Løsning etter #1011-mønsteret
(side_* i samme fil + `GameWizard.tsx` :1035–1060 hidden-input-blokka):
1. `useGameFormState.ts` (:571–573): behold `initialScoreVisibility`/`lockScoreVisibility`
   (BasicsSection/GameForm bruker dem), og legg til
   `const [scoreVisibility, setScoreVisibility] = useState<'live' | 'reveal'>(initialScoreVisibility)`;
   eksponer begge i retur-objektet/typen `GameFormState`.
2. `AdvancedSettingsSection.tsx`: radioene blir controlled — `checked={scoreVisibility === 'live'}`
   / `=== 'reveal'`, `onChange={() => setScoreVisibility(...)}`, og **uten `name`** (samme
   grunn som #1011: hidden input i GameWizard eier serialiseringen; ingen duplikat-navn).
   `disabled={lockScoreVisibility}` beholdes.
3. `GameWizard.tsx` hidden-blokk: `{!lockScoreVisibility && <input type="hidden" name="score_visibility" value={scoreVisibility} />}`
   — låst (edit av aktivt spill) speiler dagens semantikk der disabled radioer ikke
   serialiseres (`lib/games/gamePayload.ts:282` faller da til default; les hva default er
   og bekreft at edit-flyten for låst spill ikke endres — kjør `actions.test.ts`).
   Oppdater kommentaren på :1044–1046 (den sier eksplisitt at radioene er uncontrolled).
4. `wizardStatePersistence.ts`: `score_visibility` er nå state → ta den inn i
   `PersistedInitialValues` (+ fjern «utelatt med vilje»-punktet i kommentaren :49–50) og i
   mappingen state→persistert (finn hvor `values` bygges, ca. :115) og persistert→
   `initialValues`. Oppdater `wizardStatePersistence.test.ts` deretter (eksisterende
   test-mønster; ingen ny testfil).
5. `BasicsSection.tsx` (GameForm, legacy full-skjema) røres IKKE — utenfor scope; den har
   ikke wizardens action-return-flyt.
6. Test (Type A, i `useGameFormState.test.ts` etter eksisterende mønster): initial 'reveal'
   → `scoreVisibility === 'reveal'`; `setScoreVisibility('live')` oppdaterer. Maks én ny
   `it`. Ingen ny render-test (GameWizard.test.tsx finnes — kjør den, legg ikke til).

## Success Criteria
- [ ] #1384: uten navn viser steg 5 hint-linja under utkast-knappen, knappen har `aria-describedby` som peker på den; med navn er begge borte.
- [ ] #1398: under publisering/utkast-lagring viser knappen pending-teksten og er `aria-busy`; den andre knappen er disabled imens.
- [ ] #1399: `opprett-spill/page.tsx` leser verken `error` eller `emails`; ingen error-Banner-blokk; `grep -rn "sp.emails\|sp.error" app/\[locale\]/opprett-spill` = 0 treff.
- [ ] #1400: velg «Skjul til slutt» på steg 5, utløs publiseringsfeil (f.eks. tomt roster + invite_only, eller mock i test) → radioen står fortsatt på «Skjul til slutt»; publisert spill får `score_visibility='reveal'` (staging-verifisering: opprett spill med reveal, sjekk `games.score_visibility` via staging-DB eller game-home).
- [ ] Låst spill (edit aktivt) sender ikke `score_visibility` (hidden input ikke montert).
- [ ] `messages/no.json` og `messages/en.json` har alle nye nøkler (draftMissingName, publishPending, draftPending); ingen MISSING_MESSAGE i konsollen på steg 5.
- [ ] `.changes/1384-*.md`, `.changes/1398-*.md`, `.changes/1400-*.md` finnes (type fix); #1399 er refactor (ingen notat).
- [ ] `npm run build`, `npm run lint`, co-located vitest grønt.

## Gates
- [ ] `npx vitest run "app/[locale]/admin/games/new"` (hele katalogen)
- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] Staging-klikkrunde av steg 5 (hint, pending, reveal-overlevelse) før merge

## Out of Scope
- Fokus-på-klikk-varianten i #1384; BasicsSection/GameForm; #1385 (utkast-gjenopptak-UI); #1653 (?bane=&step=).
