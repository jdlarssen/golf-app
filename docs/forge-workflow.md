# Forge-arbeidsflyt

Flyttet ut av `CLAUDE.md` for å holde den lett (uendret innhold). Gjelder `/forge:auto`-kontrakt-først-disiplinen og hvordan `/forge:contract`-kontrakter postes som issue-kommentar. CLAUDE.md -> «Forge-arbeidsflyt» peker hit.

---

#### /forge:auto-disiplin (kontrakt-først)

Når brukeren invoker `/forge:auto` uten å spesifisere konkret issue/kontrakt, MÅ hovedchatten følge denne flyten:

1. **Finn åpne issues med eksisterende kontrakt.** To kilder å sjekke:
   - **Primært:** iterér åpne issues og sjekk kommentarene per issue: `gh issue list --state open --json number --jq '.[].number'` → per N: `gh api repos/jdlarssen/golf-app/issues/N/comments --jq '.[].body'` og se etter headeren «Forge-kontrakt tilgjengelig». (`gh search issues … in:comments` returnerer tomt for kommentar-innhold og skal IKKE brukes — verifisert 2026-07-07, jf. dok-avstemmeren C4.)
   - **Sekundært (sanity-check):** `ls .forge/contracts/` for `<number>-*.md`-filer på nåværende branch, krysset mot åpen-status via `gh issue view N --json state`.
2. **Hvis funnet:** Hvis det er ett kandidat-issue → kjør `/forge:auto` på den. Hvis flere → vis kort liste med issue-nummer + tittel + branch-navn, spør brukeren hvilken som skal kjøres.
3. **Hvis ingen funnet:** Kjør `/forge:contract` istedenfor. Spør brukeren hvilket åpent issue kontrakten skal skrives for, eller forslå basert på `gh issue list --state open` (filtrert til ikke-`epic` + ikke-`blocks-club-scale`-tunge kandidater).

Hvorfor: `/forge:auto` er ment for autonom utførelse mot en allerede gjennomtenkt spec. Å starte den uten kontrakt betyr at gray-area-diskusjonen skipps og bygge-løkken kjører på antagelser — det er nettopp dette `/forge:contract` skal forhindre. Kontrakt-først-disiplinen sikrer at hver `/forge:auto`-runde har et reelt sannhets-anker.

Aldri start `/forge:auto`-bygge-løkken uten enten (a) en eksisterende kontrakt-fil, eller (b) en kontrakt-kommentar på et åpent issue. Hvis brukeren eksplisitt spesifiserer et issue uten kontrakt: bekreft at de vil hoppe over `/forge:contract`-diskusjonen før du starter bygging.

#### Kontrakt-kommentar (når /forge:contract lager en)

Når `/forge:contract` produserer en kontrakt i `.forge/contracts/<N>-<slug>.md`, MÅ hovedchatten poste den til korresponderende issue via `gh issue comment N --body-file <path>` i samme runde som kontrakten skrives. Format:

```markdown
## 📋 Forge-kontrakt tilgjengelig

Det finnes en eksisterende forge-kontrakt for dette issuet på branchen `<branch-navn>`.

<details>
<summary><strong>Kontrakt: <kontrakt-tittel> — klikk for å vise</strong></summary>

<full markdown-innhold fra .forge/contracts/<N>-<slug>.md>

</details>
```

Hvorfor: kontrakter lever i branch-spesifikke `.forge/contracts/`-mapper og er usynlige for noen som ser på issue-en i nettleseren. Posting på issue-en gjør at scope og beslutninger er tilgjengelig der konteksten finnes, og at fremtidige sesjoner ikke gjør duplikat-arbeid.

Bruk `<details>`-wrapper så issue-siden ikke drukner i veggen av tekst. Bygg comment-body i en temp-fil og post med `--body-file` (kontrakter er 15–30KB, for store til shell-escaping).

Hvis kontrakten revideres senere i samme sesjon: post oppdatert versjon som ny kommentar — ikke editer den gamle. Audit-trail er viktigere enn ren issue-historikk.

#### Konvergensregler (#1077)

Reglene under gjelder hver `/forge:auto`-kjøring og stopper de to verste autonomi-feilmodusene: å spinne på identiske avvisninger, og å gi opp uten artefakt.

1. **Runde-historikk.** Etter hver evaluate-runde: appender én linje til `.forge/evaluations/<kontrakt-slug>-runder.md` med runde-nummer, verdikt (ACCEPT/NEEDS WORK) og finding-signaturene. Fila committes med `Refs #N` — evalueringssignaler skal overleve kontekstvinduet.
2. **Finding-signatur.** Hvert funn normaliseres til `fil + kriterium` (f.eks. `bash-guard.sh + logg-lekkasje`), ikke fritekst. Fremgang måles mekanisk: signatur-settet i runde k sammenlignes med runde k−1.
3. **No-progress → tvunget strategibytte.** To påfølgende runder med identisk signatur-sett = ingen fremgang. Da er blind retry forbudt — bytt strategi: dispatch en fresh-context fix-subagent som KUN får evalueringsrapporten som spec (aldri den forrige agentens kontekst eller antagelser).
4. **Harde tak.** Maks 5 evaluate-runder totalt per kontrakt; maks 2 no-progress-runder etter strategibytte. Taket nås → gå til punkt 5, aldri «én runde til».
5. **Ikke-konvergens har alltid artefakt.** Aldri kast delarbeid, aldri reset, aldri stille exit: push delarbeidet som draft-PR og post `.forge/templates/eskalering.md` (utfylt) som kommentar på issuet — inkludert ETT konkret A/B-spørsmål eieren kan besvare uten å lese kode.
