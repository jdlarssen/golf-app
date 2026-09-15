# Roadmap — månedsmål for Tørny

Eies av Jørgen. Godkjent 2026-09-15. Visjonen og lagene står i [`visjon.md`](visjon.md). Målene her bestemmer hvilke issues som lages; issues lages ikke først og sorteres etterpå.

## Kapasitet per uke (håndheves av orkestratoren)

Inntil fem issues i gang per uke: **tre mot månedsmålet, to til drift, bugs og forvaltning.** Andelen står i `.claude/orchestrator.json` og er ikke opp til økta.

- **Drift:** løkkene, prod-vakta, flakete kjøringer, alt som må virke i morgen.
- **Bugs:** label `bug`, først de en spiller kan treffe.
- **Forvaltning:** avhengigheter, refaktor, testkvalitet, sikkerhet, dokumentasjon.

## Månedsmål

| Måned | Mål | Ferdig når | Milepæl |
|---|---|---|---|
| 2026-09 | Orkestratoren styrer arbeidet | 0.3.0 er inne, planleggingsløken er i harnesset, og første uke har gått med kapasitetsregelen | Selvkjørende loops |
| 2026-10 | Løkkene går av seg selv, og null kjente spillerbugs | løkke-issuene er lukket, arkivkjøringen 1. oktober er verifisert, læringssløyfen lever, og bugene i backloggen er borte | Selvkjørende loops (31.10) |
| 2026-11 | Native: paritet | appen gjør det samme som nettsiden i kjerneflyten (#1954), og de gamle app-skall-issuene er lukket | Native app |
| 2026-12 | Kavalkaden, golfåret som delbar fortelling | sluppet før nyttår, klar til deling i romjula (#1040) | Runde 3 — sesongslutt (31.12) |
| 2027-01 | Native: vennegjengen tester | TestFlight og lukket Play-test i gang | Native app |
| 2027-02 | Native: butikkinnsending | begge butikkene har fått appen | Native app |
| 2027-03 | I butikkene, og visjonen ses på igjen | lansert, og `hva-er-nok.md` revidert for neste år | Native app (31.03) |

## Slik brukes dette

1. **Månedsstart:** orkestratoren tar månedens mål, lager issuene som trengs (utredning og kontrakt), og setter «Måned» på dem på tavla. Backloggen triageres mot målene: hører et issue til en måned, får det måneden; ellers blir det «Forslag».
2. **Underveis:** et issue uten måned startes aldri. Kapasitetsregelen over gjelder hver uke.
3. **Månedsslutt:** retroen svarer på «ferdig når»-setningen med ja eller nei, og foreslår hva som flyttes.
4. **Kvartalsslutt:** milepælen lukkes når «ferdig når» er sann; ellers får den ny dato og en setning om hvorfor.
