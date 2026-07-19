# Kontrakt: Godkjenn-køen på norsk — auto-kø for ren teknikk, Funksjonell-oppsummering på resten (#1302)

## Problem

Eieren kan ikke lese forge-kontrakter, men dagens kø krever «les kontrakten før du køer» på smed-skrevne kontrakter — eieren blir flaskehals på saker uten reelle valg (observert: #1260 lå kontraktert og utappet 17.–19. juli). Nøkkelinnsikten (issue-teksten): gråsone-rutingen (#1151) sender alle ekte produkt-/designvalg til eieren FØR kontrakt skrives — alt som når køen er allerede maskin-klassifisert som «ingen produktvalg». Den menneskelige porten som faktisk gjelder er MERGE-porten, som står urørt.

## Research-funn (verifisert i økten)

- **Smeden setter aldri `autonomy:ready` i dag** og har IKKE Discord-tilgang (GitHub-only nettverk, `docs/loops/kontrakt-smeden.md`) — den poster kun issue-kommentarer + heartbeat på #1110. All Discord-formidling (linjer + knapper) eies av **morgenbriefen** (06:30, `docs/loops/morgenbriefen.md`), som flagger smed-kontrakter med 🤖 + «les kontrakten før du køer» (linje 73-76).
- **Snooze-gapet er kodebekreftet:** `lib/loops/discordActions.ts:214-238` (`case 'snooze_issue'`) poster kommentar, setter `parked`, fjerner de to `needs-*`-labelene — men rører ALDRI `autonomy:ready`. Testen (`discordActions.test.ts:232-259`) asserter nøyaktig 4 GitHub-kall. En snoozet auto-køet sak ville altså bygges likevel.
- **Maskinlesbart felt-presedens:** utroperen bruker fenced ```json```-blokk parset av `extractLanseringProposal()` (`discordActions.ts:104-136`).
- Ready-knappen er `ready_issue:<N>` (`discordActions.ts:170-177`); nattkjøreren plukker eldste `autonomy:ready` (maks 2/natt) og krever kontrakt-kommentar med «Forge-kontrakt tilgjengelig»-header.
- Throttle i dag: smeden skriver null nye kontrakter når ≥8 åpne u-køede kontrakter venter — teller ALLE, uansett kategori.

## Design (rammene er eier-besluttet i issuet; detaljene under er utfyllingen)

**1. Klassifisering i smeden (docs-endring, `kontrakt-smeden.md` steg 3):** hver kontrakt-kommentar får en maskinlesbar blokk rett under headeren:
```json
{ "kontraktKlasse": "teknisk" | "bruker-synlig", "funksjonell": "<én norsk setning i CHANGELOG-tone>" }
```
- `teknisk` = null bruker-synlig effekt (test/infra/tooling/refactor — ville vært `[no-changelog]`).
- `bruker-synlig` = spillere/eier ser noe endre seg (ville fått CHANGELOG-linje). Klassifiserings-regelen gjenbruker altså den hook-håndhevede definisjonen — én hjemme-regel.
- `funksjonell`-setningen er OBLIGATORISK for begge klasser («Fikser at …», «Spillerne får nå …») og humanizer-tone.
- Tvil → `bruker-synlig` (fail-closed: eieren ser mer, aldri mindre).

**2. Auto-kø for `teknisk` (docs-endring, smeden steg 3/4):** smeden setter selv `autonomy:ready` på ren-teknikk-saker rett etter kontraktspostering (den HAR GitHub-tilgang). Veto-formidlingen skjer i morgenbriefen samme morgen (smeden kjører før briefen — nattkjøringen er først PÅFØLGENDE natt, så vetovinduet er hele dagen): egen brief-seksjon «🔧 Auto-køet (bygges i natt — tapp ⏸ for å stoppe): #N — <funksjonell>» med eksisterende snooze-knapp per sak. ASSUMPTION (avvik fra issue-ordlyden «smeden poster til Discord»): smeden kan ikke poste til Discord (ingen creds — verifisert); briefen er budbringeren. Intensjonen (norsk énlinjer + ⏸ før bygging) er bevart.

**3. `bruker-synlig`: ready-tapp beholdes, lesekravet erstattes** (docs-endring, morgenbriefen): kø-linjen blir «#N — <funksjonell-setningen> → 🌙-knapp» — ALDRI kontrakt-tittel + «les kontrakten»-krav. 🤖-markøren beholdes som opphavs-info. Mangler json-blokken (eldre kontrakter): fall tilbake til dagens linjeformat.

**4. Snooze-fiksen (kodeendring):** `snooze_issue`-grenen i `lib/loops/discordActions.ts` får et femte kall: `DELETE .../labels/autonomy%3Aready` (404-tolerert som no-op, samme mønster som de to andre). Test-oppdatering i `discordActions.test.ts` (Type A, eksisterende mock-mønster). Sjekk samtidig `drop_issue`-grenen — fjerner den ikke ready, får den samme tillegg (dropp skal aldri etterlate en byggbar kø-markering).

**5. Throttle-justering (docs, smeden steg 4):** ≥8-telleren teller heretter kun `bruker-synlig`-saker som venter på tapp (teknisk-saker venter ikke på eieren og skal ikke kvele smeden).

**6. Revisjonsspor (docs, morgenbriefen):** morgenen ETTER en natt med auto-køede bygg viser briefen hva som ble bygget med 🔧-markør + funksjonell-setningen (nattkjørerens PR-er har allerede Discord-kort; brief-linjen er oppsummeringen) — issue-kriterium 4.

## Kanttilfeller & vakter

- Merge-porten røres IKKE; gråsone-rutingen (#1151) røres IKKE; `docs/loops/discord-pr-kort.md` røres IKKE (issue-avgrensning).
- Håndsydde kontrakter fra eier-økter (uten 🤖-header): påvirkes ikke — de er implisitt godkjent; hovedchat-økter kan fortsette å sette ready manuelt (som i denne økten).
- Feilklassifisering `teknisk` på noe bruker-synlig: fanges av (a) fail-closed-regelen, (b) morgenbrief-revisjonssporet, (c) merge-porten — dokumentér kjeden i smed-docen.
- Snooze på sak som IKKE var auto-køet: DELETE er 404-tolerert — uendret oppførsel.
- Json-blokk med ugyldig JSON: briefen faller tilbake til tittel-linje + flagger i Loop-helse (aldri stille).

## Nøkkelbeslutninger

- **Briefen er Discord-budbringer, ikke smeden** — ASSUMPTION begrunnet i verifisert creds-mangel; issue-intensjonen bevart.
- **Klassifiserings-definisjonen = CHANGELOG-definisjonen** — gjenbruker hook-håndhevet grense, ingen ny gråsone.
- **Kodeendringen er kun snooze/drop-label-fiksen** — resten er docs (loops-rutinene ER promptene sine).
- **Commit:** `fix(loops)` + patch-bump + `[no-changelog]` for kodedelen; `docs(loops)` for doc-filene. Refs #1302.

**Claude's discretion:** eksakt seksjonsrekkefølge/ordlyd i brief-formatet; json-blokkens plassering i kommentar-malen; om `drop_issue` trenger fiksen (verifiseres i koden først).

## Suksesskriterier

- [ ] `discordActions.test.ts`: snooze-testen asserter DELETE av `autonomy:ready` (404-tolerert); grønn. **Bevis:** vitest-output.
- [ ] `docs/loops/kontrakt-smeden.md`: klassifiserings-steg med json-blokk-mal, auto-ready-semantikk for `teknisk`, justert throttle — og «LES før du køer»-linjen i kommentar-headeren erstattet.
- [ ] `docs/loops/morgenbriefen.md`: auto-kø-seksjon med ⏸, funksjonell-basert kø-linje for `bruker-synlig`, fallback for kontrakter uten blokk, revisjonsspor-linje.
- [ ] Issue-kriterium 1–4 er sporbart dekket: pek per kriterium på doc-avsnitt/kodelinje i PR-beskrivelsen (rutinene kjører i skyen — full ende-til-ende kan først observeres neste smed-/brief-kjøring; skriv `VERIFICATION GAP: første reelle kjøring` + at CI-vakta/eieren ser morgenbriefen dagen etter).
- [ ] Grep-vakt: `grep -rn "les kontrakten" docs/loops/` → 0 treff etter endringen.

## Gates

- [ ] `npm run build` + `npm run lint` + `npx vitest run lib/loops/` grønne
- [ ] Commit-bodyer `Refs #1302`; PR-body `Closes #1302`

## Filer som trolig berøres

- `lib/loops/discordActions.ts` + `lib/loops/discordActions.test.ts` — snooze/drop-fiks
- `docs/loops/kontrakt-smeden.md`, `docs/loops/morgenbriefen.md`
- `package.json`/`package-lock.json` — patch-bump (kodedelen)

## Utenfor scope

- Discord-PR-kort/merge-siden (#1301 eier docs-PR-hullet); gråsone-rutingens logikk; nattkjørerens plukk-regler; retro-klassifisering av eksisterende kontrakt-kommentarer.
