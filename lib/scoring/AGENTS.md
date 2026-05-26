# lib/scoring — test-disiplin (Type A)

Scoring-modulene er **pure logic** uten side-effects. Tester her er **Type A — Pure logic**, klassisk TDD. Referanse: `docs/test-discipline.md`.

## Den korte versjonen

`lib/scoring/` er Tørny's sannhetskilde for golf-matten. Hver linje kode her er backet av en test. Endringer krever **ny test først** — alltid.

## Disiplin (rigid, ikke fleksibel)

- **Ny logikk:** Skriv test som feiler → implementer → grønn → commit. TDD-mønsteret er ikke valgfritt her.
- **Endring av eksisterende logikk:** Skriv test som fanger den nye oppførselen først. Hvis testen passerer uten kode-endring, var endringen ikke en endring.
- **Mock-grense:** Aldri mock noe internt i `lib/scoring/`. Modulene tar pure verdier inn og returnerer pure verdier ut.
- **Sletting:** Aldri slett en scoring-test uten å erstatte den med en annen som dekker samme edge-case. Hver test her representerer en regel-bekreftelse — ikke en stilistisk preferanse.

## Format

- `it.each` for enumererte cases (eksempel: side-tournament-poeng-matrisen i `sideTournament.test.ts`)
- Direkte assertions: `toBe`, `toEqual`, `toStrictEqual`. Aldri snapshot.
- Fikstur-data som `const` øverst i fila eller i en `__fixtures__/` mappe hvis fixturen er stor og gjenbrukes på tvers av tester.

## Når en bug-fix er trigger for endring

1. Capture eksakt input som produserer feil resultat (fra Vercel-logg eller manuell repro)
2. Skriv test med den input-en — verifiser at den feiler
3. Fix logikken til testen passerer
4. Sjekk at ingen andre tester knekker

Ingen quick-fixes. Aldri. Bruker har eksplisitt sagt at scoring-feil koster troverdighet og krever full disiplin.

## Hvis du ikke er sikker

Hvis du tror du må endre `lib/scoring/` uten test først — stopp og spør hovedchat. Det er sannsynligvis et signal om at logikken ikke hører hjemme her, eller at testen burde vært skrevet på et høyere nivå.
