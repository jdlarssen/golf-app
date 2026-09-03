# Forge-arbeidsflyt

Flyttet ut av `CLAUDE.md` for å holde den lett (uendret innhold). Gjelder `/forge:auto`-kontrakt-først-disiplinen og hvordan `/forge:contract`-kontrakter postes som issue-kommentar. CLAUDE.md -> «Forge-arbeidsflyt» peker hit.

---

#### /forge:auto-disiplin (kontrakt-først)

Når brukeren invoker `/forge:auto` uten å spesifisere konkret issue/kontrakt, MÅ hovedchatten følge denne flyten:

1. **Finn åpne issues med eksisterende kontrakt.** Issue-kommentaren er eneste kilde: iterér åpne issues og sjekk kommentarene per issue: `gh issue list --state open --json number --jq '.[].number'` → per N: `gh api repos/jdlarssen/golf-app/issues/N/comments --jq '.[].body'` og se etter headeren «Forge-kontrakt tilgjengelig». (`gh search issues … in:comments` returnerer tomt for kommentar-innhold og skal IKKE brukes — verifisert 2026-07-07, jf. dok-avstemmeren C4.) Å lete etter kontrakt-filer på branchen er ikke lenger en gyldig sanity-check — filene committes ikke (#1931).
2. **Hvis funnet:** Hvis det er ett kandidat-issue → kjør `/forge:auto` på den. Hvis flere → vis kort liste med issue-nummer + tittel + branch-navn, spør brukeren hvilken som skal kjøres.
3. **Hvis ingen funnet:** Kjør `/forge:contract` istedenfor. Spør brukeren hvilket åpent issue kontrakten skal skrives for, eller forslå basert på `gh issue list --state open` (filtrert til ikke-`epic` + ikke-`blocks-club-scale`-tunge kandidater).

Hvorfor: `/forge:auto` er ment for autonom utførelse mot en allerede gjennomtenkt spec. Å starte den uten kontrakt betyr at gray-area-diskusjonen skipps og bygge-løkken kjører på antagelser — det er nettopp dette `/forge:contract` skal forhindre. Kontrakt-først-disiplinen sikrer at hver `/forge:auto`-runde har et reelt sannhets-anker.

Aldri start `/forge:auto`-bygge-løkken uten en kontrakt-kommentar på et åpent issue. Hvis brukeren eksplisitt spesifiserer et issue uten kontrakt: bekreft at de vil hoppe over `/forge:contract`-diskusjonen før du starter bygging.

#### Draft-først i økt-PR-flyten (#1516)

Gjelder `/forge:auto` og alle andre økt-flyter som fortsetter å pushe etter PR-opprettelse
(bokføring: kontrakt-avkryssinger, evaluator-verdikt, runde-fil). Discord-PR-kortet
auto-merger i det checkene blir grønne — uten draft-disiplinen merger det på eldre HEAD
mens bokføringen fortsatt står i den lokale pre-push-gaten (#1499/#1513 → opprydnings-PR
#1515).

1. **Opprett PR-en som draft:** `gh pr create --draft …`. Staging-bevis-kommentar +
   `staging-verified`-label fungerer som før. Kortet noop-er drafts (ingen kort, ingen
   dedup-label, ingen merge) — draft = «økta jobber fortsatt».
2. **Gjør all bokføring ferdig:** kontrakt-avkryssinger med evidens, evaluator-verdikt,
   runde-fil — committet og pushet.
3. **Bekreft at remote er à jour:** `git ls-remote origin <branch>` viser samme SHA som
   lokal HEAD (SSH-push kan dø stille under pre-push-gaten — verifiser etter HVER push).
4. **`gh pr ready` er øktas siste handling.** Ready-flippen fyrer kortet
   (`pull_request: ready_for_review`-triggeren), som klassifiserer og auto-merger/
   knapp-korter som normalt. Etter ready finnes per definisjon ingen haler.

#### Kontrakt-kommentar (når /forge:contract lager en)

`/forge:contract` skriver kontrakt-utkastet lokalt til `.forge/contracts/<N>-<slug>.md` — det gjør pluginen, og den fila **committes aldri** (`.forge/` er gitignorert, #1931). Det er posteringen som gjør utkastet til en kontrakt: hovedchatten MÅ poste den til korresponderende issue via `gh issue comment N --body-file <path>` i samme runde som kontrakten skrives. Format:

```markdown
## 📋 Forge-kontrakt tilgjengelig

Kontrakten for dette issuet ligger her. Den er ikke committet — issue-kommentaren er den
kanoniske kopien. Byggeren leser den herfra.

<details>
<summary><strong>Kontrakt: <kontrakt-tittel> — klikk for å vise</strong></summary>

<full markdown-innhold fra .forge/contracts/<N>-<slug>.md>

</details>
```

Hvorfor: issue-kommentaren er den eneste kopien som overlever at branchen slettes, at worktreet ryddes eller at neste økt starter på en annen maskin. Posting på issue-en gjør at scope og beslutninger er tilgjengelig der konteksten finnes, og at fremtidige sesjoner ikke gjør duplikat-arbeid.

Bruk `<details>`-wrapper så issue-siden ikke drukner i veggen av tekst. Bygg comment-body i en temp-fil og post med `--body-file` (kontrakter er 15–30KB, for store til shell-escaping).

Hvis kontrakten revideres senere i samme sesjon: post oppdatert versjon som ny kommentar — ikke editer den gamle. Audit-trail er viktigere enn ren issue-historikk.

#### Tidligere beslutninger — de bor i issuene

`/forge:contract`s «load prior decisions»-steg leter i issue-kommentarene, ikke på disk: iterér de aktuelle issuene og hent kommentarene per issue med `gh api repos/jdlarssen/golf-app/issues/N/comments`, og se etter headeren «📋 Forge-kontrakt tilgjengelig». Bruk ALDRI `gh search … in:comments` — den returnerer tomt for kommentar-innhold (verifisert 2026-07-07, jf. dok-avstemmeren C4).

Et ferskt worktree har tom eller manglende `.forge/`. Det er forventet, ikke en feil: `.forge/` er en lokal arbeidsflate for forge-skillene, den er gitignorert (#1931), og ingen økt skal lete etter en kontrakt eller en evaluering der. Fant du ingenting på issuet, finnes det ingen kontrakt.

#### Konvergensregler (#1077)

Reglene under gjelder hver `/forge:auto`-kjøring og stopper de to verste autonomi-feilmodusene: å spinne på identiske avvisninger, og å gi opp uten artefakt.

1. **Runde-historikk.** Etter hver evaluate-runde bokføres runden i ÉN kommentar på PR-en, med overskriften `## Evaluate-runder` og en tabell: runde · verdikt (ACCEPT/NEEDS WORK) · finding-signaturer. Runde 1 oppretter kommentaren; hver senere runde PATCH-er den SAMME kommentaren med en ny rad (`gh api -X PATCH repos/jdlarssen/golf-app/issues/comments/<id> --input <json-fil med body>`) — én tabell å lese, ikke én kommentar per runde. Draft-PR-en er opprettet før første runde (#1516), så det finnes alltid et sted å poste; kjøres `/forge:auto` i en flyt uten PR, går tabellen på issuet under samme overskrift. Closing-kommentaren lenker til den. Poenget er uendret: evalueringssignaler skal overleve kontekstvinduet.
2. **Finding-signatur.** Hvert funn normaliseres til `fil + kriterium` (f.eks. `bash-guard.sh + logg-lekkasje`), ikke fritekst. Fremgang måles mekanisk: signatur-settet i runde k sammenlignes med runde k−1.
3. **No-progress → tvunget strategibytte.** To påfølgende runder med identisk signatur-sett = ingen fremgang. Da er blind retry forbudt — bytt strategi: dispatch en fresh-context fix-subagent som KUN får evalueringsrapporten som spec (aldri den forrige agentens kontekst eller antagelser).
4. **Harde tak.** Maks 5 evaluate-runder totalt per kontrakt; maks 2 no-progress-runder etter strategibytte. Taket nås → gå til punkt 5, aldri «én runde til».
5. **Ikke-konvergens har alltid artefakt.** Aldri kast delarbeid, aldri reset, aldri stille exit: push delarbeidet som draft-PR og post `docs/loops/eskalering-mal.md` (utfylt) som kommentar på issuet — inkludert ETT konkret A/B-spørsmål eieren kan besvare uten å lese kode.
