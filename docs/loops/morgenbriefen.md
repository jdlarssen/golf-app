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

**Skjedde i natt/i går:**
- <merget PR / lukket issue / CI-vakt-fiks — kun verifiserte fakta, med lenke>

**Loop-helse:**
- Nattkjøreren: <heartbeat-status> · Dok-avstemmeren: <heartbeat-status hvis due> · CI-vakta: <antall CI-vakt-issues åpne; liveness sees på routines-siden>
```

Ingenting å melde i en gruppe → utelat gruppa. Alle tre tomme → tom-natt-linja.

## Heartbeat-vakta

- **Forventning:** Nattkjøreren skal ha postet heartbeat på #1110 siden forrige
  brief (den poster ALLTID, også «ingen kø»). Dok-avstemmeren: kun i uker der
  den var due.
- **Mangler én kjøring:** varsellinje øverst i briefen («⚠️ Nattkjøreren la
  ikke heartbeat i natt — sjekk claude.ai/code/routines»).
- **Mangler to på rad:** i tillegg opprett infra-issue («Loop X har ikke kjørt
  på 2 forventede kjøringer», label bug, milestone 13) — dedupet mot åpent
  issue med samme tittel.
- CI-vakta poster ikke heartbeat i v1 (24/døgn er støy) — dens helse måles
  indirekte: åpne `CI-vakt:`-issues eldre enn 24 t uten aktivitet flagges.

## Månedlig arkivering

Første brief i ny måned: flytt forrige måneds kommentarer til
`docs/loops/logg/<år>-<måned>.md` via docs-PR — som alle loop-leveranser en
draft-PR eieren merger, ALDRI selvmerget. Arkiverte kommentarer kan ikke
redigeres bort fra #1110; lenk til arkivfila i briefen i stedet.
