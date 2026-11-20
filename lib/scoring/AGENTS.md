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

## `rulebook/`: regelbokas eksempler (#2927)

`lib/scoring/rulebook/` kjører regelbøkenes egne eksempler (NGFs handicapregler, R&A, golfreglene) gjennom de ekte funksjonene og motorene. Hver fil har kildene øverst, og hver test nevner regel og side. Funnene står i `docs/regelbok-gjennomgang.md`, nummerert F1, F2 osv.

- **Kjent avvik** er en `it.fails('F<n>: …')` i en `describe('Kjent avvik')`-blokk. Testen påstår regelens tall og feiler i dag.
- **Rettingen** av F<n> gjør testen rød, fordi den begynner å passere. Samme PR gjør den om til `it` og oppdaterer raden i funnlista.
- Aldri `it.skip` eller `it.todo` for et avvik, og aldri en test som låser motorens feil tall som riktig.
- F1 ligger i kallestedene utenfor `lib/scoring`. Testene leser derfor kildeteksten der, etter mønsteret i `lib/names/nameRuleSites.test.ts`.

## Hvis du ikke er sikker

Hvis du tror du må endre `lib/scoring/` uten test først — stopp og spør hovedchat. Det er sannsynligvis et signal om at logikken ikke hører hjemme her, eller at testen burde vært skrevet på et høyere nivå.
