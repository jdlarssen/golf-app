# Visjon og planleggingsløk for Tørny

Eies av Jørgen. Godkjent 2026-09-15, revidert 2026-09-16 (strategisamtale). Endres kun via PR han har sett.

## Visjon (ses på én gang i året)

Tørny lar hvem som helst arrangere en golfturnering på et par minutter, fra fire kompiser til en hel klubb, uten å kunne annet enn golf. Alt som ikke gjør det enklere å arrangere, spille og se resultatet, bygger vi ikke.

Ferdiggrensen som følger av visjonen står i [`hva-er-nok.md`](hva-er-nok.md). Kjerneflytene står i [`user-flows.md`](user-flows.md).

## Lagene (etter «The Planning Onion»)

Alt vi gjør skal kunne spores nedenfra og opp: et issue hører til en måned, måneden til et kvartalsmål, kvartalsmålet til visjonen.

| Lag | Hos Tørny | Hvor det bor | Ses på |
|---|---|---|---|
| Visjon | avsnittet over | denne fila og tavlas beskrivelse | årlig |
| Kvartalsmål | én milepæl per kvartal, med forfallsdato og «ferdig når»-setning | GitHub-milepæler | kvartalsvis |
| Månedsmål | én setning per måned, med issuene som utgjør den | [`roadmap.md`](roadmap.md) og feltet «Måned» på tavla | månedlig |
| Uka | mandagens ukesslipp, retro, «kjør gjennom» i orkestratoren | orkestratoren | ukentlig |
| Issues | kontrakt, arbeider, PR | GitHub Issues og tavla | daglig |

## Regler harnesset håndhever

1. Et issue startes ikke uten milepæl med forfallsdato. «Backlog — uplanlagt» er uforpliktet og har ingen dato; issues der må flyttes til et mål før de bygges.
2. Måldato på et issue fylles fra milepælens dato når feltet er tomt. Eieren kan overstyre.
3. Retroen rapporterer mål uten dato, mål som har passert datoen, issues uten mål, og livstegnet (se under).

## Kvartalsmål

| Kvartal | Milepæl | Ferdig når |
|---|---|---|
| Q3 2026 (31.10) | Selvkjørende loops | fire mandager på rad har ukeplan, retro, arkiv og versjon gått uten at Jørgen trykket på noe, og orkestratoren har tatt issues fra tavla på egen hånd med fast kapasitet i hver av de fire ukene |
| Q4 2026 (31.12) | Runde 3 — sesongslutt | prøvespill og penger i potten er levert, og Kavalkaden er sluppet før nyttår og delt av minst tre spillere som ikke er Jørgen |
| Q1 2027 (31.03) | Native app (iOS + Android) | Tørny ligger i App Store og Google Play som ekte native app, og minst fire navngitte venner har installert den fra butikken og spilt én runde i appen |
| Q2 2027 (30.06) | Liv laga — sesongstart 2027 | ti fullførte spill helt uten Jørgen (han verken arrangerte eller spilte), fra minst tre ulike arrangører |

Selvkjørende loops går én måned inn i Q4; datoen i tabellen er milepælens. Spriker tabellen og GitHub, er milepælene fasit.

Månedsmålene står i [`roadmap.md`](roadmap.md).

## Livstegn (retroen rapporterer det hver måned)

Ett tall sier om Tørny er liv laga: **fullførte spill helt uten Jørgen**, altså spill der han verken
arrangerte eller spilte. Det kan ikke pyntes på ved at Jørgen arrangerer mer eller ber noen trykke
«opprett». «Arrangert av andre enn Jørgen» er et støttetall, ikke livstegnet.

Målestokk 2026-09-16 (prod): 31 fullførte spill siden mai 2026, **0 helt uten Jørgen**. Det ene spillet
en annen opprettet (juni) var på Jørgens oppfordring.

Tallet skal stå i Sekretariatets nøkkeltall (oktober-målet i roadmapen) og rapporteres av retroen ved
siden av månedsmålet. Sesongen i Norge er stille oktober–mars; reisegolf kan flytte tallet i vinter,
ellers er det en vårtest. Q2-målet «Liv laga» er det første målet som måles på dette tallet.
