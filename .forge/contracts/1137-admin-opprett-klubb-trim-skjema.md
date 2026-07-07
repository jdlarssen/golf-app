# Spec: Admin opprett-klubb — trim skjemaet til navn + eier-e-post

**Issue:** #1137 · **Branch:** claude/1137-admin-opprett-klubb-trim-skjema

## Problem
Opprett-klubb-skjemaet (`app/[locale]/admin/klubber/ny/page.tsx:97-108`) har `member_cap`-Input + `VarighetField`. Rett etter opprettelse redirecter actionen (`actions.ts:86`) admin til klubbens detaljside, der de **identiske** feltene finnes igjen via `updateClubTerms` (`admin/klubber/[id]/page.tsx:144-158`). Avtale-rammene er altså dobbelt: admin må ta stilling til medlemstak og varighet ved opprettelse, selv om de kan (og uansett bør) settes ett steg senere når klubben faktisk er opprettet. Skjemaet blir mer å skumme enn nødvendig for den vanlige «opprett en klubb»-handlingen.

`admin_create_club`-RPC-en (`supabase/migrations/0076_clubs_governance_and_roles.sql:45-79`) behandler allerede begge parametrene som nullable: `p_member_cap` valideres kun når non-null (linje 70), og `p_valid_until` settes rått inn i `groups` (linje 74-75). Opprett-actionen kan derfor trygt sende `null` for begge uten noe server-hull — ingen migrasjon, RLS eller RPC-endring kreves.

## Design

1. **Trim skjemaet** i `app/[locale]/admin/klubber/ny/page.tsx`:
   - Fjern `member_cap`-`<Input>` (linje 97-106) og `<VarighetField …>` (linje 108) fra `<form>`. Behold `name` + `owner_email`.
   - Fjern `import { VarighetField } from '../VarighetField';` (linje 13) — den brukes fortsatt av detaljsiden, så **ikke** slett komponent-fila.
   - Rydd `SearchParams`-typen (linje 16-23): fjern `member_cap`, `varighet_mode`, `sluttdato`.
   - Fjern de nå ubrukte `prev*`-variablene: `prevMemberCap` (linje 51), `prevVarighetMode` (linje 52), `prevSluttdato` (linje 53). Behold `prevName` og `errorEmail`.
   - Oppdater JSDoc (linje 30-37): «optional member cap, and optional valid_until date» → beskriv at avtale-rammene settes på detaljsiden etterpå.

2. **Forenkle actionen** i `app/[locale]/admin/klubber/ny/actions.ts`:
   - Slutt å lese `member_cap` / `varighet_mode` / `sluttdato` fra `FormData` (linje 39-47).
   - Send `null` for begge RPC-argene: `p_member_cap: null`, `p_valid_until: null` (behold `as`-casten som trengs mot de generert-non-null RPC-typene i `lib/database.types.ts:1832`; tsc-porten fanger feil cast).
   - I `errorHref` (linje 65-73): fjern echo av `member_cap`, `varighet_mode`, `sluttdato` — kun `name` + `email` er relevante nå.
   - Fjern den nå uoppnåelige `member_cap_invalid` → `cap_invalid`-grenen (linje 78), siden `p_member_cap` alltid er `null`.
   - Oppdater JSDoc (linje 21) — stryk `error=cap_invalid`-linja.

3. **Rydd orphaned i18n-nøkler** (se Key Decisions). I `messages/no.json` og `messages/en.json`, symmetrisk (catalogParity-porten krever lik nøkkel-mengde):
   - Fjern `klubb.create.memberCapLabel`, `klubb.create.memberCapPlaceholder`, `klubb.create.memberCapHint` (no.json linje 3597-3599).
   - Fjern `klubb.create.errors.cap_invalid` (no.json linje 3607).
   - **Behold** hele `klubb.varighet.*`-blokka (delt med detaljsidens `VarighetField`) og alle `klubb.manage.memberCap*` (fortsatt i bruk på detaljsiden).

4. **Bruker-synlig (admin-flate) → versjonsbump + CHANGELOG + staging-verify:**
   - `feat`-commit(s) med `Refs #1137` i body.
   - `npm version minor --no-git-tag-version`, stage `package.json` + `package-lock.json`.
   - Én Funksjoner-linje i `CHANGELOG.md` (les `docs/changelog-conventions.md` først) — f.eks. at opprett-klubb-skjemaet nå bare spør om navn + eier, resten settes etterpå.
   - PR mot `main`: `Closes #1137` i body. Verifiser opprett-flyten på `torny-staging` før merge (admin logger inn, oppretter klubb med kun navn + eier-e-post, lander på detaljsiden, setter medlemstak/varighet der).

## Edge Cases & Guardrails
- **0-rad-fella er ikke relevant her:** `admin_create_club` returnerer `data` (ny klubb-uuid) og kaster exception ved feil — actionen sjekker allerede `error` og `data`. Ingen endring i suksess-verifisering.
- **`cap_invalid` blir dødt, ikke halvveis:** Fjern RPC-grenen, action-echoen og i18n-nøkkelen i samme PR (T2 change-propagation) — ellers ville `t('create.errors.cap_invalid')` peke på manglende nøkkel (fallback-render, ikke krasj, men rusk).
- **Ingen data-migrasjon:** Eksisterende klubber er urørt; `member_cap`/`valid_until` for nye klubber blir `null` (= ubegrenset / uendelig), som er en trygg default og allerede den semantiske «ikke satt»-verdien.

## Key Decisions
- **Fjern de orphaned `create.memberCap*`- og `create.errors.cap_invalid`-nøklene** i stedet for å la dem ligge. De brukes ingen andre steder etter trimmingen, og `#611`-opprydningsdisiplinen tilsier at endringen som forlater nøklene også rydder dem. `varighet.*` og `manage.memberCap*` beholdes fordi detaljsiden fortsatt bruker dem.
- **`VarighetField`-komponenten beholdes** — kun bruken i opprett-siden fjernes; detaljsiden (`[id]/page.tsx:155`) importerer den fortsatt.
- **`feat` + minor bump:** admin ser en synlig endring i skjemaet, så dette er bruker-synlig (ikke `[no-changelog]`-intern).

**Claude's Discretion:** Nøyaktig CHANGELOG-formulering (norsk, action-orientert, Funksjoner-seksjonen); den eksakte TS-casten for `null`-argene mot RPC-typen; ordlyd i oppdatert JSDoc.

## Success Criteria
- [ ] Opprett-klubb-skjemaet viser kun `Klubbnavn` + `Eierens e-post` + opprett-knapp — ingen medlemstak- eller varighet-felt.
- [ ] Å opprette en klubb med kun navn + gyldig eier-e-post lykkes, redirecter til detaljsiden, og klubben har `member_cap = null` og `valid_until = null`.
- [ ] Detaljsidens avtale-skjema (`member_cap` + `VarighetField`) fungerer uendret — medlemstak og varighet kan settes der etterpå.
- [ ] Validerings-feil-redirect (tomt navn, ukjent eier-e-post) re-populerer navn/e-post korrekt uten referanse til de fjernede feltene.
- [ ] Ingen ubrukte importer/variabler/i18n-nøkler igjen etter trimmingen; `messages/no.json` og `messages/en.json` har fortsatt identisk nøkkel-mengde.

## Gates
- [ ] `npm run build` (fanger ubrukte importer / exhaustiveness / cacheComponents-feil)
- [ ] `npm run lint`
- [ ] `npx vitest run messages/catalogParity.test.ts messages/apostropheParity.test.ts` (no/en-nøkkelparitet etter nøkkel-fjerning)
- [ ] Staging-verify av opprett-klubb-flyten (admin-innlogging → opprett med navn + eier → detaljside → sett avtale-rammer) — bruker-synlig, kreves før merge

## Files Likely Touched
- `app/[locale]/admin/klubber/ny/page.tsx` — fjern felt, import, SearchParams-nøkler, prev*-variabler, JSDoc
- `app/[locale]/admin/klubber/ny/actions.ts` — send null for begge RPC-arg, rydd errorHref + cap_invalid-gren + JSDoc
- `messages/no.json` — fjern orphaned `create.memberCap*` + `create.errors.cap_invalid`
- `messages/en.json` — samme fjerning (parity)
- `CHANGELOG.md` — én Funksjoner-linje
- `package.json` + `package-lock.json` — minor bump

## Out of Scope
- Ingen endring i `admin_create_club`-RPC, `groups`-skjema, RLS eller migrasjoner (RPC er allerede null-trygg).
- `VarighetField.tsx` slettes ikke og endres ikke.
- Detaljsidens avtale-skjema (`[id]/page.tsx` / `updateClubTerms`) endres ikke.
- Ingen redesign av opprett→administrer-flyten utover å flytte de to feltene ett steg fram i tid.
