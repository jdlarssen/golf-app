# Visjon og planleggingsløk for Tørny

Eies av Jørgen. Godkjent 2026-09-15. Endres kun via PR han har sett.

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
3. Retroen rapporterer mål uten dato, mål som har passert datoen, og issues uten mål.

## Kvartalsmål

| Kvartal | Milepæl | Ferdig når |
|---|---|---|
| Q3 2026 (30.09) | Runde 3 — Neste | prøvespill, penger i potten og kavalkaden er sluppet til spillerne |
| Q4 2026 (31.12) | Selvkjørende loops | løkkene kjører uten at Jørgen må huske noe, og orkestratoren tar issues fra tavla på egen hånd |
| Q1 2027 (31.03) | Native app (iOS + Android) | Tørny ligger i App Store og Google Play som ekte native app, og vennegjengen bruker den |

Månedsmålene står i [`roadmap.md`](roadmap.md).
