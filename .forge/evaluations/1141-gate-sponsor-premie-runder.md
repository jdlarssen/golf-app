# Forge-runder — #1141 (gate sponsor-felt på utfylt premie)

Bygget av Nattkjøreren (#1079) på Opus, 2026-07-15.

## Runde 1 — implementer + gates

Liten bug-fix (silent-data-loss) per kontrakt:

- `PrizesSection.tsx`: sponsor-`<input>` gates nå på
  `hasDescription = prizeDraft[slot.key].description.trim().length > 0`
  (samme disclosure-mønster som Vipps-feltets `hasEntryFee`). Premie-inputen
  rendres uendret. Ingen state nulles ved skjuling — serveren (`prunePrizes`)
  er sikkerhetsnettet, og `FormDataInputs` serialiserer begge felt uansett.
- `PrizesSection.test.tsx` (ny): én Type C render-test som låser disclosure
  begge veier (skjult ved tomt premie-felt, synlig når fylt).
- `fix` → patch-bump 1.202.2 → 1.202.3 + én Feilrettinger-linje i CHANGELOG.

Gates:
- `npm run build` — exit 0
- `npx eslint PrizesSection.tsx + .test.tsx` — exit 0
- `npx vitest run PrizesSection.test.tsx` — 1/1
- `git diff origin/main`: kun PrizesSection.tsx/.test.tsx, CHANGELOG, package(-lock)
- Server-pruning (`gamePayload.ts`, `prizes.ts`), `GameWizard.tsx`,
  `useGameFormState.ts` uendret

Konvergerte på runde 1 — ingen finding.

## Steg 4.5 — kryss-modell-gate

Uavhengig Sonnet-agent (annen modell enn byggeren, fersk kontekst, kontrakt + diff).
Verifiserte selv build/eslint/vitest, diff-scope, at `FormDataInputs` fortsatt
serialiserer begge hidden inputs (ingen verditap), og at `prizeSchema`-ens
`description.min(1)` garanterer at en lagret premie alltid har beskrivelse — så
edit-prefill aldri skjuler en lagret sponsor.

**Verdikt: CONFIRM** — ingen substansiell defekt.

## Runde 2 — rebase på main + utvidelse til logo-feltet (hovedchat, 2026-07-15)

Runde 1 var bygget på main fra før #1052 (sponsor-logo-picker per slot,
8b33a056) ble merget — `PrizesSection.tsx` konflikterte substansielt. Branchen
ble bygget på nytt fra fersk main (eier-godkjent utvidelse):

- Gatingen dekker nå BÅDE sponsor-`<input>` og `SponsorLogoField` — samme
  begrunnelse: serveren dropper hele slotet uten beskrivelse
  (`if (!description) continue` i `parsePrizesFromFormData`), så en logo
  lastet opp på et premie-løst slot ville også blitt stille kastet.
  **Avvik fra opprinnelig kontrakt-scope** (kontrakten er eldre enn #1052);
  eier valgte utvidelse framfor minimal rebase + følge-issue.
- Skjuling er fortsatt ikke-destruktiv: `sponsorLogoPath` beholdes i state
  når beskrivelsen tømmes (refylling viser logoen igjen). Publiseres slotet
  uten beskrivelse, beskjærer serveren pathen — bucket-objektet blir da
  foreldreløst, samme kjente kostnad som når wizard-en forlates etter opplast
  (immediate-upload-designet fra #1052-kontrakten).
- Testen utvidet (fortsatt én Type C-test): asserter at også
  `prize-<slot>-logo-upload` er borte på tomt slot og synlig ved fylt.
- Bump re-satt til 1.205.0 → 1.205.1 (main hadde flyttet seg); CHANGELOG-linja
  omskrevet til å nevne logo-opplasteren.

Gates runde 2:
- TDD: testen kjørt rød mot ugatet komponent (feilet på sponsor-assertion),
  grønn etter gating — 1/1
- `npx vitest run` GameWizard + GameForm + PrizesSection — 77/77
- `npx eslint` begge filer — exit 0
- `npm run build` — grønn (Next-rutetabell produsert)

Staging-re-verifisering kreves (#1076) — runde 1-beviset er foreldet etter
rebase; ny klikkrunde postes på PR-en før merge.
