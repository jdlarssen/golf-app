# Evaluering: #1786 — merge_pr rollback av draft-flippen

**Evaluator:** fresh-context skeptiker (U1 + U2). U3/U4 = hovedchatten.
**Commit:** `ee58eafa` på `6f6abf7e`. Diff: 2 filer, +134/−2.
**Dato:** 2026-08-29

## Verdikt

- **U1 (nye tester dekker (a)–(d)): ACCEPT**
- **U2 (scoped gates grønne): ACCEPT**

Ingen MUST-FIX. Fem NIT-er/observasjoner under.

---

## Gate-output (verbatim)

### `npx vitest run lib/loops app/api/discord` (Node v22.23.0)

```
 RUN  v4.1.6 /Users/jdl/Dokumenter/GitHub/golf-app/.claude/worktrees/mange-issues-a70214

 Test Files  6 passed (6)
      Tests  288 passed (288)
   Start at  23:01:19
   Duration  1.96s (transform 658ms, setup 1.21s, import 766ms, tests 119ms, environment 6.85s)
```

`VITEST_EXIT=0`. Loggen ble grep-et for `unhandled|rejection|stderr|Errors ` →
`no unhandled/stderr lines`. (Falsk-grønn-fella fra
`project_vitest_unhandled_errors_false_green.md` er altså sjekket eksplisitt, ikke antatt.)

### `npx tsc --noEmit`

```
TSC_EXIT=0
```
(ingen output)

### `npx eslint lib/loops scripts/loops`

```
ESLINT_EXIT=0
```
(ingen output — altså null errors OG null warnings). Merk: `eslint.config.mjs` har ingen
`max-lines-per-function`; kontraktens «ingen funksjon > 25» er `complexity: ["warn", 25]`,
og den er grønn.

---

## Verifisering mot kontrakt-kriteriene

### 1. Flip-guarden behandler 200-med-errors som feil ✅

`lib/loops/discordActions.ts:306` → `if (!graphqlSucceeded(ready))`.

Semantikken er sammenlignet linje for linje med `scripts/loops/sweep-natt-drafts.ts:85–86`:

| | sweep | ny `graphqlSucceeded` |
|---|---|---|
| status | `res.status !== 200` | `if (res.status !== 200) return false` |
| errors | `Array.isArray(errors) && errors.length > 0` | `!(Array.isArray(errors) && errors.length > 0)` |
| json null | `(res.json as {...} \| null)?.errors` | identisk optional-chain |

Identisk. Tom `errors`-liste er ikke en feil i begge (egen test dekker det).

- **Samme retur-streng som før:** `Fikk ikke tatt PR #${action.pr} ut av draft (HTTP ${ready.status}) — ikke merget.` — byte-identisk med `6f6abf7e`. ✅
- **Ingen merge-PUT på den stien:** verifisert både ved lesing og ved test-assertion
  `expect(calls.map(c => c.method)).toEqual(['GET','GET','GRAPHQL'])` (mockGh klemmer
  fast siste respons ved uttømming, så en ekstra PUT ville dukket opp i `calls`). ✅

### 2. Rollback ✅

- **Fyrer kun når DENNE kallet flippet:** `flippedFromDraft` settes `true` utelukkende
  inne i `if (pr.draft)` etter vellykket flipp; `if (!flippedFromDraft) return failure;`
  er porten. `let` er funksjons-scoped per invocation. ✅
- **Samme node_id:** `restoreDraft(gh, pr.node_id)` — samme verdi som flippen brukte.
  Testen pinner det: `expect(calls[4].body).toEqual({ id: draftPr.node_id })`. ✅
- **Suksess = 200 uten errors:** samme `graphqlSucceeded`. ✅
- **Kan ALDRI kaste:** `try` omslutter både `await gh.graphql(...)` OG
  `graphqlSucceeded(back)`. Jeg sjekket alle tre kastende veier:
  1. avvist promise fra `gh.graphql` → fanget (egen test med `mockRejectedValueOnce`),
  2. synkron throw fra `gh.graphql` → fanget (kallet står inne i `try`),
  3. `back` er `undefined`/`null` → `graphqlSucceeded` ville kastet på `res.status`,
     men den kalles inne i `try` → fanget.
  `restoreDraft` er dermed en `Promise<string>` som ikke kan rejecte. ✅

### 3. Ikke-draft-stien byte-identisk ✅

Pre-change: `return \`Fikk ikke merget PR #${action.pr}: ${detail}\`;`
Post-change: `const failure = <samme template>; if (!flippedFromDraft) return failure;`

Samme streng, samme kall-sekvens (GET, GET, PUT — ingen GraphQL). Sterkeste bevis:
den nye testen `'ikke-draft + merge-feil → ingen GraphQL-kall, svaret er uendret'`
(med `toBe`, ikke `toContain`) **består mot den GAMLE implementasjonen** i
regresjonskjøringen under. ✅

### 4. Happy paths + CI-gate urørt ✅

Byte-sammenligning mot `6f6abf7e`:

```
diff (pre 276–297) (post 276–297)  → IDENTICAL: handleMergePr head + CI gate
diff (pre 318–EOF) (post 351–EOF)  → IDENTICAL: entire file tail from handlePublishLansering onward
```

Diffen har nøyaktig to hunks, begge inne i `handleMergePr` + to nye ikke-eksporterte
helpers. Eksport-listen er identisk før/etter (9 `export`-linjer, samme navn, samme
rekkefølge). Ingen andre `custom_id`-familier rørt. ✅

**Søsken-sjekk (T2 steg 3):** hele repoet har kun 3 `gh.graphql`-kallsteder
(`discordActions.ts:302`, `:340`, `sweep-natt-drafts.ts:84`) — alle tre har nå
dobbeltsjekken. `lib/loops/autoMerge.ts:233` av-drafter ALDRI
(`if (pr.draft) return { ok: false, ... }`), så kortet har ikke samme hull. Ingen
gjenstående søsken-glipp. ✅

### 5. Tester ✅ — og de er ikke tautologier

- **Append-only:** `git diff --numstat` → `99 0 lib/loops/discordActions.test.ts`.
  Null slettede linjer; hunk-header `@@ -629,3 +629,102 @@` = ren appendering på slutten. ✅
- **Ekte assertions:** jeg kjørte den nye describe-blokken mot den GAMLE
  implementasjonen (`git show 6f6abf7e:...` kopiert inn, kjørt, deretter
  `git checkout --` → tree bekreftet clean):

```
× draft + merge-feil → PR-en konverteres tilbake til draft med samme node_id
× draft + merge-feil + kompensasjon feiler (non-200) → ⚠️-svar, ingen throw
× draft + merge-feil + kompensasjon feiler (200 med errors) → ⚠️-svar, ingen throw
× kompensasjonen kaster (nettverksfeil) → ⚠️-svar, ingen throw
× flipp svarer 200 MED errors → behandles som feilet flipp, ingen merge-PUT
 Tests  5 failed | 2 passed | 70 skipped (77)
```

  5 av 7 feiler mot gammel kode = ekte regresjonstester. De 2 som består er nettopp de
  som SKAL bestå begge veier (ikke-draft-stien = kriterium 3, og «tom errors-liste er
  ikke en feil» = over-strenghets-vakt). Dette er sterkere bevis enn kontrakten krevde.
- **Dekning mot U1(a)–(d):** (a) ✅ kall-sekvens `['GET','GET','GRAPHQL','PUT','GRAPHQL']`
  + mutasjons-identitet + node_id + begge streng-fragmenter. (b) ✅ `it.each` over både
  non-200 og 200-med-errors, pluss en ekstra test for avvist promise (ikke krevd av
  kontrakten). (c) ✅ eksakt `toBe` + kall-sekvens uten GRAPHQL. (d) ✅ kall-sekvens
  stopper på GRAPHQL.

**Byggerens to flaggede avvik — begge legitime:**

1. *«Droppet duplikat-test».* Verifisert: ingenting er fjernet (0 slettede linjer). Den
   eksisterende `discordActions.test.ts:443 'merge-feil fra GitHub videreformidles med
   grunn'` bruker `greenPr` (ikke-draft) og `toContain`. Den nye (c)-testen er strengt
   sterkere (`toBe` + kall-sekvens). Overlapp, ikke hull. **Ikke en dekningsglipp.**
2. *«Truncated-mock-workaround».* `mockGh` lagrer `query.slice(0, 40)`. Jeg regnet det
   ut i node:
   - `markPullRequestReadyForReview`[0:40] = `"mutation($id: ID!) { markPullRequestRead"` → inneholder `convertPullRequest`? **false**
   - `convertPullRequestToDraft`[0:40] = `"mutation($id: ID!) { convertPullRequestT"` → **true**

   Assertionen diskriminerer altså entydig mellom de to mutasjonene. Å utvide
   `mockGh` ville brutt append-only-kravet. **Legitim.**

### 6. Norsk copy ✅

Verbatim, hentet ved å faktisk kjøre kodestien (temp-test, slettet etterpå):

```
Fikk ikke merget PR #1112: Base branch was modified. Review and try the merge again. PR-en er lagt tilbake som draft.
Fikk ikke merget PR #1112: Pull Request is not mergeable ⚠️ PR-en står igjen som ready — legg den tilbake som draft manuelt om ønsket.
Fikk ikke tatt PR #1112 ut av draft (HTTP 200) — ikke merget.
```

Stemmen matcher filas eksisterende register («sett den manuelt», «fjern den manuelt»,
«publiser manuelt fra /admin/lanseringer»). Ingen AI-tells: ingen regel-av-tre, ingen
promo-språk, ingen oppblåst symbolikk, tankestrek brukt som resten av fila allerede gjør.
Ingen særskriving, korrekt `PR-en`-bindestrek. ✅

---

## Adversarielle sjekker (alle negative)

| Hypotese | Resultat |
|---|---|
| `try/catch` svelger merge-PUT-feil | **Nei.** `merge`-PUT-en awaits utenfor enhver `try`; `catch`-en ligger inne i `restoreDraft` og omslutter kun GraphQL-kallet. En rejection fra merge-PUT propagerer akkurat som før. |
| Tidlig retur hopper over CI-gaten | **Nei.** `let flippedFromDraft` står ETTER alle fire CI-returene; linje 276–297 er byte-identisk med pre-change. |
| Omstokket kall-rekkefølge | **Nei.** GET → GET → (GRAPHQL) → PUT → (GRAPHQL) — testene pinner sekvensen eksplisitt. |
| Oppmykning av en status-sammenligning | **Nei.** `merge.status !== 200`, `prRes.status !== 200`, `latest.status`/`conclusion` uendret. Flip-guarden er strengere, ikke løsere. |
| Rollback fyrer på PR som allerede var ready | **Nei.** `flippedFromDraft` settes kun inne i `if (pr.draft)`-grenen etter vellykket flipp. |
| Eksportert symbol endret | **Nei.** 9 identiske `export`-linjer før/etter. |
| Streng-avhengighet et annet sted i repoet | **Nei.** Kun testfila refererer svarstrengene. |

---

## Funn

Ingen MUST-FIX.

### NIT 1 — `lib/loops/discordActions.ts:307` (kriterium 1)
200-med-errors-flippen svarer `«… ut av draft (HTTP 200) — ikke merget.»`. «HTTP 200»
leser som suksess for eieren i Discord og skjuler hva som faktisk gikk galt.
Kontrakten krevde eksplisitt SAMME streng som før, så dette er kontrakts-lydig — men
`sweep-natt-drafts.ts:87–89` gjør det bedre ved å appende `JSON.stringify(errors)`.
Kandidat for et oppfølgings-issue, ikke en blokker.

### NIT 2 — `lib/loops/discordActions.ts:318` + `:344` (kriterium 6)
Sammenkjedingen `failure + ' PR-en er lagt tilbake som draft.'` gir en løpende setning
når GitHubs melding mangler punktum: `«… Pull Request is not mergeable PR-en er lagt
tilbake som draft.»` (verifisert ved kjøring over). Med punktum leser den fint. En
separator (`' — '`) eller `\n` ville gjort den robust uansett GitHub-melding.

### NIT 3 — `lib/loops/discordActions.ts:327` vs `scripts/loops/sweep-natt-drafts.ts:85–86` (kriterium 1)
Dobbeltsjekken finnes nå to steder med identisk semantikk. Kontrakten scopet endringen
til `discordActions.ts`, så dette er korrekt avgrenset — men en delt helper ville
forhindret framtidig drift mellom `lib/` og `scripts/`.

### NIT 4 — `lib/loops/discordActions.test.ts:673` (U1b)
`it.each`-varianten asserter kun `expect(calls).toHaveLength(5)`, ikke at kall nr. 5 ER
convert-mutasjonen. Test (a) pinner den identiteten på samme kodesti, så det er ikke et
reelt hull — men assertionen er svakere enn nabotestens.

### Observasjon — asymmetri ved ekte GraphQL partial errors
Returnerer GitHub en gang 200 med `errors` DER flippen faktisk committet (partial error
på selection-settet), svarer koden «ikke merget» og returnerer **uten** rollback — altså
nøyaktig tilstanden #1786 handler om. Sannsynligheten er svært lav (selection-settet er
bare `{ pullRequest { isDraft } }`), semantikken er identisk med den allerede shippede
sweepen, og kontrakten foreskriver eksplisitt «samme retur som i dag» på den stien.
Nevnt for fullstendighet, ikke som funn.

---

## Bokføring

- Commit-melding har `[no-changelog]` + `Refs #1786`. Korrekt: Discord-loop-tooling er
  ikke bruker-synlig for golferne, så `.changes/`-notat skal ikke ligge der
  (CLAUDE.md: «Intern endring som likevel shippes som fix (… tooling) → ingen notatfil»).
  `.githooks/commit-msg` er dermed tilfredsstilt uten omgåelse.
- Arbeidstreet var clean etter alle mine eksperimenter (temp-testfiler slettet, gammel
  implementasjon tilbakestilt med `git checkout --`). Denne evalueringsfila er den eneste
  endringen jeg etterlater, og den er ikke committet.
