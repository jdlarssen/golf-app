# Native-migreringen: MoSCoW-prioritering (design)

**Dato:** 2026-08-30 · **Eier-godkjent:** ja (interaktiv økt, tap/yes) · **Hjem for lista:** epic #1816, seksjon «Prioritering (MoSCoW)» — denne fila er designnotatet bak beslutningen, epicen er sannhetskilden for løpende status.

## Problemet

Native-migreringen (epic #1816) hadde «full paritet med nettappen» som port for butikk-byttet. Nettappen har 22 spillformater, cup, liga, betaling og en bred arrangørflate — bygget billig i PWA-tempo, dyrt å gjenskape i React Native. Eieren ba om en MoSCoW-prioritering: hva tas først, hva tas sist, og hva tas aldri.

## Grunnlag: prod-bruksdata (read-only, 2026-08-30)

| Måling | Verdi |
|---|---|
| Spill totalt | 30 (3 ulike oppretttere) |
| Formater brukt | **8 av 22** — stableford (5), singles_matchplay (9), best_ball (5), greensome_matchplay (4), wolf (2), bingo_bango_bongo (2), modified_stableford (2), skins (1) |
| Formater aldri brukt | 14 — hele scramble-familien (texas/florida/ambrose/shamble), foursomes/fourball/chapman/gruesome/patsome matchplay, nassau, nines, acey_deucey, round_robin, solo_strokeplay |
| Cup | 1 (Ryder Cup 2026, 12 kamper, ferdigspilt 2026-08-08) |
| Liga | 0 |
| Spill med reell kontingent | 0 |
| Spill med sideturnering (LD/CTP) | 10 av 30 |

## Eiervalgene

1. **Lista måles mot butikk-byttet** (ikke bare byggerekkefølge). Must = før appen erstatter skallene; Should = app-oppdateringer rett etter; Could = ved pull; Won't = migreres ikke uten vekke-trigger. Dette **reviderer** full-paritet-porten fra epic-opprettelsen — byttet kan skje uker tidligere.
2. **Arrangørflatene:** hele spill-livssyklusen (opprett-veiviser → invitasjoner/påmelding → avslutt) er Must; bane-/spiller-/klubbadmin lever i nettleser en periode.
3. **Push:** etter byttet, som første app-oppdatering.

## Lista (autoritativ kopi i epic #1816)

- **Must:** leaderboards + de 8 brukte modiene (#1828, krympet), sideturneringer, spill-livssyklus for arrangør, konto-sletting i app (App Store-krav ved kontoopprettelse i app), paritetssjekk + byttet.
- **Should:** push, cup (før neste sesong), profil/historikk/statistikk, venne-/klubbadmin, deling, resten av arrangørflatene.
- **Could:** de 14 ubrukte formatene (én og én ved pull; app-veiviseren viser kun støttede), Face ID, widgets.
- **Won't:** liga, kontingent/premiebord, web-flatene som per design forblir web (`/spectate`, offentlige banesider, invitasjonslanding, self-reg).

## Konsekvenser

- **N4 (#1828) krympet** fra 22 til 8 formater — bokført som kommentar på issuet. Wolf/BBB-valg-UI er Must (spilte modi); scramble-infra utgår av Must med mindre greensome trenger den.
- **N5–N8 omdisponert** i epicen: cup → Should, liga → Won't, N6 delt i Must-livssyklus + Should-admin, N7 → etter byttet, N8-porten = Must-lista.
- Prinsippet er det samme som `docs/hva-er-nok.md`: bruk (pull) styrer investering, ikke katalog-bredde. Vekke-trigger for alt i Could/Won't: noen ber om det, eller eieren bestiller.

## GUI og design — hva «paritet» betyr visuelt

Eieren påpekte (samme økt) at appen ikke blir helt lik PWA-en, og det er riktig — med vilje. Målet er **merkevare-likhet, ikke pikselparitet**: appen skal umiskjennelig være Tørny (forest/champagne/linen-paletten, Fraunces til hierarki og tall, tabular-nums, 44px tap-flater), men følge native konvensjoner der de er bedre (navigasjon, transitions, native kontroller). N3 la fundamentet i `native/app/src/theme.ts` (samme palett, én delt stilfil), men to brand-bærere mangler og er lagt inn som Must-punkt i epicen:

1. **Fontene** — appen kjører systemfonter i dag; Fraunces + Inter lastes via expo-font/@expo-google-fonts.
2. **Mørk modus** — `theme.ts` har kun lys palett; web har mørke varianter. Token-splitt + `useColorScheme`.
3. **Primitiv-settet** — RN kan ikke gjenbruke `components/ui/` (Tailwind/DOM); `theme.ts`-stilene vokser til et lite delt sett etter behov. Regelen som gjør dette billig: skjermer bygges alltid mot tokens/primitivene, aldri hardkodede verdier — da kan utseendet strammes sentralt uten å røre skjermene.

## Vedlikehold av lista

Lista bor i epic #1816 og endres der (eier-godkjenning for flytting mellom kategorier — det er produktvalg). Bruksdataene bør sjekkes på nytt før byttet: har et nytt format fått bruk i web-appen siden 2026-08-30, flyttes det inn i Must.
