# Forge-runder — #1876 native konto-sletting (2026-09-02)

Kontrakten var alt merget (PR #1878) og lå i `.forge/contracts/` — ingen adopsjon nødvendig.
Byggere: fem Opus-subagenter i fire faser (fundament → datamodul → skjermer → docs).
Evaluator: fem Opus-skeptikere i fersk kontekst + adjudikator som verifiserte funnene selv.
Fiks-runde: gjort direkte i hovedchatten (fire små, godt forståtte endringer).

| Runde | Utfall | Funn | Aksjon |
|---|---|---|---|
| Drift-verifisering (før bygging) | 12 DRIFTED, 0 GONE | Kontrakten ble skrevet 18:58Z, N6c merget 22:14Z — altså skrevet mot en eldre app. **Viktigst:** (a) `anonymize_user` er 0131 UTVIDET I 0142 (green_pins-nulling), ikke bare 0131; (b) en fersk bruker uten `game_players` tar HARD sletting, så kontraktens SC3-assertions gjaldt bare den ene grenen; (c) `deleteDatabaseAsync` finnes i SDK-en, men IKKE i jest-mocken — en wipe bygget på den kunne ikke testes; (d) `stopp sync-worker/realtime` finnes ikke som primitiv i det hele tatt; (e) blokk-kodene og copy-nøklene deler ikke navn (`active_engagements` → `blockedBanner`, ikke `errors.active_games`); (f) supabase-mocken hadde ingen `auth`-flate; (g) null `fetch`-kall fantes i `native/app/src` — slicen er appens første; (h) PR #1898 var åpen og slettet `COLORS`/`ui` fra theme.ts. | Beslutningene låst i eget dokument før første kodelinje. Wipen bygget som `DELETE FROM` × 4. Alle nye skjermer skrevet mot `useTheme` alene. `anonymize_user` verifisert live: identisk kropp i staging og prod (md5 `4abdb3ddda29…`). |
| Bygging | Grønt | Tre av fem byggere null-testet sine egne porter uten å bli bedt om det: wipen med to mutasjonsprober (glemt tabell, ny tabell), copy-porten med en endret bokstav og en ny unions-kode, rekkefølge-porten ved å bytte om wipe og signOut. | — |
| Staging, runde 1 (server) | 12/12 | Fem uautentiserte varianter → 401, inkl. `userId` i body. Blokkert → GET 200 `active_engagements` / POST 403. Historikk → `anonymized`. Ingen historikk → `hard`. Retry etter suksess → **401**, ikke 500. | Bekreftet hvorfor appen aldri skal wipe på 401: koden er tvetydig mellom «token utløpt» og «alt slettet», og bare den ene har lokale data å miste. |
| Staging, runde 2 (app) | 10/10 | Full flyt på simulator mot lokal web i prod-server-modus. Enheten: fire fylte tabeller → alle tomme, `user_version` fortsatt 2, AsyncStorage tømt. | — |
| Evaluering | **ACCEPT_WITH_FINDINGS** | Ingen blockers, ingen majors. **1:** `wipeLocalData` sto uten try/catch etter 200 mens `signOut` rett under hadde en — et sqlite-kast meldte «slettingen feilet» på en konto som var borte, og lot brukeren stå innlogget. **2:** «fikk ikke spurt» ble slått sammen med «serveren sa nei», så en nettfeil blanket hele siden og så ut som et avslag. **3:** offline-teksten var lånt fra sync-køen og lovte «koble til, så går det gjennom» — sletting legges aldri i kø. **4:** en 200 uten `blocked`-felt feilet ÅPENT (viste den røde knappen) mens en ukjent streng feilet lukket. **5 (prosess):** ingenting i diffen ville stoppet Discord-kortet fra å auto-merge en destruktiv auth-flyt forbi eieren. | Alle fire kodefunn fikset i `d60d025f`, guarden null-testet. PR-en fikk `## Alternativer (produktvalg)`-seksjon — maskin-markøren kortet leser. |
| Staging, runde 3 (etter fiks) | 9/9 | Fiksene endret bruker-synlig oppførsel, så hele runden ble kjørt om på ny kode: nytt Release-bygg, ny server, nye engangsbrukere. Den nye «uten server»-grenen skjermbilde-bevist. | Seks skjermbilder levert til eieren. |
| Rebase på main | Null konflikter | #1898 landet underveis og slettet `COLORS`/`ui`. | Begge nye skjermer importerte kun `useTheme` og `FONTS`; Konto-lenka kopierte nabolenkas idiom. Rebasen gikk rent. |

## Der adjudikatoren overprøvde evaluatorene

Tre av fem hevdet at kriterium 7 var PARTIAL fordi ingen `VERIFICATION GAP` var
notert for den manglende tapptesten. Feil — `tapptest-recipe.md` åpner med nøyaktig
den linja. De hadde greppet i notat- og bevisfilene, ikke i hele scratchpaden.

To hevdet at «enhver 200 utløser wipen» var en reell risiko via en metode-degraderende
redirect. Adjudikatoren curl-et de faktiske domenene: alle svarer 308, som bevarer
metoden. Nedgradert til nit.

## Bevisste avvik fra kontrakten

- `backLabel` er «Tilbake», ikke webbens «Tilbake til profil» — appen har ingen
  profil-skjerm å love. Eneste bevisste brudd på copy-pariteten.
- Kontrakten sa «gjenbruk `OFFLINE_NOTE`». Det ble reversert etter evaluator-funn 3:
  den setningen lover en kø som ikke finnes for sletting.
- Kontraktens SC3 beskrev bare anonymiseringsstien. Begge grener er bevist hver for seg.

## Funn som ble egne issues

- #1899 — `anonymize_user` sletter `push_subscriptions`, men ikke `apns_tokens` (0166
  kom etter 0142). Kun anonymiseringsstien rammes; push er parkert til N7.
- #1903 — blokk-sjekken feiler åpent, og DB-ens admin-sperre dekker bare
  anonymiseringsstien. En admin uten spillhistorikk kan i teorien hardslettes.
- #1904 — copy-paritetstesten har håndskrevet nøkkel-liste; nye web-nøkler glipper.
- Kommentar på #1877: slicen etterlater **to** utloggingsknapper, ikke én.

## Restanser

- **Eier-tapptest på fysisk iPhone** — VERIFICATION GAP. Telefonen sto `unavailable`
  i `devicectl` hele økta. Oppskrift ligger i `tapptest-recipe.md`.
- **Innloggingen ble aldri tappet gjennom** for testbrukerne: GoTrue nekter å SENDE kode
  til `@torny-e2e.invalid`, så sesjonen ble lagt rett i AsyncStorage. Innloggingen er
  urørt av denne slicen og dekkes av e2e fra før — men SC4-frasen «ny innlogging som
  annen bruker starter rent» er dermed ikke demonstrert.
- **Ingenting stopper et butikk-bygg uten `EXPO_PUBLIC_WEB_BASE_URL`.** Bokført i
  runbookens «Bokførte gap».
