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
- **Tom natt gir én linje** («ingen aktivitet — heartbeats OK»), aldri
  ingenting. Stillhet fra briefen selv skal bety at briefen feilet; da er
  claude.ai/code/routines-siden eierens fallback.
- Read-only mot alt unntatt: brief-kommentaren på #1110 og eventuelle
  infra-issues fra heartbeat-vakta.

## Innhold (postes som kommentar på #1110)

```
☀️ Morgenbrief <dato>

**Trenger deg nå:**
- Godkjenn PR #M — <issue-tittel>; evaluate ACCEPT, gates grønne[, e2e grønn / needs-manual-qa: <flyt>] → <lenke>
- Svar A/B på #N — <én setning om spørsmålet> → <lenke>
- 🛠 #N trenger kontrakt-økt — kjør `/forge:contract` på #N → <lenke>

**Klar for natt-kø (ett tapp = køet):**
- #N — <issue-tittel>; forge-kontrakt klar, ikke merket enda → <lenke>

**Skjedde i natt/i går:**
- <merget PR / lukket issue / CI-vakt-fiks — kun verifiserte fakta, med lenke>

**Loop-helse:**
- Nattkjøreren: <heartbeat-status> · Dok-avstemmeren: <heartbeat-status hvis due> · CI-vakta: <antall CI-vakt-issues åpne; liveness sees på routines-siden>
```

Ingenting å melde i en gruppe → utelat gruppa. Alle fire tomme → tom-natt-linja.

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
Auto-skrevet …», jf. docs/loops/kontrakt-smeden.md), merk kandidaten med 🤖 og
teksten «les kontrakten før du køer» — eieren skal scrutinere en maskin-skrevet
kontrakt før ett-tapp-godkjenning, ikke tappe på autopilot.

## Gråsone-punkter (smedens ruting, #1151)

Smeden ruter gråsoner til eieren med to labels; briefen løfter begge under
«Trenger deg nå»:

- **`autonomy:needs-decision`** — smeden har postet ett binært spørsmål
  (kommentar med header «🅰️🅱️ Eierbeslutning trengs»). Linje: «Svar A/B på
  #N — <spørsmålet i én setning>». Hent setningen fra smedens kommentar, ikke
  issue-tittelen.
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

(Utroperen sender i tillegg `publish_lansering:<kommentar-id>` fra sin egen
torsdags-melding — se docs/loops/utroperen.md; briefen sender aldri den knappen.)

Maks 5 knapper per rad (Discords grense); flere handlinger → flere rader/meldinger.
Innhold over 1800 tegn: forkort og lenk til #1110-kommentaren.

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
`docs/loops/logg/<år>-<måned>.md` via docs-PR — som alle loop-leveranser en
draft-PR eieren merger, ALDRI selvmerget. Arkiverte kommentarer kan ikke
redigeres bort fra #1110; lenk til arkivfila i briefen i stedet. Samme runde
arkiverer lanserings-tavla #1208 (Utroperens forslag + ✅-markører) til samme
fil.
