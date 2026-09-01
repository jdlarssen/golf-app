# Forge-kontrakt: Kaptein-uttak — hemmelig uttak per økt med avdekking — #1884

**Branch:** `claude/kaptein-uttak-1884`
**Issue:** [#1884](https://github.com/jdlarssen/golf-app/issues/1884)
**Type:** enhancement · area: admin (cup) + auth · størrelse: large
**Spec:** `docs/superpowers/specs/2026-09-01-ryder-cup-kaptein-uttak-design.md` (etappe 2)
**Forgjenger:** etappe 1 (#1883, PR #1890) er MERGET — kontrakten er skrevet mot main per 2026-09-02.

```json
{ "kontraktKlasse": "bruker-synlig", "funksjonell": "Kapteiner kan levere hemmelige laguttak per økt, og cupen avdekker kampene når begge uttak er inne.", "produktvalg": false }
```

## Problem

Etappe 1 lot Ryder Cup-oppsettet få plass (36/40-tak, matchantall per økt). Men «+ kapteiner» fra bruker-innsendelsen mangler: i dag setter arrangøren alle oppstillinger alene i Generer-rommet. Ekte cup-følelse er at hver kaptein gjør sitt eget laguttak — hemmelig til begge har levert, med et avdekkings-øyeblikk når kampene dannes. Ingen kapteinsrolle finnes i datamodellen (`tournament_participants` er bare `tournament_id`+`user_id`+`created_at`; lag deriveres fra matchene).

Ingen ny bibliotek-flate — Supabase-/Next-mønstrene er husets egne, verifisert mot main i denne økta.

## Designbeslutninger (avklart med eier 2026-09-01)

- **Full uttaksflyt, ikke bare byttemakt** — eieren valgte b eksplisitt, to ganger.
- **Valgfri per cup:** arrangøren utnevner én kaptein per lag i Spillere-rommet. Uten kapteiner er alt som i dag (Generer-rommet urørt for slike cuper).
- **Per økt-rytme:** uttak leveres økt for økt; kapteiner kan reagere på stillingen.
- **Ordnet-liste-paring:** kapteinen leverer par/enkeltspillere i rekkefølge; slot 1 møter slot 1. Ingen egen paringslogikk — rekkefølgen ER uttaket.
- **Hemmelighold server-side:** motstanderen ser ingenting før begge uttak for økta er levert. Personlige cup-sider er world-read (`canViewCupPage` → `!groupId` = alltid), så hemmeligholdet MÅ håndheves i uttaks-datalesingen — sidegaten beskytter ingenting.
- **Avdekking = seremoni:** når begge uttak er inne dannes matchene, cupsiden viser «Kampene er klare»-øyeblikket (cup-presentasjonsfilosofien: ett kort, ceremony-tone), og deltakerne varsles i appen (best-effort).
- **Arrangør-nødluke:** arrangøren ser alltid alt (også kladd), kan levere på vegne av en kaptein, låse opp et levert uttak før avdekking, og endre etter avdekking via eksisterende `SwapMatchPlayer`.
- **Konsekvens av etappe 1-avviket:** øktantall i veiviseren lagres ikke — kaptein-flyten kan derfor IKKE låne det. Øktstrukturen (format + antall plasser) persisteres som del av uttaksrunden når arrangøren åpner den; default-antall deriveres fra varige lagstørrelser via `buildSessionCountRows` og kan justeres ned (samme klamperegel som etappe 1).

## Datamodell & authz (semantikk fast, kolonneform er byggerens)

- **`tournament_participants` utvides:** lagnummer (1/2, nullable = utildelt) + kapteinsflagg/rolle. Migrasjon nummereres fra nyeste i `supabase/migrations/` (0168 per 2026-09-02 — renummerer ved kollisjon). Husk default på evt. NOT NULL (gen:types-fella).
- **Ny uttakslagring:** per cup: åpnede økter (rekkefølge, `CupSessionFormat`, antall plasser, status) + per økt×lag: ordnede slots, levert-status, levert-av. Én eller to tabeller — byggerens valg.
- **RLS deny-by-default på ny(e) tabell(er):** ingen `authenticated`/`anon`-tilgang; alle lese-/skriveveier går via gatede server-actions/-components med admin-klient (#1542-mønsteret). Fiendtlig direkte PATCH/SELECT skal feile (AGENTS.md-felle 3).
- **Ny gate:** «arrangør ELLER kaptein for lag N i denne cupen» — bygges ved siden av `requireAdminOrClubAdminOfCup` (`lib/admin/auth.ts`), Type A-testet. Kaptein-skriv gjelder KUN eget lags uttak i ikke-avdekkede økter.
- **Deltaker-synken:** `participantRosterSync`s fjerningsregel («ute av alle matcher → av lista») ville kastet ut benkede spillere og ikke-spillende kapteiner i kaptein-cuper. Regelen unntar rader med varig lagtildeling/rolle — de eies av arrangøren, ikke av match-derivasjonen.
- **Avdekkingen gjenbruker `createCupMatchesFromPlan`s innsettingskjerne** (generer/actions.ts): slots → `{format, label, side1, side2, segment: 'full'}`. Mode-config/allowance som generatoren; plan-`strategy` (handicap/random) er irrelevant — kapteinene HAR paret.

## Kant-tilfeller

| Situasjon | Forventet |
|---|---|
| Én kaptein levert, én ikke | Ingen avdekking; levert lag ser eget uttak; motstander ser kun «levert»-status, aldri innhold |
| Kaptein leser motstanderens kladd (direkte kall/URL) | Avvist server-side (gate + RLS) |
| Samme spiller i to slots i én økt / spiller fra feil lag / utenfor stallen | Valideringsfeil (Type A-testet, norsk feilkode-kontrakt som `CupPlanError`-mønsteret) |
| Færre fylte slots enn øktas antall | Kan ikke leveres |
| Andre foursomes-økt avdekkes | Match-labels fortsetter nummereringen fra cupens eksisterende matcher per format (Foursomes 9, 10, …) |
| Kaptein byttes/trekker seg | Arrangør omutnevner i Spillere-rommet; kladd består |
| Ikke-spillende kaptein | Står på lista med rolle; aldri i uttak; synken fjerner hen ikke |
| Deltaker uten lag når uttak åpnes | Vises som utildelt i Spillere-rommet; er ikke i noen kapteins stall før arrangøren plasserer hen |
| Cup uten kapteiner | Generer-rommet og hele dagens flyt uendret |
| Avdekket økt, spiller syk | Arrangør bruker eksisterende `SwapMatchPlayer` |
| Splittet-cup-dag-preset | Ingen kaptein-flyt (utenfor scope, som etappe 1) |

## Claude's Discretion

- Kolonne-/tabellform for uttakslagringen; eksakt plassering av uttaks-flaten (eget rom under `/admin/cup/[id]/` + kaptein-tilgjengelig inngang fra cupsiden — «one door per room»-prinsippet).
- Avdekkings-kortets utforming innen cup-presentasjonsfilosofien; ny `NotificationKind` (zod-payload i `lib/notifications/types.ts`, fan-out via `loadTournamentParticipantEmails`-settet, in-app only, best-effort).
- Om Spillere-rommets lagtildeling gjenbruker pill-toggle-mønsteret fra veiviserens Step1Roster.
- Testfixturer utledes fra konstanter/typer (lærdom fra #1890-revisjonen); norsk copy følger husmønstrene og `humanizer`-skillet kjøres før commit.

## Suksesskriterier

- [ ] **SK1 — Utnevnelse:** Arrangøren kan i Spillere-rommet sette lag (1/2/utildelt) og markere maks én kaptein per lag; lagres varig på deltakerlista. Verifiseres i staging-klikkrunden + Type A på valideringen.
- [ ] **SK2 — Åpne uttak:** Arrangøren åpner en økt (format + antall plasser, default derivert via `buildSessionCountRows` av varige lagstørrelser, justerbart ned). Persistert — synlig etter reload.
- [ ] **SK3 — Kaptein leverer:** Kapteinen fyller ordnede slots fra eget lags stall og leverer; validering per kant-tabellen; levert = låst for kapteinen. Type A-testet.
- [ ] **SK4 — Hemmelighold:** Før begge uttak er levert returnerer ingen server-flate motstanderens slots til en kaptein/deltaker — bevist med test (gate-avvisning) OG hostile-read mot ny tabell med `authenticated`-JWT (0 rader).
- [ ] **SK5 — Avdekking:** Begge levert → matcher opprettes (slot i mot slot i, riktig mode-config, fortsettende labels), økta merkes avdekket, cupsiden viser avdekkings-kortet, `notify`-fan-out sendt (best-effort, VERIFICATION GAP OK på mail-løse).
- [ ] **SK6 — Nødluke:** Arrangøren kan se begge kladder, levere på vegne av kaptein, og låse opp levert uttak før avdekking. Kaptein kan IKKE noe av dette for motstanderlaget (gate-test).
- [ ] **SK7 — Uendret uten kapteiner:** Cup uten kapteiner: Generer-rommet, synken og alle eksisterende cup-tester grønne uten endring i oppførsel.
- [ ] **SK8 — Migrasjon:** Påført staging via Supabase MCP og verifisert (kolonner + RLS-posture) FØR koden merges. Prod KUN etter merge + eksplisitt eier-godkjenning (prod-brannmuren #1074).
- [ ] **SK9 — i18n + notat:** Alle nye strenger i begge kataloger (paritet grønn); `.changes/1884-kaptein-uttak.md` gyldig i `--dry-run`.
- [ ] **SK10 — Staging-bevis:** Full klikkrunde på torny-staging: utnevn kapteiner → åpne foursomes-uttak → kaptein A leverer → verifiser at kaptein B ikke ser noe → B leverer → avdekking viser kampene + varsel i innboksen. Bevis + `staging-verified`-label.

## Gates (per chunk)

- `npx tsc --noEmit` · `npx eslint <endrede filer>` · `npx vitest run lib/cup lib/notifications "app/[locale]/admin/cup" messages` · `npm run build` — alle grønne
- `node scripts/weekly-release.mjs --dry-run` — 1884-notatet gyldig

## Byggerekkefølge (forslag, 3 chunks)

1. **Datalag:** migrasjon (staging) + lag/rolle i Spillere-rommet + synk-unntak + gate-helper. Type A + hostile-read.
2. **Uttakskjernen:** uttakslagring, åpne/lever/lås opp/lever-på-vegne-actions, valideringer, hemmelighold-lesing. Type A-tungt.
3. **Flater + avdekking:** uttaks-UI, avdekkings-kort, match-opprettelse, varsel, copy, én Type C-interaksjonstest per ny flate (maks), staging-runde.

## PR-regler for denne kontrakten

- **ALDRI auto-merge.** Authz-utvidelse + DB-migrasjon = to aldri-auto-kategorier. Draft-først (#1516); PR-en blir stående til eieren merger selv. Ingen produktvalg-heading (valgene er tatt), men Fordeler/ulemper-blokk som alltid.
- Migrasjonsrekkefølge: staging → verifiser → merge → prod etter eier-luke (`touch .claude/approve-prod` er eierens handling). Format-seed-/migrasjonslærdommen: prod påføres ETTER deploy av koden som tåler den.
- `Closes #1884` i body; closing-kommentar med `## Teknisk` + `## Funksjonell` etter merge.

## Ikke i scope

- Kaptein-flyt for splittet cup-dag; uttaksfrister/nedtelling (vekkes av ekte bruk).
- Mail-varsel ved avdekking (in-app only nå); emoji-/reaksjons-integrasjon (#977-parkeringen).
- Prefill av Generer-veiviserens lagdeling fra varige lag i ikke-kaptein-cuper (idé, eget issue ved behov).
- Endringer i tak (etappe 1 står), klubb-cup-regler eller native-appen (#1816-sporet).
