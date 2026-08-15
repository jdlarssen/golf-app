# Evaluering — #1623: valg-markøren og PR-malens heading er i utakt

**Verdikt: ACCEPT**

Runde 1 (2026-08-15). Branch `claude/forge-1623-valgmarkor`, HEAD `5ac72bc1`, PR
[#1654](https://github.com/jdlarssen/golf-app/pull/1654) (draft, base `main`).
Alle kontraktens påstander er reprodusert uavhengig — ingen av dem tatt på tro.
Seks funn, alle ikke-blokkerende; F1 og F4 bør bli egne issues.

Bonus-funn: defekten var **fire ganger bredere** enn kontrakten hevder. Ikke bare
#1620 — også #1610, #1612 og #1616 bar `## Alternativer (produktvalg)` og ble
merget. Se K1.

## Kriterier

| # | Kriterium | Verdikt | Evidens (produsert i denne evalueringen) |
|---|---|---|---|
| K1 | `hasChoiceMarker('## Alternativer (produktvalg)')` → `true`, som tabellrad | **PASS** | Raden står `lib/loops/autoMerge.test.ts:74`. Sterkere bevis enn kontrakten gir: jeg hentet de **ekte** PR-body-ene og kjørte dem mot begge regexene. `## Alternativer (produktvalg)` → gammel `false`, ny `true` for **#1610, #1612, #1616 og #1620** — alle fire `state=MERGED` (#1610/#1612/#1616 kl. 13:49–13:50, #1620 kl. 15:33, 2026-08-14). Kontrolgruppe: #1641/#1645 (`## Produktvalg`) `true` før og etter; #1652/#1654 `false` før og etter. 0 feil på 8 ekte bodyer. |
| K2 | Eksisterende true-cases består; prosa forblir false; `## Alternativer vurdert` false | **PASS** | Rød-kjøring gjort selv: byttet `autoMerge.ts:76` tilbake til den gamle regexen og kjørte suiten. Utfall: `Tests 3 failed \| 56 passed (59)`, og de tre er nøyaktig `## Alternativer (produktvalg)`, `## ⚖️ Produktvalg`, `## Ingen produktvalg`. Ingen eksisterende rad flippet. Fil gjenopprettet med `git checkout` og verifisert byte-identisk mot pre-probe-kopi. |
| K3 | CLAUDE.md, `discord-pr-kort.md`, `morgenbriefen.md` beskriver samme regel som koden | **PASS** (med F1) | `CLAUDE.md:182–188` og `docs/loops/discord-pr-kort.md:88–94` beskriver begge «inneholder ordet «produktvalg» … eller starter med `## Alternativ A`–`E`» — semantisk lik koden `autoMerge.ts:76`. `morgenbriefen.md:36–39` slutter å gjenta regelen og peker til kort-doccen: tre hjem → ett. Fullt repo-sveip (`grep -rni produktvalg`, alle filtyper, inkl. skjulte kataloger): ingen gjenværende live-uttalelse av den gamle regelen. `.claude/` og `docs/forge-workflow.md`: null treff. Eneste gamle formuleringer ligger i `.forge/contracts/1406-*.md:81` og `.forge/evaluations/1406-*.md:45` — historisk arkiv fra #1406, korrekt urørt. Presisjonsavvik: se F1. |
| K4 | `npx vitest run lib/loops` grønn | **PASS** | Kjørt selv på Node v22.23.0: `Test Files 4 passed (4) / Tests 197 passed (197)`, 2.62 s. |
| G1 | `npx tsc --noEmit` | **PASS** | Exit 0, 0 linjer output. |
| G2 | `npm run lint` | **PASS** | Exit 0. `✖ 55 problems (0 errors, 55 warnings)` — ingen warning nevner `autoMerge`. |
| G3 | Scope, `Refs #N`, `[no-changelog]` | **PASS** | `git diff origin/main...HEAD --stat`: 5 filer, +50/−13 — nøyaktig kontraktens fil-liste, ingen drive-by. Commit-body har `Refs #1623` og `[no-changelog] — intern loop-tooling, ingen bruker-synlig flate`. Ingen `.changes/`-notat: korrekt per CLAUDE.md §Versjonering («intern endring som likevel shippes som `fix` → ingen notatfil»). Selvkonsistent med koden: `isUserVisibleByCommits` (`autoMerge.ts:103`) leser `[no-changelog]` og lar staging-porten være. |
| G4 | Andre konsumenter av den gamle oppførselen | **PASS** | `hasChoiceMarker` har én produksjonskaller: `autoMerge.ts:140` i `classifyAutoMerge`. `CHOICE_MARKER` er modul-lokal, ikke eksportert. `scripts/loops/decide-pr-card.ts:210–214` bruker `classifyAutoMerge`. Ingen duplisert regex i workflows/skript. |
| G5 | PR-ens egen body mot den nye regexen | **PASS** | Kontraktens selv-verifisering reprodusert: `gh pr view 1654 --json body` → `hasChoiceMarker` = `false`, `match = null`. Headingene er `## Hva som var galt`, `## Hva som er endret`, `## Fordeler og ulemper`, `## Teknisk`. Korrekt — PR-en har ikke noe produktvalg. Draft, base `main`, `Closes #1623` på linje 1 (draft-først #1516). |
| G6 | Arbeidstreet er rent etterpå | **PASS** | `git status --porcelain` → kun `?? .forge/contracts/1623-valgmarkor-heading.md`, som var utracket før jeg startet. Alle prober lå i scratchpad utenfor repoet. |

## Funn

### F1 — «inneholder ordet produktvalg» er ikke det koden gjør: norsk bestemt form matcher ikke (medium, ikke-blokkerende)

`lib/loops/autoMerge.ts:76` — `\bproduktvalg\b` krever en ASCII-ordgrense **etter**
ordet. Norske bøyninger faller derfor utenfor:

```
'## Produktvalget'          → false
'## Produktvalget (til eier)' → false
'## Produktvalgene'         → false
'## Produktvalg'            → true
```

Dokumentene (`CLAUDE.md:183`, `docs/loops/discord-pr-kort.md:88–89`) sier headingen
skal «inneholde ordet «produktvalg»». `## Produktvalget` *inneholder* strengen. En
økt som leser doccen og skriver bestemt form — helt idiomatisk norsk, og formen
brukes allerede i prosa i repoet (`.forge/evaluations/1372-delt-forsteplass.md:141`,
`.forge/contracts/1427-copy-holes.md:29`) — får PR-en auto-merget. Det er nøyaktig
sviktmodusen #1623 handler om, bare smalere: doccen lover mer enn regexen leverer.

Ikke en regresjon (den gamle regexen feilet også her), og alle tre *foreskrevne*
formene matcher, så det blokkerer ikke. Men det er en åpen kant i samme klasse.

Inkonsekvensen blir tydelig ved ikke-ASCII, siden JS-`\b` er ASCII-basert:

```
'## Produktvalgø' → true    (ø er ikke \w → ordgrense finnes)
'## Produktvalget' → false  (e er \w → ingen ordgrense)
```

Altså: et tegn som ikke finnes i noe ord passerer, mens den vanligste norske
bøyningen ikke gjør det.

**Reproduser:** `/^#{1,6}\s+(?:.*\bproduktvalg\b|alternativ\s+[a-e]\b)/im.test('## Produktvalget')` → `false`.
**Ikke anvendt her** (evaluator fikser ikke): retningen ville vært å slippe den
avsluttende `\b`, eller `produktvalg\w*`. Bør bli eget issue.

### F2 — `.*` gjør `\s+`-backtrackingen kvadratisk: 0,11 ms → 3083 ms (lav–medium, ikke-blokkerende)

`lib/loops/autoMerge.ts:76`. Den nye `.*` gir grådig `\s+` noe å backtracke mot, så
en lang whitespace-serie etter `#` blir O(n²). Målt på Node 22:

| Input | Gammel regex | Ny regex |
|---|---|---|
| `'#' + 1 000 mellomrom + 'x'` | 0,01 ms | 0,41 ms |
| `'#' + 5 000 mellomrom + 'x'` | 0,01 ms | 15,91 ms |
| `'#' + 20 000 mellomrom + 'x'` | 0,04 ms | 291,06 ms |
| `'#' + 65 536 mellomrom + 'x'` | **0,11 ms** | **3083,34 ms** |

≈28 000× regresjon i verste tilfelle. Normale bodyer er upåvirket (1000 linjer ×
65 tegn: 0,09 ms; én 65k-linje uten whitespace-serie: 0,08 ms) — det er *kun*
whitespace-serien som utløser det.

Taket er GitHubs PR-body-grense på 65 536 tegn, så verste utfall er ~3 s i
decide-steget, ikke en hengende jobb. Repoet er offentlig, så en fork-PR-body er
eksternt forfattet input — men konsekvensen er 3 sekunder GitHub Actions-tid, ikke
en gate som svikter. Derfor ikke blokkerende.

**Reproduser:** `re.test('#' + ' '.repeat(65536) + 'x')`, tidtatt med
`process.hrtime.bigint()`.
**Merk:** `^#{1,6}[ \t]+` i stedet for `\s+` fjerner både dette og F3, og endrer
ingen av de 15 tabellradene. Ikke anvendt.

### F3 — `\s+` krysser linjeskift (lav, fail-closed retning)

`'##\nEt produktvalg'` → `true`. En bar `##`-linje etterfulgt av en linje med
«produktvalg» matcher, fordi `\s+` kan sluke linjeskiftet. Delvis pre-eksisterende
(`'##   \n   produktvalg'` matchet også med den gamle regexen).

Selve `.*` lekker derimot **ikke** over linjer — riktig, siden `/s` ikke er satt:
`'## Teknisk\nVi vurderte produktvalg her.'` → `false`. `^` ankrer per linje som
tiltenkt: `'Closes #1\n\n## Alternativer (produktvalg)\nA...'` → `true`. Begge
verifisert.

Retningen er fail-closed (ekstra menneskeport), så dette er ufarlig. Samme gjelder
markdown-blindheten: `` '```\n## Produktvalg\n```' `` matcher inni en kodeblokk
(pre-eksisterende). Motsatt vei er markøren strengere enn CommonMark: `'   ## Produktvalg'`
med 1–3 innrykk er en gyldig ATX-heading, men matcher ikke. Ingen av disse er
realistiske i en PR-body.

### F4 — markøren leses kun fra body, men nattkjøreren instrueres å legge valget i en PR-*kommentar* (medium, utenfor kontraktens scope)

`scripts/loops/decide-pr-card.ts:210–214` sender `body: pr.body` inn i
`classifyAutoMerge` — kommentarer leses aldri. Men:

- `docs/loops/nattkjoreren.md:189–195`: «Produktvalg i kontrakten … gjengi HELE
  seksjonen i **PR-kommentaren**».
- `CLAUDE.md:147` gir søsken-punktet «Fordeler/ulemper»-blokk «i body **eller
  første kommentar**», og malpunktet `CLAUDE.md:151–152` som foreskriver
  `## Alternativer (produktvalg)` sier ikke hvor seksjonen skal stå.

Et produktvalg som bare finnes i første kommentar er usynlig for markøren →
auto-merge forbi eieren. Samme utfall som #1623, annen akse (plassering, ikke form).
Demper i dag: nattkjører-PR-er er drafts og kortet noop-er drafts
(`autoMerge.ts:182–186`) — men hullet åpner seg i det noen kjører `gh pr ready`.

Utenfor kontraktens scope (den er avgrenset til heading-*form*), så ikke
blokkerende. Bør bli eget issue.

### F5 — asymmetrien mellom de to grenene er dokumentert, men smal (informasjonelt)

`produktvalg`-grenen har `.*`-toleranse foran ordet; `alternativ`-grenen har ikke.
Følgende forblir `false`: `## Alternativ 1` (tall i stedet for bokstav),
`## Alternativer` og `## Alternativer (A/B)` (bokstaver uten ordet «produktvalg»),
`## Valg: Alternativ A eller B` («Alternativ» ikke først). Alle er avvik fra den
foreskrevne malen, og doccen sier eksplisitt «**starter med** `## Alternativ A`–`E`»,
så dette er dokumentert og forsvarlig. Nevnt kun for protokollen. Bekreftet at den
tilsiktede false-positiven doccen nevner faktisk unngås: `## Vurderte alternativer`
→ `false`.

### F6 — prosjektminnet utenfor repoet holder fortsatt den gamle regelen (informasjonelt)

`~/.claude/projects/.../memory/`-notatene `feedback_produktvalg_marker_exact_heading.md`
og `feedback_produktvalg_heading_verbatim.md` sier fortsatt at kortet matcher KUN
«## Produktvalg»/«## Alternativ A/B» og at varianter auto-merges. Etter denne PR-en
er det feil. Ligger utenfor repoet, så PR-en kan ikke fikse det — hovedchatten bør
oppdatere notatene, ellers re-utleder en framtidig økt den gamle begrensningen.

## Bekreftet uten anmerkning

- **Aldri-lista:** `lib/loops/**` står ikke på `NEVER_AUTO_MERGE_GLOBS`
  (`autoMerge.ts:18–32`) — kontraktens «Funn utenfor scope» stemmer, og funnet ER
  filet: issue **#1655** står åpent. Reviewer-funn-plikten er oppfylt.
- **Test-disiplin:** endringen er ren Type A-logikk, utvider en eksisterende
  `it.each`-tabell i stedet for å legge til nye testfiler. Fire nye rader mot
  kriterienes to; de to ekstra (emoji-prefiks, fail-closed-negasjonen) låser
  eksplisitte oppførsels-påstander og er ikke «mens jeg var her»-tester.
- **Kommentaren over regexen** (`autoMerge.ts:57–75`) beskriver koden korrekt,
  inkludert at fail-closed-negasjonen er bevisst.
