# Spec: Klubb bli-med — fjern melding-feltet

**Issue:** #1136 · **Branch:** claude/1136-klubb-bli-med-fjern-melding-felt

## Problem

Landingssiden for «bli med i klubb via lenke» (`app/[locale]/klubber/bli-med/[shortId]/page.tsx:144-160`) viser et valgfritt hilsen-felt (`textarea`, `maxLength 200`) med label + hint over «Be om å bli med»-knappen. Meldingen er ikke en gate — den er valgfri kontekst som eieren ser i forespørselslista (`app/[locale]/klubber/[id]/page.tsx:231-235`). Fra subtraksjonsrevisjon runde 2: feltet legger friksjon på en flate der brukeren bare vil trykke «bli med». Server-actionen (`actions.ts:9,61-64,109`) parser og lagrer meldingen. Dette er en egen flate fra #1069-punktet for **spill**-join (`signup/[shortId]`) — kun klubb-varianten røres her.

## Design

1. **Fjern skjemafeltet** i `app/[locale]/klubber/bli-med/[shortId]/page.tsx`: slett hele `<div>`-blokken linje 144-160 (label + `textarea#join-message` + hint). Behold `<form>`, `<input type="hidden" name="shortId">` og `SubmitButton`. Oppdater docstring linje 31 («… form with optional message» → «… form») så kommentaren speiler koden.

2. **Rydd server-actionen** `app/[locale]/klubber/bli-med/[shortId]/actions.ts`:
   - Slett `const MESSAGE_MAX = 200;` (linje 9).
   - Slett `rawMessage`/`message`-parsingen (linje 61-64).
   - Fjern `message`-nøkkelen fra insert-objektet (linje 105-110) — insert blir `{ group_id, user_id, status: 'pending' }`. Kolonnen `group_join_requests.message` er nullable, så et insert uten den er gyldig; ingen DB-endring.
   - 0-rad-skriv-fella: insertet beholder eksisterende `insertError`-sjekk + `isDuplicateError`-gren; ikke svekk feilhåndteringen.

3. **Fjern foreldreløse i18n-nøkler** (T2 change-propagation — nøklene brukes KUN av denne siden; `signup`-variantens `messageLabel/messagePlaceholder` ligger i et annet namespace lenger ned og røres ikke):
   - `messages/no.json:3713-3715` — `messageLabel`, `messagePlaceholder`, `messageHint` under `klubb.join`.
   - `messages/en.json:3713-3715` — samme tre nøkler under `klubb.join`.

4. **Bruker-synlig endring** → PR med `Refs #1136` i commit-body og `Closes #1136` i PR-body; version-bump per commit-msg-hooken (`feat` → `npm version minor` som flyt-forenkling, eller `fix` → patch hvis du vurderer det som friksjons-retting — hooken håndhever at bump-typen matcher prefikset); én CHANGELOG-linje (Funksjoner ved `feat`, Feilrettinger ved `fix`); kjør `humanizer:humanizer` på CHANGELOG-linja. Staging-verify av bli-med-flyten før merge.

## Key Decisions

- **Behold admin-visningen og DB-lesningen.** `app/[locale]/klubber/[id]/page.tsx:231-235` og `lib/clubs/getClubDetail.ts:106,164-179` (select + mapping av `message`) røres IKKE. `req.message && (...)` rendrer ingenting for nye (null) forespørsler, men bevarer eventuelle historiske meldinger på allerede innsendte pending-forespørsler. Å fjerne lesningen ville skjult eksisterende kontekst uten gevinst.
- **Ingen migrasjon.** Kolonnen `group_join_requests.message` beholdes (ubrukt for nye rader, uskadelig). Å droppe kolonnen er en schema-endring med staging→prod-rekkefølge og prod-brannmur — uforholdsmessig for en UI-subtraksjon, og ville krevd samtidig endring av `getClubDetail`-selecten.

**Claude's Discretion:** Nøyaktig CHANGELOG-formulering og feat-vs-fix-framing (så lenge hooken passerer); om docstring-oppdateringen tas som egen linje eller i samme edit.

## Success Criteria
- [ ] Hilsen-`textarea` med label + hint er borte fra `/klubber/bli-med/[shortId]` — brukeren ser kun klubbnavn + «Be om å bli med»-knappen.
- [ ] «Be om å bli med» sender fortsatt en gyldig `group_join_requests`-rad (`status='pending'`) og redirecter til `?sent=1`; duplikat-forespørsel gir fortsatt vennlig «allerede sendt»-tilstand.
- [ ] `MESSAGE_MAX` og melding-parsingen er fjernet fra `actions.ts`; insert inneholder ikke `message`.
- [ ] De tre foreldreløse `klubb.join`-nøklene er fjernet fra både `no.json` og `en.json`; ingen andre call-sites refererer dem (`grep` bekrefter 0 treff utenom denne siden — nå fjernet).
- [ ] Admin ser fortsatt navn + dato på pending-forespørsler; eventuelle historiske meldinger vises uendret.
- [ ] Version bumpet + CHANGELOG-linje + staging-verify utført.

## Gates
- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npx tsc --noEmit` (fanger evt. type-drift fra fjernet i18n-nøkkel)
- [ ] `npx vitest run lib/clubs/getClubDetail.test.ts` (uendret helper skal forbli grønn)
- [ ] Staging-verify: `/klubber/bli-med/[shortId]` uten hilsen-felt → «Be om å bli med» → `?sent=1`-banner; admin ser forespørselen i klubb-sida.

## Files Likely Touched
- `app/[locale]/klubber/bli-med/[shortId]/page.tsx` — fjern skjemafeltet + docstring
- `app/[locale]/klubber/bli-med/[shortId]/actions.ts` — fjern `MESSAGE_MAX`, parsing, `message` fra insert
- `messages/no.json` — fjern tre `klubb.join`-nøkler (3713-3715)
- `messages/en.json` — fjern tre `klubb.join`-nøkler (3713-3715)
- `package.json` / `package-lock.json` / `CHANGELOG.md` — version-bump + CHANGELOG-linje

## Out of Scope
- `signup/[shortId]` (spill-join) sitt eget melding-felt — egen flate, dekkes av #1069-sporet.
- Admin-visningen av melding (`klubber/[id]/page.tsx:231-235`) og `getClubDetail`-selecten — beholdes for graceful degradering (se Key Decisions).
- Å droppe DB-kolonnen `group_join_requests.message` — ingen migrasjon i dette issuet.
