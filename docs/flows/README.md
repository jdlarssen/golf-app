<!--
  Nedbrutte brukerflyt-diagrammer for Tørny. Hver fil finnes som .svg (skarp/zoom)
  og .png (rask visning). Oversikts-kartet ligger ett nivå opp: docs/user-flows.svg.
  ⚠-merker peker på GitHub-issues (#355–#363) fra UX-flyt-auditen.
-->

# Brukerflyt-diagrammer — de suksess-kritiske flytene

Disse fem flytene er det appen står og faller på. Hver er tegnet som et eget steg-for-steg-diagram (les ovenfra og ned). Oversikten over alt henger sammen i [`../user-flows.svg`](../user-flows.svg); den fulle tekst-referansen er [`../user-flows.md`](../user-flows.md).

| # | Flyt | Hvem | Hvorfor kritisk | Diagram |
|---|---|---|---|---|
| 1 | **Bli bruker** | Ny spiller | Første terskel — feiler den, kommer ingen i gang | [PNG](01-bli-bruker.png) · [SVG](01-bli-bruker.svg) |
| 2 | **Bli med i et spill** | Spiller | Avgjør om folk faktisk møter opp | [PNG](02-bli-med-i-spill.png) · [SVG](02-bli-med-i-spill.svg) |
| 3 | **Spille en runde** | Spiller | Hjertet i appen — tasting av slag må være knirkefritt | [PNG](03-spille-en-runde.png) · [SVG](03-spille-en-runde.svg) |
| 4 | **Opprett spill** | Arrangør | Motoren — uten spill finnes ingenting for spillerne | [PNG](04-opprett-spill.png) · [SVG](04-opprett-spill.svg) |
| 5 | **Kjør og avslutt spill** | Arrangør | Den siste milen — gir runden en delt avslutning | [PNG](05-kjor-og-avslutt-spill.png) · [SVG](05-kjor-og-avslutt-spill.svg) |

## Hvordan de henger sammen

```
Arrangør:  [4 Opprett] ───────────────► [5 Kjør & avslutt]
                 │ inviterer                    ▲ leverer/godkjenner
                 ▼                               │
Spiller:   [1 Bli bruker] ─► [2 Bli med] ─► [3 Spille en runde]
```

## Tegn-forklaring
- **Grønt** = spiller-handling · **Champagne** = arrangør-handling · **Mørkegrønn** = start/felles.
- **⚠ #NNN** = kjent forbedringspunkt, sporet som GitHub-issue (se [issues #355–#363](https://github.com/jdlarssen/golf-app/issues)).

## Oppdatere diagrammene
SVG-ene er kilden. Etter endring, regenerer PNG-ene:

```bash
cd docs/flows
for f in 01-bli-bruker 02-bli-med-i-spill 03-spille-en-runde 04-opprett-spill 05-kjor-og-avslutt-spill; do
  qlmanage -t -s 2000 -o . "$f.svg" && mv -f "$f.svg.png" "$f.png"
done
```
