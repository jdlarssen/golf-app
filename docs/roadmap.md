# Roadmap — månedsmål for Tørny

Eies av Jørgen. Godkjent 2026-09-15, revidert 2026-09-16, to ganger 2026-10-25, 2026-11-11 og 2026-11-12 (strategisamtaler). Visjonen og lagene står i [`visjon.md`](visjon.md). Målene her bestemmer hvilke issues som lages; issues lages ikke først og sorteres etterpå.

## Kapasitet per uke (håndheves av orkestratoren)

Inntil fem issues i gang per uke: **tre mot månedsmålet, to til drift, bugs og forvaltning.** Andelen står i `.claude/orchestrator.json` og er ikke opp til økta.

- **Drift:** løkkene, prod-vakta, flakete kjøringer, alt som må virke i morgen.
- **Bugs:** label `bug`, først de en spiller kan treffe.
- **Forvaltning:** avhengigheter, refaktor, testkvalitet, sikkerhet, dokumentasjon.

## Månedsmål

| Måned | Mål | Ferdig når | Milepæl |
|---|---|---|---|
| 2026-09 | Orkestratoren styrer arbeidet | 0.3.0 er inne, planleggingsløken er i harnesset, og første uke har gått med kapasitetsregelen | Selvkjørende loops |
| 2026-10 | Løkkene går av seg selv, og null kjente spillerbugs | løkke-issuene er lukket, arkivkjøringen 1. oktober er verifisert, bugene i backloggen er borte, Kavalkade-kontrakten er skrevet (#1040), og livstegnet står i Sekretariatets nøkkeltall | Selvkjørende loops (31.10) |
| 2026-11 | Vinterligaen i bruk, og gjengen er testerne | vennegjengen har spilt runde 1 av vinterligaen fra appen og runde 2 er åpnet, minst 12 testere er med i den lukkede Play-testen og TestFlight, det runde 1 viser at mangler er rettet, første bølge av arrangør-veiviseren er bygget (#2447, #2448, #2454, #2458, #2459, #2607), og Må-sakene for november er levert (#2748, #2750, #2751, #2757, #2758, #2759) og cup (#2752) er i gang | Native app |
| 2026-12 | Kavalkaden delt i romjula, testernes funn rettet, Må-lista ferdig, og appen sendt inn | Kavalkaden er delt av minst tre spillere som ikke er Jørgen, funnene fra testerne er rettet eller avvist, resten av Må-sakene er levert (#2749, #2752–#2754, #2756), og appen er sendt inn til begge butikkene: til gjennomgang hos Apple, og med søknad om produksjonstilgang hos Google. Bør-punktene som ble hentet fram, er levert eller i gang: åpen runde (#2837), turneringslista (#2838), klubbliga (#2839), lagpåmelding (#2840) og Face ID-lås (#2841) | Runde 3 — sesongslutt (31.12) |
| 2027-01 | Native: gjennomgang og rettinger | Apple og Google har svart på innsendingen, og et eventuelt avslag er rettet og sendt inn på nytt | Native app |
| 2027-02 | Native: buffer, og godkjent i begge butikkene | appen er godkjent i App Store og Google Play og venter på slipp 1. mars | Native app |
| 2027-03 | I butikkene, og visjonen ses på igjen | lansert, og `hva-er-nok.md` revidert for neste år | Native app (31.03) |
| 2027-04 | Sesongstart: første spill helt uten Jørgen | ett fullført spill der Jørgen verken arrangerte eller spilte (livstegnet i `visjon.md`) | Liv laga — sesongstart 2027 (30.06) |

**Endret 2026-10-25 (strategisamtale):** Kavalkaden (november) ble bygget i oktober (#1040, K1–K5 lukket), og skal ligge skjult til 24. desember. Native-paritet er derfor flyttet fra desember til november. Desember holder delingen av Kavalkaden og blir buffer før testerne i januar. Oktober fikk i tillegg #2352 (iPad, siste kjente spillerbug) og #2632 (AI-historien i appen, en del av pariteten).

**Endret igjen 2026-10-25 (strategisamtale nr. 2):** eieren arrangerte, spilte og avsluttet en ekte runde fra appen 24.10, så paritet er i praksis nådd før november. Testerne flyttes derfor fra januar til november. Samme kveld ble novembermålet vinterligaen i bruk: gjengen spiller ligaen fra appen og er samtidig testerne. Paritetssjekken (#1954) ble lukket 25.10. Googles krav om 12 testere i 14 dager blir da oppfylt i november og ikke i januar. Innsendingen flyttes til januar, og februar blir tid til gjennomgang og rettinger før butikkene i mars.

**Endret 2026-10-30 (strategisamtale):** runde 2 av vinterligaen er åpen 22.11–6.12, så novembermålet måler at runde 1 er spilt og runde 2 åpnet. Ligaen åpner 8.11, og fram til da står byggeplassene ledige. Eieren ba derfor om å dytte noe fram i køen. De 22 veiviser-issuene fra #2250 (arrangørflaten på nettsiden) har fått milepælen «Liv laga», fordi en enklere veiviser er det som lar andre arrangere uten Jørgen. Seks av dem er trukket fram til november. Resten venter på april, som ikke finnes som måned på tavla ennå. Funn fra ligarunde 1 går foran veiviseren.

**Endret 2026-10-31 (månedsstart for november):** køen sto tom og første bølge av veiviseren var levert, så eieren hentet #2463 («Nå» som tee-off) og #2457 (innstillingene på «Klar?» som korte rader) fram fra april til november. Funn fra generalprøven (#2712) og ligarunde 1 går fortsatt først.

**Endret 2026-11-01 (ny prioritering for lanseringen):** eieren erstattet MoSCoW-en fra 30.08 (#1816), og 12 Må-punkter manglet helt eller delvis i appen (#2748–#2759). Eieren beholdt innsendingen i januar, så sakene bygges i november og desember. November tar det testerne og ligaen merker nå (varsler på Android, innboksen, lenkene som åpner appen, flightvalg, ny bane, Patsome) og starter cup, som er størst. Desember tar resten. Funn fra ligarunde 1 går fortsatt først.

**Endret 2026-11-11 (strategisamtale):** alle Må-sakene for november ble levert, cup er ferdig, og fire av seks Må-saker for desember er også levert (#2749, #2752, #2754, #2756). Det som står mellom appen og butikkene nå, er gjennomgangen hos Apple og Google, ikke byggingen. Eieren flyttet derfor innsendingen fra januar til desember. Apple får appen i god tid før jul, og Google får søknaden om produksjonstilgang så snart 12 testere har vært med i 14 dager. Lanseringen står fast 1. mars, fordi begge butikkene lar en godkjent versjon vente til vi slipper den. Januar og februar blir buffer: tid til et eventuelt avslag, funn fra runde 2 og testerne, og oppdateringer som #2753. #2755 (hull for hull for Skins og Nassau) er tatt ut av desember, fordi eieren har flyttet den til februar, der den venter på redesignet. Datoene i butikkpakken (#2561) følger denne endringen.

**Endret 2026-11-12 (eierens bestilling):** køen sto tom og Må-lista var nesten levert, så eieren hentet Bør-lista fra #1816 fram fra «rett etter lanseringen». Påmelding til åpen runde (#2837) og turneringslista (#2838) startes i november, fordi de lar folk utenfor gjengen finne og bli med på runder, og det er det livstegnet måler. Klubbliga (#2839), lagpåmelding (#2840) og Face ID-lås (#2841) står i desember. Oppgjøret (#2452) er ikke med og står fortsatt fryst. Det som er merget før bumpen til bygg 14 (27.11), blir med i innsendingsbygget; resten kommer som oppdateringer, og bygg 14 venter ikke på noe av det.

## Slik brukes dette

1. **Månedsstart:** orkestratoren tar månedens mål, lager issuene som trengs (utredning og kontrakt), og setter «Måned» på dem på tavla. Backloggen triageres mot målene: hører et issue til en måned, får det måneden; ellers blir det «Forslag».
2. **Underveis:** et issue uten måned startes aldri. Kapasitetsregelen over gjelder hver uke.
3. **Månedsslutt:** retroen svarer på «ferdig når»-setningen med ja eller nei, og foreslår hva som flyttes.
4. **Kvartalsslutt:** milepælen lukkes når «ferdig når» er sann; ellers får den ny dato og en setning om hvorfor.
5. **Livstegnet:** retroen rapporterer «fullførte spill helt uten Jørgen» hver måned ved siden av målet (definisjon og målestokk i `visjon.md`).
