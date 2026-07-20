# Utroperen — ukentlig lanserings-los (#1207, epic #1073)

Ukentlig cloud-routine (torsdag 09:00 Europe/Oslo) som foreslår ÉN lansering
fra CHANGELOG-en og speiler forslaget til Discord med en 📣 Publiser-knapp.
Eieren publiserer med ett tapp; selve publiseringen skjer i appen via
interactions-endepunktet (`publish_lansering`, se `lib/loops/discordActions.ts`).

## Harde regler

- **Copy hentes ORDRETT fra CHANGELOG.md på main.** Oppføringene er humanisert
  (eierbeslutning 2026-07-10) — Utroperen forfatter aldri egen bruker-copy.
  Felt-løfting per `docs/changelog-conventions.md`: tittel = teksten etter
  «·» i `<summary>`, body = setningen etter «—» (uten `[#N]`-prefikset),
  lenke + knappetekst = `↳ /lenke · «cta»`-linja. Mangler `↳`-linja →
  foreslå uten lenke/knappetekst (valider-reglene tillater null).
- **Maks ÉN lansering foreslås per uke.** Aldri to; aldri tvangs-lansering.
  Tom kø → eksplisitt tom-uke-melding (stillhet skal bety at loopen feilet).
- **Read-only mot alt** unntatt kommentarer og body på tavle-issuet #1208 og
  Discord-postingen. Ingen prod-DB-tilgang finnes i routine-miljøet — all
  publisert-tilstand leses fra tavle-kommentarene.
- **Tavle-issuet #1208 lukkes aldri og bygges aldri** (samme regel som #1110;
  det skal aldri få forge-kontrakt, og kvalifiserer dermed aldri for natt-køen).

## Kø-modellen

Shipping skjer i rykk; Utroperen er bufferen som drypper funksjonene ut én
per uke i stedet for «alt i en smell» (eierbeslutning 2026-07-10). Køen er
**kuratert og synlig** i #1208-body-en, ikke utledet — eieren ser og styrer
«disse MÅ vi lansere» direkte (eierbeslutning 2026-07-20).

**#1208-body-en har to seksjoner:**

1. **«Neste ut (MÅ lanseres)»** — den prioriterte lanserings-køen. Rekkefølgen
   HER er prioriteringen; eieren omprioriterer, sletter og flytter fritt mellom
   kjøringene. Body-en er sannhetskilden for prioritering.
2. **«Fra arkivet — verdt ny blest»** — eldre leverte-men-aldri-lanserte
   funksjoner som kan få ny blest i rolige uker.

**Plukk-regel:** øverste i «Neste ut»; er den tom → øverste i «Fra arkivet»;
begge tomme → tom-uke-melding (stillhet skal bety at loopen feilet). Rutinen
plukker alltid ovenfra og omsorterer aldri.

**Ukentlig vedlikehold** (torsdager, begrenset til tre operasjoner):

- **Appende nederst:** nye Funksjon-oppføringer i CHANGELOG som består
  **spiller-testen** («vil en kompis i en fredagsflight gjøre noe annerledes
  etter å ha lest dette?») legges NEDERST i «Neste ut». Versjonsnumre,
  opprydding og admin-verktøy stryker; funksjoner med handlingsverdi består.
- **Stryke publiserte:** oppføringer som er publisert (per ✅-markørene,
  tittel-match) fjernes fra begge seksjoner.
- **Foreslå arkiv-kandidater:** funksjoner rutinen mener fortjener ny blest
  foreslås inn i «Fra arkivet» — men først etter **sannhetssjekk** (se under).

Rutinen omsorterer aldri, og legger aldri noe i «Neste ut» annet enn nye,
kvalifiserende CHANGELOG-oppføringer nederst. All omprioritering er eierens.

**Sannhetssjekk for arkiv-kandidater:** gamle CHANGELOG-tekster kan inneholde
foreldede påstander (presedens: 1.181-parentesen «(slagspill, stableford og
best ball)» ble foreldet av 1.183). Verifiser teksten mot nyere oppføringer FØR
en kandidat foreslås. Er den utdatert → IKKE foreslå ordrett; flagg det i
torsdagsmeldingen («teksten i x.y er utdatert — trenger CHANGELOG-rettelse
først»), evt. med forslag til docs-PR.

## Tavle-kommentaren (primærartefakt, postes FØR Discord)

Lesbar gjengivelse + maskinlesbar blokk. JSON-blokken er kontrakten med
endepunktet (`extractLanseringProposal` parser den — feltene valideres med
samme regler som `/admin/lanseringer`-skjemaet, lenke må starte med `/`):

````markdown
📣 Ukens lansering — <ukedag> <dato>

**<tittel>**
<body>
↳ <link> · «<cta_label>»

Kø: + N til på lager · Publisert denne måneden: M

```json
{"title":"<tittel>","body":"<body>","link":"/<sti>","cta_label":"<cta>"}
```
````

**Kø-teller:** «+ N til på lager» = gjenværende oppføringer i «Neste ut» etter
ukens forslag; «Fra arkivet»-seksjonen telles ikke som lager.

Tom uke: kommentar med «Ingen lansering denne uka — neste kandidat i kø:
<tittel eller ‘kø tom’>» (ingen json-blokk, ingen knapp i Discord).

**✅-markøren** (postes av endepunktet ved publisering, leses av Utroperen som
publisert-tilstand): `✅ Publisert: <tittel> — YYYY-MM-DD`. Match på tittel
mot CHANGELOG-oppføringen; datoen brukes i månedsbrev-vakta.

## Discord-speiling (etter tavle-kommentaren)

Samme mønster som morgenbriefen (`docs/loops/morgenbriefen.md`):

- **Med bot-identitet** (`DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID`): post
  forslaget med knapp «📣 Publiser» og
  `custom_id: publish_lansering:<kommentar-id fra tavle-posten>`.
  Endepunktet svarer i kanalen med kvittering («ute hos N brukere …»).
- **Kun webhook** (`DISCORD_WEBHOOK_URL`): ren tekst uten knapp — feltene er
  uansett lim-inn-klare for `/admin/lanseringer`.
- **Speiling feiler:** noter det i neste ukes melding og i heartbeat —
  aldri la det stoppe tavle-kommentaren.

## Månedsbrev-vakta

Månedsbrevet (#202) sender ALLE lanseringer fra forrige kalendermåned 1. i
måneden. Tell ✅-markører med inneværende måneds dato; **≥ 4 → varsellinje**
(«månedsbrevet begynner å bli fullt — vurder å la denne vente») men fortsatt
forslag — redaksjonen er eierens, vakta stopper aldri. Manuelle publiseringer
utenom Utroperen fanges ikke her; endepunktets kvittering gir eksakt
DB-telling ved hvert tapp.

## Heartbeat

Utroperen poster ALLTID på #1208 hver torsdag (forslag eller tom-uke-melding)
— det er heartbeaten. Morgenbriefen sjekker den fredager: mangler én torsdag →
varsellinje i briefen; to på rad → infra-issue (standard mønster, se
`docs/loops/morgenbriefen.md`).

## Månedlig arkivering

Kommentarene på #1208 arkiveres månedlig til `docs/loops/logg/<år>-<måned>.md`
sammen med #1110-arkivet (morgenbriefens arkiv-rutine tar begge).
