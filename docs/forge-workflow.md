# Forge-arbeidsflyt

Flyttet ut av `CLAUDE.md` for å holde den lett (uendret innhold). Gjelder `/forge:auto`-kontrakt-først-disiplinen og hvordan `/forge:contract`-kontrakter postes som issue-kommentar. CLAUDE.md -> «Forge-arbeidsflyt» peker hit.

---

#### /forge:auto-disiplin (kontrakt-først)

Når brukeren invoker `/forge:auto` uten å spesifisere konkret issue/kontrakt, MÅ hovedchatten følge denne flyten:

1. **Finn åpne issues med eksisterende kontrakt.** To kilder å sjekke:
   - **Primært:** `gh search issues --repo jdlarssen/golf-app 'is:open is:issue "Forge-kontrakt tilgjengelig" in:comments'` — gjenkjenner kontrakt-kommentar-headeren fra `/forge:contract`-disiplinen.
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
