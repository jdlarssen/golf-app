# Spec: Wizard premie — gate sponsor-felt på utfylt premie

**Issue:** #1141 · **Branch:** claude/1141-wizard-premie-gate-sponsor-pa-utfylt-premie

## Problem

Premiebordet i opprett-/rediger-spill (`PrizesSection`, #1051) rendrer sponsor-`<input>`-et ubetinget for hvert slot. `app/[locale]/admin/games/new/sections/PrizesSection.tsx:94-106` viser sponsor-feltet uansett om slotets premie-beskrivelse er fylt ut — 3 podium-slots default (6 felt totalt), opptil 7 slots (14 felt) med 2 LD + 2 CTP. Det gir dødvekt i skjemaet, men verre: en sponsor tastet på et slot uten premie-beskrivelse forkastes stille av serveren. `lib/games/gamePayload.ts:350` (`if (!description) continue;`) hopper over hele slotet, så en sponsor uten premie persisteres aldri — en silent-data-loss-felle. Fiksen speiler Vipps-feltets disclosure (`RegistrationSection.tsx:94` deriverer `hasEntryFee`, `:286` gater `<input>`-et): vis sponsor-feltet først når slotets premie-beskrivelse er utfylt.

## Design

1. **Gate sponsor-`<input>`-et på utfylt premie** i `PrizesSection.tsx:94-106`. Inne i `slots.map`-callbacken, deriver om slotet har en beskrivelse (trim), f.eks. `const hasDescription = prizeDraft[slot.key].description.trim().length > 0;`, og render sponsor-`<input>`-blokken (:94-106) kun når `hasDescription` er sann. Premie-`<input>`-et (:81-93) rendres uendret. Speiler `hasEntryFee`-mønsteret i `RegistrationSection.tsx:94/286`.

2. **Ikke rør serialiseringen.** `FormDataInputs` (`GameWizard.tsx:935-948`) monterer alltid hidden inputs for både `desc` og `sponsor` fra `prizeDraft`-state — uavhengig av hva `PrizesSection` viser (#1011-mønsteret). Å skjule det synlige sponsor-feltet mister derfor ingen serialisert verdi. Server-regelen (`parsePrizesFromFormData`/`prunePrizes` i `gamePayload.ts`/`prizes.ts`) beholder «sponsor uten premie = droppes», så ingen server-endring trengs.

3. **Ett hjem — begge flyter dekket.** `PrizesSection` deles av wizard- og edit-pathen (jf. komponent-docstring :9-13), så gatingen i steg 1 gjelder begge automatisk. Ingen andre call-sites å endre (grep bekreftet: `prize-*-sponsor` rendres kun her).

4. **Bruker-synlig endring → PR-flyt.** Commits med `Refs #1141`; PR med `Closes #1141`. Version-bump + CHANGELOG-linje (se Key Decisions). Staging-verify av premiebord-steget på `torny-staging` før merge.

## Edge Cases & Guardrails

- **Edit-flyt (`prizeDraftFromList`):** persisterte premier har alltid en beskrivelse (server-pruningen krever det), så et slot med lagret sponsor har alltid en beskrivelse → sponsor-feltet vises fortsatt ved redigering. Gatingen skjuler aldri en legitimt lagret sponsor.
- **Transient stale-sponsor:** taster admin premie + sponsor og deretter tømmer premie-feltet, forsvinner sponsor-feltet mens verdien blir liggende i `prizeDraft`-state (skjult). Det er tilsiktet og symmetrisk med Vipps-feltet (som heller ikke nuller `paymentLink` når beløpet går til 0) — serveren beskjærer den stale verdien ved publisering. Ikke nuller state ved skjuling.

## Key Decisions

- **Skjul uten å nulle state.** Matcher Vipps-presedensen (`RegistrationSection.tsx:91-94`-kommentaren) og holder endringen minimal; server-pruningen er sikkerhetsnettet. Å nulle `sponsor` on-hide ville vært ekstra state-logikk uten gevinst.
- **Commit-type `fix` (patch-bump + Feilrettinger-linje).** Endringen lukker en reell silent-data-loss-felle i admin-skjemaet, ikke bare kosmetikk → hører hjemme i CHANGELOG under Feilrettinger. `npm version patch --no-git-tag-version`.

**Claude's Discretion:** Nøyaktig hvordan `hasDescription` deriveres/navngis; om du legger til én fokusert Type C render-test for `PrizesSection` (ingen finnes i dag) som verifiserer at sponsor-feltet skjules ved tomt premie-felt og vises når det fylles — anbefalt, men holdt til maks én render-test per komponent (test-disiplin Type C). Eksakt CHANGELOG-ordlyd på Feilrettinger-linja.

## Success Criteria
- [ ] Sponsor-`<input>` for et premie-slot vises kun når slotets premie-beskrivelse er utfylt (trimmet, ikke-tom).
- [ ] Med tomt premie-felt er `data-testid="prize-<key>-sponsor"` ikke i DOM-en for det slotet; premie-feltet (`prize-<key>-desc`) vises fortsatt.
- [ ] Fyller man premie-feltet, dukker sponsor-feltet opp; det beholder verdien via `FormDataInputs`-serialiseringen (ingen tap ved publisering).
- [ ] Redigering av et publisert spill med lagret sponsor viser sponsor-feltet (beskrivelse finnes alltid der).
- [ ] Ingen endring i `gamePayload.ts`/`prizes.ts` (server-pruningen uendret).
- [ ] Version-bump + CHANGELOG Feilrettinger-linje; staging-verify utført.

## Gates
- [ ] `npm run build` — grønt
- [ ] `npm run lint` — grønt på berørte filer
- [ ] `npx vitest run "app/[locale]/admin/games/new/sections/PrizesSection.test.tsx"` — grønt (kun hvis render-test legges til)
- [ ] staging-verify: premiebord-steget på `torny-staging` — sponsor-felt skjult til premie fylles, verdi bevart ved publisering

## Files Likely Touched
- `app/[locale]/admin/games/new/sections/PrizesSection.tsx` — gate sponsor-`<input>` på utfylt premie-beskrivelse
- `app/[locale]/admin/games/new/sections/PrizesSection.test.tsx` — (valgfri) én render-test for disclosure-oppførselen
- `package.json` / `package-lock.json` — patch-bump
- `CHANGELOG.md` — Feilrettinger-linje

## Out of Scope
- Server-parsing/-pruning (`parsePrizesFromFormData`, `prunePrizes`, `gamePayload.ts:350`) — beholdes som er.
- `FormDataInputs`-serialiseringen (`GameWizard.tsx`) og `prizeDraft`-state i `useGameFormState.ts` — røres ikke.
- Slot-utvalg, LD/CTP-gating, matchplay-podium-skjuling og øvrig premiebord-layout.
- Vipps-/startkontingent-feltene i `RegistrationSection.tsx` (kun referansemønster).
