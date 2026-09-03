# Tapp-innlogging som testbruker i Tørny Dev — design

**Dato:** 2026-09-02 · **Issue:** #1923 · **Kontrakt (bygge-spec):**
[kontrakt-kommentaren på #1923](https://github.com/jdlarssen/golf-app/issues/1923)

## Bakgrunn

Eieren tester native-appen («Tørny Dev») på iPhone flere ganger om dagen. Innloggingen er
kode på e-post, og den stopper opp i testing: staging sender bare noen få koder i timen, og
nødløsningen (en økt legger sesjonen inn på telefonen over kabel) krever at noen sitter ved
Mac-en. Eierens ønske 2026-09-02: «trykk på kontoen jeg skal logge inn på, og så er jeg
logget inn» — pluss faste testbrukere som økter bruker når de rigger testspill.

## Eierbeslutninger (2026-09-02)

- **Rollebesetning A:** én arrangør + tre spillere + én admin. Fem knapper.
- **Lista bor i staging**, ikke i app-koden: en ny testbruker skal dukke opp i appen uten at
  appen må bygges på nytt til telefonen.
- Designet under er godkjent i fire biter («ja»).

## Slik blir det

**Det du ser.** Innloggingsskjermen får en boks «Testbrukere (staging)» øverst, med fem
store trykkflater og rolle ved navnet (Admin, Arrangør, Spiller). Ett trykk, og du er inne.
E-post- og kodeskjemaet ligger under som før. Bytte bruker = «Logg ut» og trykk på et annet
navn. Feiler innloggingen, får du en kort norsk feilmelding på samme sted som i dag.

**Det bak.** Lista er en liten fil i stagings fillager, som appen henter når skjermen åpnes.
Trykket logger inn med et felles testpassord som bare finnes i utviklingsbygget på din
telefon og i staging. Boksen vises kun når appen peker på staging OG passordet er lagt inn i
bygget; et produksjonsbygg har hverken passordet, riktig adresse eller fila. Før innloggingen
tømmer appen de lokale tallene på telefonen, så forrige testbrukers scorer aldri blander seg
inn hos neste.

**Rutinen for økter.** Et skript vedlikeholder rollebesetningen og kan legge til en ny
testbruker i én kommando. Det nekter å kjøre mot noe annet enn staging. Prosjektreglene får
et punkt om at økter rigger testspill til eieren med rollebesetningen, og legger til en egen
bruker i lista før de ber om en tapptest.

**Testing og levering.** To små automatiske tester (gaten + at lista tegnes) og en
eier-tapptest på telefonen før PR-en merges. PR-en rører innlogging og auto-merges derfor
ikke; eieren merger selv. Bygges i en egen Opus-økt på eierens Mac.

## Én endring fra det som ble godkjent: to navn

Rollebesetningen ble foreslått som Test Admin, Kari Arrangør, Ola Kompis, Test Spiller og
Testspiller Tapp. Test Admin og Test Spiller er de automatiske testenes kontoer, og
adressene deres er eierens Gmail med en plusstagg. Fila med lista er lesbar for alle som
kjenner staging-adressen (den står i offentlige dokumenter), så de to adressene ville
avslørt eierens private e-post. Derfor får admin- og spiller-plassen to nye, oppdiktede
kontoer:

| Rolle | Navn |
|---|---|
| Admin | **Anne Admin** (ny) |
| Arrangør | Kari Arrangør |
| Spiller | Ola Kompis |
| Spiller | **Per Putter** (ny) |
| Spiller | Testspiller Tapp |

De automatiske testenes kontoer røres ikke. Vil eieren ha andre navn, er det en
enlinjes endring i skriptet — si fra på issue #1923.

## Sikkerhet i korte trekk

- Passordet ligger i to gitignorerte filer på eierens Mac og hashet i staging. Aldri i
  repoet, aldri i produksjon.
- Kontoene i lista er oppdiktede (`@example.test`) uten ekte data.
- Tre uavhengige sperrer mot produksjon: passordet mangler der, adressen er feil, og fila
  finnes ikke.

## Ikke med

- Samme trykk-innlogging på nettsiden (kan komme senere, egen sak).
- «Logg ut» som tømmer lokale tall generelt (#1877, egen sak).
- Nattkjøreren kan ikke legge til testbrukere (mangler passordet). Mulig oppfølger.
