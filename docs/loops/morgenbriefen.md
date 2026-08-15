# Morgenbriefen — verifisert handlingsliste + heartbeat-vakt (#1080, epic #1073)

Daglig cloud-routine (06:30) som gir eieren ÉN lesbar kvittering for hva
loopene gjorde — der hver påstand er verifisert før den står der. Designet for
en eier som ikke leser kode: hver linje er én handling med lenke.

## Harde regler

- **Verifiser FØR inkludering.** Hver påstand sjekkes med en gh-kommando i
  samme kjøring: PR-checks faktisk grønne (`gh pr checks`), issue faktisk
  åpent/lukket (`gh issue view --json state`), label faktisk satt. En påstand
  som ikke lar seg verifisere rapporteres som **loop-feil** i briefen — aldri
  som suksess.
- **Beslutningspunkter krever fersk kommentar-sjekk.** Før et «Svar A/B på
  #N»-punkt listes: les issuets NYESTE kommentarer. Finnes et eier-svar (den
  kanoniske strengen «Eierbeslutning via Discord: **A**» — samme streng som
  A/B-knappen poster) eller en kontrakt med beslutningen innbakt, er punktet
  foreldet — utelat det, eller vis neste steg i stedet. Det samme gjelder
  droppede/parkerte punkter: issue lukket eller `parked`-label satt → utelat.
  (Lærdom fra første brief: #1104 ble listet som ubesvart 30 min etter at
  eieren svarte A.)
- **Delta, ikke dump:** finn forrige brief-kommentar på #1110 (nyeste kommentar
  som starter med `☀️ Morgenbrief`); rapporter kun endringer etter dens
  tidsstempel. Første brief noensinne: siste 24 timer.
- **Titler er ikke nok (eierbeslutning 2026-07-28, #1408):** hver sak i gruppene
  «Trenger deg nå», «Klar for natt-kø», «Auto-køet» og «Skjedde i natt» følges av
  en innrykket `↳`-detaljlinje på 1–3 setninger produktspråk: hva saken betyr i
  appen, og for handlingslinjer hva som skjer ved tapp. Hent teksten fra
  funksjonell-setninger (kontrakt-json, closing-kommentarer, CHANGELOG) der de
  finnes; skriv den ellers selv i samme tone («Du kan nå …»). Aldri filnavn,
  branch-navn eller CI-sjargong i ↳-linja. «Loop-helse» er unntatt (telemetri).
- **Auto-mergede PR-er er ikke gjøremål (#1406).** PR-kortet
  (`docs/loops/discord-pr-kort.md`) merger selv grønne PR-er uten produktvalg. En
  «Godkjenn PR #M»-linje under «Trenger deg nå» gjelder derfor KUN PR-er som
  fortsatt har et knapp-kort — altså der kortet degraderte til `card`: produktvalg
  (valg-markør i PR-body-en eller lenket `autonomy:needs-decision` — nøyaktig form
  i `docs/loops/discord-pr-kort.md` steg 2, ikke gjentatt her: #1623 kom av at tre
  hjem beskrev markøren ulikt), aldri-liste-fil, eller bruker-synlig uten
  `staging-verified`. En PR som allerede
  er auto-merget rapporteres under «Skjedde i natt» (verifisert merge), aldri som
  et åpent gjøremål.
- **Branch protection dekker merge-porten (#1477, fra 2026-08-07).** Main nekter
  server-side enhver merge uten grønn `verify` + `e2e` + `scan` på head-SHA-en
  (docs-only-PR-er dekkes av no-op-tvillingene i `ci-docs-noop.yml`). En PR som
  ER merget har derfor beviselig hatt grønne porter — «Skjedde i natt»-
  verifiseringen av en merge trenger bare bekrefte selve mergen, ikke re-lese
  check-rollupen. For ÅPNE PR-er gjelder `gh pr checks`-plikten fortsatt: et
  tomt/foreldet rollup betyr at checks aldri kjørte (#1469, intermitterende)
  og må dispatches — det kan ikke lenger merges forbi, men det kan blokkere
  en legitim merge til noen starter dem.
- **Tom natt gir én linje** («ingen aktivitet — heartbeats OK»), aldri
  ingenting. Stillhet fra briefen selv skal bety at briefen feilet; da er
  claude.ai/code/routines-siden eierens fallback.
- Read-only mot alt unntatt: brief-kommentaren på #1110 og eventuelle
  infra-issues fra heartbeat-vakta.

## Innhold (postes som kommentar på #1110)

```
☀️ Morgenbrief <dato>

**Trenger deg nå:**
- Godkjenn PR #M — <issue-tittel>; kun knapp-kort-PR-er (produktvalg / aldri-liste / mangler staging-bevis), gates grønne[, e2e grønn / needs-manual-qa: <flyt>] → <lenke>
  ↳ <1–3 setninger produktspråk: hva endringen gjør i appen, og hva som skjer når du godkjenner>
- Svar A/B på #N — <én setning om spørsmålet> → <lenke>
  ↳ <1–3 setninger: hva A og hva B betyr i bruk — forskjellen eieren faktisk merker>
- 🛠 #N trenger kontrakt-økt — kjør `/forge:contract` på #N → <lenke>
  ↳ <1–2 setninger: hva saken gjelder og hvorfor den trenger en økt med deg>

**Klar for natt-kø (ett tapp = køet):**
- #N — <funksjonell-setning fra kontrakten>; forge-kontrakt klar, ikke merket enda → 🌙 <lenke>
  ↳ <1–2 setninger: hva du/spillerne kan gjøre i appen når den er bygget>

**Auto-køet (bygges i natt — tapp ⏸ for å stoppe):**
- 🔧 #N — <funksjonell-setning> → <lenke>
  ↳ <1–2 setninger: hva som blir annerledes, og hvorfor den er trygg å bygge uten deg>

**Skjedde i natt/i går:**
- <merget PR / lukket issue / CI-vakt-fiks — kun verifiserte fakta, med lenke>
  ↳ <1–2 setninger: hva som er annerledes i appen nå — «Du kan nå …» / «Når X skjer, …»; ingen synlig endring → si det ærlig («ingen synlig endring — <hva som ble ryddet, i produktspråk>»)>
- 🔧 #N — <funksjonell> (auto-køet sak bygget i natt; revisjonsspor #1302/#1413)

**Loop-helse:**
- Nattkjøreren: <heartbeat-status> · Dok-avstemmeren: <heartbeat-status hvis due> · CI-vakta: <antall CI-vakt-issues åpne; liveness sees på routines-siden>
```

Ingenting å melde i en gruppe → utelat gruppa. Alle fem tomme → tom-natt-linja.

## Kø-kandidater (finn dem — ikke bare vis knappen)

«Klar for natt-kø»-gruppa lister åpne issues som er kontrakt-klare men ikke enda
køet, så eieren kan merke dem `autonomy:ready` med ett tapp. Et issue kvalifiserer
kun når ALT stemmer:

- forge-kontrakt finnes: `.forge/contracts/<n>-*.md` på main ELLER en kommentar
  med header «📋 Forge-kontrakt tilgjengelig», OG
- IKKE labelet `autonomy:ready` (ikke allerede i køen), OG
- IKKE labelet `autonomy:blocked`, OG
- IKKE issue **#1110 selv** — den levende Loop-drift-tavla skal aldri bygges
  (nattkjøreren leverer med «Closes #N», så en merge ville lukket tavla).
  #1147 la en kontrakt på #1110 for arkiv-arbeidet; det hører egentlig hjemme i
  et eget issue, men inntil da er #1110 hardt ekskludert her.

Eldste kontrakt først, maks 5 i briefen; flere → «+N til, se #1110». Hver kandidat
får den eksisterende `ready_issue:<N>`-knappen i Discord-speilingen («🌙 Klarer for
natta», button style 1) — samme knapp som mappes i Discord-seksjonen under. Ingen
kandidater → utelat gruppa (ikke en loop-feil; tom kandidat-liste er normalt).

Er kontrakten **auto-skrevet av kontrakt-smeden** (kommentaren starter med «🤖
Auto-skrevet …», jf. docs/loops/kontrakt-smeden.md), behold 🤖 som opphavs-markør,
men vis kø-linja på **`funksjonell`-setningen fra kontraktens json-blokk** — ikke
et krav om å lese kontrakten: «#N — <funksjonell> → 🌙». Eieren kan ikke lese
kontrakter (#1302), så han godkjenner på den norske oppsummeringen, ikke
kontrakt-teksten.

Kun **aldri-auto-kategoriene** (auth-/sikkerhetsendringer, destruktive flyter,
alt som koster penger — jf. steg 3 i smed-docen) havner her etter #1413: alle
andre kontrakter auto-køer smeden selv (`autonomy:ready` satt), så de er
ekskludert fra denne gruppa (som før krever «IKKE `autonomy:ready`») og vises i
stedet under **«Auto-køet»** (se innholdsmalen) med ⏸-veto.

**Fallback (eldre kontrakter uten json-blokk):** mangler kommentaren
`kontraktKlasse`/`funksjonell`-feltet, fall tilbake til dagens format — issue-tittel
+ 🤖-markør — og noter «json-blokk mangler på #N» i Loop-helse (aldri stille anta en
klasse). Ugyldig JSON i blokken behandles likt: tittel-linje + Loop-helse-flagg.

## Auto-køet — smedens auto-køede kontrakter (#1302, utvidet av #1413)

Smeden setter `autonomy:ready` selv på alle kontrakter unntatt
aldri-auto-kategoriene; briefen er veto-budbringeren (smeden har ingen
Discord-tilgang). Finn åpne issues der ALT stemmer, og list dem i
«Auto-køet»-gruppa:

- forge-kontrakt-kommentar (🤖 smed-skrevet, `teknisk` eller `bruker-synlig`), OG
- `autonomy:ready` satt (av smeden), OG
- IKKE `autonomy:blocked`, IKKE `parked`, IKKE #1110.

Har kontrakten `"produktvalg": true` i json-blokken: merk linja
«(produktvalg — alternativene kommer i PR-en)» så eieren vet at valget hans
kommer som PR-svar, ikke som ⏸-avgjørelse nå.

Linje: «🔧 #N — <funksjonell> → <lenke>» med **⏸-knappen** (`snooze_issue:<N>`) —
ett tapp stopper bygget (⏸ setter `parked` OG fjerner `autonomy:ready`, #1302).
Vetovinduet er hele dagen: smeden kjører før briefen, nattkjøringen er først
påfølgende natt. Ingen auto-køede → utelat gruppa (normalt, ikke en loop-feil).

## Gråsone-punkter (smedens ruting, #1151 — innsnevret av #1413)

Smeden ruter nå kun uskopbare kandidater til eieren; produktvalg lever som
alternativer i kontrakt/PR i stedet. Briefen løfter fortsatt begge labels under
«Trenger deg nå» til de gamle er tømt:

- **`autonomy:needs-decision`** (legacy — smeden poster ingen nye etter #1413)
  — smeden har postet ett binært spørsmål (kommentar med header «🅰️🅱️
  Eierbeslutning trengs»). Linje: «Svar A/B på #N — <spørsmålet i én
  setning>». Hent setningen fra smedens kommentar, ikke issue-tittelen.
- **`autonomy:needs-contract-session`** — smeden har postet kontrakt-forarbeid
  (header «🛠 Kontrakt-forarbeid (gråsone)»). Linje: «🛠 #N trenger
  kontrakt-økt — kjør `/forge:contract` på #N» (kopier-lim-klar kommando).

Ferskhets-sjekken over gjelder begge: eier-svar postet, issue lukket eller
`parked` satt → utelat linja. Labelen alene er ikke bevis på at punktet
fortsatt er åpent.

## Heartbeat-vakta

- **Forventning:** Nattkjøreren skal ha postet heartbeat på #1110 siden forrige
  brief (den poster ALLTID, også «ingen kø»). Dok-avstemmeren: kun i uker der
  den var due. Utroperen (docs/loops/utroperen.md): skal ha postet på
  lanserings-tavla #1208 hver torsdag (forslag eller tom-uke-melding) —
  sjekkes i fredagens brief; samme mangler-én/mangler-to-eskalering som under.
- **Mangler én kjøring:** varsellinje øverst i briefen («⚠️ Nattkjøreren la
  ikke heartbeat i natt — sjekk claude.ai/code/routines»).
- **Mangler to på rad:** i tillegg opprett infra-issue («Loop X har ikke kjørt
  på 2 forventede kjøringer», label bug, milestone 13) — dedupet mot åpent
  issue med samme tittel.
- CI-vakta poster ikke heartbeat i v1 (24/døgn er støy) — dens helse måles
  indirekte: åpne `CI-vakt:`-issues eldre enn 24 t uten aktivitet flagges.
- **Prod-vakta (Actions-cron, ikke routine):** Loop-helse-linja skal oppgi
  siste kjøring og utfall (`gh run list --workflow prod-vakt.yml --limit 1`).
  Siste kjøring eldre enn 48 timer → varsellinje øverst («⚠️ Prod-vakta har
  ikke kjørt på X timer — sjekk Actions»). Stillhet fra en cron er aldri bevis
  på at den lever («grønn kan bety kjørte aldri»-klassen).

## Discord-speiling (utgående varsel + knapper)

GitHub varsler aldri eieren om aktivitet under hans egen identitet — Discord
ER derfor eierens varslings- og svarkanal. Speilingen skjer ETTER at
kommentaren på #1110 er postet (den er alltid primærartefakten), og feil i
Discord-postingen noteres i neste briefs Loop-helse — aldri la det stoppe
briefen.

**Med bot-identitet (`DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` i miljøet):**
post briefen via `POST /api/v10/channels/{DISCORD_CHANNEL_ID}/messages`
(`Authorization: Bot …`) med **knapper** (`components`, button style 1/2) på
handlingslinjene i «Trenger deg nå» — custom_id-kontrakten er
`app/api/discord/interactions/route.ts` sin (#1124):

- Godkjenn-linje for PR → knapp «✅ Merge PR #N» med `custom_id: merge_pr:<N>`
- A/B-beslutningslinje → fire knapper «A»/«B»/«🗑 Dropp»/«⏸ Ikke nå» med
  `custom_id: answer:<issue>:<A|B>`, `drop_issue:<issue>`, `snooze_issue:<issue>`
  (🗑 lukker som «not planned», ⏸ setter `parked` — begge poster
  beslutnings-kommentar på issuet)
- Kontrakt-økt-linje (`autonomy:needs-contract-session`) → to knapper
  «🗑 Dropp»/«⏸ Ikke nå» med `custom_id: drop_issue:<issue>`, `snooze_issue:<issue>`
  (selve kontrakt-økten krever tastatur — kommandoen står i linjeteksten)
- Natt-kø-kandidat med kontrakt → knapp «🌙 Klarer for natta» med `custom_id: ready_issue:<N>`
- Auto-køet ren-teknikk-sak (#1302) → knapp «⏸ Ikke nå» med `custom_id: snooze_issue:<N>`
  (stopper natt-bygget: ⏸ setter `parked` OG fjerner `autonomy:ready`)

(Utroperen sender i tillegg `publish_lansering:<kommentar-id>` fra sin egen
torsdags-melding — se docs/loops/utroperen.md; briefen sender aldri den knappen.)

Maks 5 knapper per rad (Discords grense); flere handlinger → flere rader/meldinger.
Innhold over 1800 tegn: del briefen gruppe-vis i flere meldinger (knappene festes
på meldingen med sine handlingslinjer) — ↳-detaljlinjene kuttes ikke (#1408).
Sprenger én enkelt gruppe grensa alene: forkort ↳-linjene i den gruppa og lenk
til #1110-kommentaren for resten.

**Kun webhook (`DISCORD_WEBHOOK_URL`):** fall tilbake til ren tekst-speiling
som før (vanlige webhooks kan ikke sende komponenter).

**Mangler begge variablene, ELLER feiler Discord-postingen** (token utløpt/rotert,
API nede): dette er IKKE en stille skip — Discord er eierens kontroll-kanal, og en
manglende speiling betyr at han mister knappene uten å vite hvorfor. Rapporter det
som en linje i **Loop-helse**: «⚠️ Discord-speiling feilet: \<grunn\> — sjekk
`DISCORD_BOT_TOKEN`/`DISCORD_CHANNEL_ID`». Brief-kommentaren på #1110 er uansett
postet (primærartefakten), så eieren kan lese den der.

## Månedlig arkivering

Første brief i ny måned: flytt forrige måneds kommentarer til
`docs/loops/logg/<år>-<måned>.md` via docs-PR. Arkiverte kommentarer kan ikke
redigeres bort fra #1110; lenk til arkivfila i briefen i stedet. Samme runde
arkiverer lanserings-tavla #1208 (Utroperens forslag + ✅-markører) til samme
fil.

Arkiv-PR-en er docs-only og har ikke noe produktvalg, så etter #1406 auto-merger
PR-kortet den selv når checkene er grønne (kvitteringsutfall — forventet og
riktig; ingen `main-verify`-dispatch siden diffen kun rører `docs/**`). Kortet
fyrer hendelsesdrevet via no-op-tvillingen (#1483) — ingen manuell dispatch
trengs (den gamle #1301-konvensjonen er fjernet). Den gamle
«ALDRI selvmerget»-regelen gjaldt eieren; nå lander arkiv-PR-en selv via kortet.
Briefen skal derfor IKKE vente på eier-merge av arkiv-PR-en — den lander på
egen hånd.
