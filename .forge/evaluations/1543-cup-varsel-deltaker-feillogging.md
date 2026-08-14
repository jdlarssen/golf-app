# Evaluering: #1543 — cup-varsel, stille tom mottakerliste

**VERDIKT: ACCEPT**

Evaluator: fersk kontekst, branch `fix/1543-cup-participant-lookup-logging`,
kjørt 2026-08-14 mot `origin/main...HEAD` (1 commit: `9431066f`).
Ingen kontrakt-påstand er tatt på tro — alle gates og evidens-linjer er
reprodusert i denne økten. Arbeidstreet var rent før og etter (kun den
utrackede kontraktfila).

## Gates — reprodusert

| Gate | Kommando | Resultat |
|---|---|---|
| Unit (målfil) | `npx vitest run lib/cup/tournamentParticipants.test.ts` | **1 fil / 3 tester grønne** (672 ms) |
| Unit (modul) | `npx vitest run lib/cup` | **25 filer / 436 tester grønne** — matcher kontraktens tall eksakt |
| Typecheck | `npm run typecheck` (Node v22.23.0) | **exit 0**, ingen output |
| Lint (endrede filer) | `npx eslint lib/cup/tournamentParticipants{,.test}.ts` | **exit 0**, ingen funn |

### Rød-før-grønn faktisk verifisert (ikke tatt på tro)

Kontrakten påstår «begge nye tester var RØDE før fiksen (2 failed | 1 passed)».
Reprodusert ved å midlertidig bytte inn `git show origin/main:lib/cup/tournamentParticipants.ts`,
kjøre suiten, og restaurere:

```
Tests  2 failed | 1 passed (3)
FAIL … > logger og returnerer tom liste når games-spørringen feiler (#1543)
FAIL … > logger og returnerer tom liste når game_players-spørringen feiler (#1543)
AssertionError: expected "error" to be called with arguments: [ …(2) ]
Number of calls: 0
```

Testene er altså reelt bærende, ikke tautologier. `git status` bekreftet rent
etter restaurering.

## Per Success Criteria

### 1. games-feil → logg `[cup] participant lookup: games failed` + `{tournamentId, error}` + `return []` + game_players aldri spurt — **PASS**

- Kode: `lib/cup/tournamentParticipants.ts:44-53` — `if (gamesError)` → `console.error('[cup] participant lookup: games failed', { tournamentId, error: gamesError })` → `return []`.
- Test: `lib/cup/tournamentParticipants.test.ts:89-110`, grønn; rød på pre-fix-kode (over).
- **Skiller den faktisk feil-grenen fra tidligreturen?** Ja — men det er
  `toHaveBeenCalledWith`-assertionen (linje 100-103) som gjør jobben, bevist ved at
  nettopp den ryker på pre-fix-kode. `__fromCalls`-filteret (linje 106-108) er
  *ikke* diskriminerende: på pre-fix-kode gir `data: null` → `gameIds = []` →
  tidligreturen på linje 55, så `game_players` blir aldri spurt der heller.
  Assertionen er sann og ufarlig, men dokumenterer mer enn den beviser. Se
  observasjon O1.

### 2. game_players-feil → tilsvarende logg + `return []` — **PASS**

- Kode: `lib/cup/tournamentParticipants.ts:61-68`.
- Test: `lib/cup/tournamentParticipants.test.ts:112-131`, grønn; rød pre-fix.
- Her ER testen fullt diskriminerende: uten `if (playersError)` ville
  `playerRows ?? []` gitt `[]` og null logg-kall → assertionen ryker (og gjorde det).

### 3. Ekte tomhet (`data: []`, `error: null`) → ingen logg, uendret oppførsel — **PASS (empirisk verifisert, ikke bare lest)**

Kontrakten har ingen test for denne. Jeg skrev en midlertidig probe
(`lib/cup/__evalprobe.test.ts`, kjørt og slettet — `git status` rent etterpå) med
fire caser: games `[]`/null og game_players `[]`/null, alle med `error: null`.

```
Test Files  1 passed (1)
     Tests  4 passed (4)
```

Alle fire gir `[]` og **null** `console.error`-kall. Kriteriet holder. At
`data: null + error: null` også er stille er teknisk sant, men ikke et reelt hull:
supabase-js returnerer enten data eller error, aldri begge null. Se O2.

### 4. Retur-type og kallsteder uendret — **PASS**

- `git diff origin/main...HEAD --stat -- . ':(exclude)lib/cup'` → **tom**. Diffen rører
  utelukkende `lib/cup/tournamentParticipants.ts` (+22/−4) og testfila (+53/−2).
- `Promise<TournamentParticipant[]>` står uendret (`tournamentParticipants.ts:35`).
- Kallstedene ligger på `lib/cup/actions.ts:251` og `:428` — begge fortsatt
  `const recipients = await loadTournamentParticipantEmails(id);`, ugatet, som før.
  Ingen andre kallsteder finnes (grep over hele repoet: kun actions.ts + testfila).

### 5. Testfilas docblock beskriver de nye casene — **PASS (lyver ikke)**

- `tournamentParticipants.test.ts:11-21`: den utdaterte påstanden «Én test, fordi …»
  er erstattet med «Happy-path-testen låser fire ting …» + et #1543-avsnitt som
  beskriver begge feilcasene og `[cup]`-prefikset. Docblocken stemmer med de tre
  testene som faktisk står i fila.

### 6. Best-effort-kommentar så neste leser ikke «fikser» til kast — **PASS**

- `tournamentParticipants.ts:45-47`: forklarer at kallstedene kjører ugatet ETTER at
  cup-statusen er flippet, så et kast ville gitt arrangøren feilside for en fullført
  avslutning.
- `tournamentParticipants.ts:62`: «Samme bevisste best-effort som over — ikke «fiks»
  til et kast.» Eksplisitt nok til å stanse en fremtidig «rydding».

### 7. `[cup]`-payload-konvensjon — **PASS**

Sammenlignet med modulens øvrige logging (`planActions.ts:148/220/264`,
`sideAwardActions.ts:233/326`, `actions.ts:168/238/413/505/515`): alle bruker
`console.error('[cup] <hva> failed', { <ider>, error })`. Nytt kall følger samme form
(`{ tournamentId, error }`). Kolon-formen «participant lookup: games failed» er en
liten variasjon på `<fn> failed`, men leser fint og er entydig grep-bar.

### 8. Spy-lekkasje / falsk grønn — **PASS**

Begge feil-testene lager sin EGEN `vi.spyOn(console, 'error')` og kaller
`spy.mockRestore()`. Et lekket spy fra en tidligere test kan derfor ikke gi
falske treff (assertionene leser det ferske spy-objektet, som bare kan ha fanget
kall fra egen test). `beforeEach` kjører `vi.clearAllMocks()`. Empirisk bekreftet:
suiten er grønn isolert (3/3), rød på pre-fix (2 av 3), og hele `lib/cup` er grønn
(436/436) — mønsteret er uforenlig med lekkasje-drevet falsk grønn.

## Observasjoner (ikke-blokkerende — ingen krever ombygging)

- **O1 — `lib/cup/tournamentParticipants.test.ts:104-108`: kommentaren lover mer enn
  assertionen leverer.** Kommentaren sier «Skiller feil-grenen fra tidligreturen for
  ekte tomhet», men `__fromCalls`-filteret er sant i BEGGE grener (tidligreturen
  spør heller aldri `game_players`). Det er `toHaveBeenCalledWith` som skiller.
  Ren kommentar-presisjon i en testfil; ingen funksjonell konsekvens, og
  assertionen beskytter fortsatt mot en fremtidig variant som logger og fortsetter.
- **O2 — `lib/cup/tournamentParticipants.ts:44/61`: `data: null + error: null` er
  fortsatt stille.** Søster-mønsteret kontrakten siterer
  (`lib/mail/gameFinishedRecipients.ts:93`) gater på `playerErr || !playerRowsRaw`,
  altså også på null-data. Her gates det kun på `error`. Ikke framprovoserbart via
  supabase-js (den returnerer enten data eller error), så det er ikke et reelt hull
  — noteres kun så neste leser ikke tror det er en glipp.
- **O3 — kontraktens linje-referanse er litt feil.** Kontrakten sier
  `__fromCalls`-filteret ligger på «testlinje ~128»; det ligger på 106-108 (linje 128
  er inni den andre testen). Kosmetisk feil i evidens-teksten, ikke i koden.

## Findings

Ingen. Ingen `fil + kriterium`-signatur feiler.
