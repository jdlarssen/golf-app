---
version: alpha
name: Tørny — Forest & Champagne
description: Mobil-først PWA for golfturneringer. Augusta-inspirert dyp skoggrønn på varm lin-papir, med champagnegull reservert for vinnere og highlights. Fraunces (serif) bærer hierarki og tall, Inter (sans) bærer UI. Mørk modus heter «klubbhus-natt»: varm skog-svart med messinglys, aldri kald grå eller ren svart.

# Verdiene under er GJENGITT fra app/globals.css, som er hjemmet deres.
# app/__tests__/design-md-tokens.test.ts feiler hvis de glir fra hverandre.
colors:
  bg: "#f8f6f0"
  surface: "#ffffff"
  surface-2: "#f0ede5"
  border: "#e5e0d3"
  text: "#1a2e1f"
  text-muted: "#4a3f30"
  primary: "#1b4332"
  primary-hover: "#2d5a40"
  primary-soft: "#e8efe8"
  surface-strong: "#1b4332"
  bg-tint: "#f0ede5"
  accent: "#c9a961"
  accent-deep: "#b89446"
  accent-text: "#7d6224"
  success: "#4a7c59"
  success-text: "#2f5a3c"
  warning: "#d89b3a"
  warning-text: "#7a5410"
  danger: "#b8463e"
  danger-deep: "#a04040"
  focus-ring: "#1b4332"
  player-a: "#2f6d83"
  player-b: "#c06542"
  admin-bg: "#f5f1e4"

colors-dark:
  bg: "#14201a"
  surface: "#1c2a22"
  surface-2: "#243429"
  border: "#2f3f34"
  text: "#ece5d2"
  text-muted: "#9a9180"
  primary: "#7eaa80"
  primary-hover: "#94bf96"
  primary-soft: "#1f2c24"
  surface-strong: "#1f3b2c"
  bg-tint: "#ece5d2"
  accent: "#d4b870"
  accent-deep: "#c9a961"
  accent-text: "#d4b870"
  success: "#7daa8a"
  success-text: "#7daa8a"
  warning: "#e5b26f"
  warning-text: "#e5b26f"
  danger: "#d67268"
  danger-deep: "#c46868"
  focus-ring: "#d4b870"
  player-a: "#6fa3bd"
  player-b: "#db8a66"
  admin-bg: "#1a2620"

typography:
  page-title:
    fontFamily: "Fraunces, serif"
    fontSize: 30px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: -0.025em
  section-title:
    fontFamily: "Fraunces, serif"
    fontSize: 24px
    fontWeight: 500
  score:
    fontFamily: "Fraunces, serif"
    fontWeight: 600
    fontFeature: "tnum, ss01"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: 16px
    fontWeight: 400
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 500
  kicker:
    fontFamily: "Inter, sans-serif"
    fontSize: 10px
    fontWeight: 600
    letterSpacing: 0.2em
    textTransform: uppercase

rounded:
  md: 6px
  lg: 8px
  xl: 12px
  2xl: 16px
  full: 9999px

spacing:
  base: 4px
  card-padding: 24px
  tap-target: 44px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
    minHeight: 44px
    padding: 10px 18px
  card:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.card-padding}"
  input:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.xl}"
    padding: 12px 14px
---

# Tørny — designsystemet

Denne fila er designsystemet skrevet for agenter og designverktøy (Google Stitch-formatet
fra «Awesome Design»-samlingen). Den oppsummerer, den bestemmer ikke. Hjemmene:

| Hva | Hjem |
|---|---|
| Tokenverdier (farger, fontvekter, skygger, animasjoner) | `app/globals.css` |
| Komponenter | `components/ui/` — bruk dem, ikke dupliser |
| Merkevare-copy, tagline, «Ballen på T-en» | `docs/style-and-brand.md` |
| Norsk bruker-copy | `docs/copy-style.md` |

Endrer du en farge, endrer du `app/globals.css` først og gjengivelsene her og i
`docs/style-and-brand.md` i samme commit. `app/__tests__/design-md-tokens.test.ts`
holder dem i takt, og kontrasttestene i `app/__tests__/` holder WCAG-kravene.

## Overblikk

Tørny skal føles som et klubbhus med medlemsbok, ikke som en SaaS-app. Tre grep bærer
det:

1. **Lin-papir som gulv.** `bg` er varm lin, aldri kald hvit-grå. Kort ligger i ren hvit
   `surface` med en varm beige hårlinje (`border`).
2. **Dyp skoggrønn som stemme.** `primary` bærer handlinger, overskrifter og merket.
   `surface-strong` er skoggrønn i begge moduser og brukes til flater som skal rope
   (ledertavle-kort, onboarding).
3. **Champagnegull er en medalje.** `accent` er reservert for vinnere, ledere og
   highlights: pallen, lederkortets hårlinje, medaljonger. Brukt overalt slutter den å
   bety noe.

Admin-flatene («Sekretariatet») er et eget rom: litt varmere lin (`admin-bg`),
messinglinjer (`BrassRibbon`) og klubbstempel (`ClubStamp`).

## Farger

- **Tekst mot dekor.** `accent`, `success` og `warning` er DEKOR (kanter, fyll, ikoner)
  og måler under 4,5:1 som tekst i dagslys. Meningsbærende tekst i de tonene bruker
  `accent-text`, `success-text` og `warning-text`, som holder 4,5:1 mot alle lyse
  flater. Appen brukes ute i sollys; dette er ikke pynt (#1374, #1388, #1686).
- **Score-toner** (`--score-under/par/over1/over2-fg` og `-bg` i `globals.css`) gir
  under par grønt, par nøytralt, +1 amber og +2 eller verre murstein. `StatusChip`
  gjenbruker dem til spillstatus.
- **Duell-farger** `player-a` (petrol) og `player-b` (terrakotta) brukes kun i én-mot-én.
  De ligger bevisst utenfor skog og gull.
- **Spillestil-chips:** skifer for Solo, terrakotta for Lag (`--chip-*`).
- **Klubbhus-natt** (mørk modus) følger OS-valget eller `data-theme`. Den er varm
  skog-svart, teksten er lin (`#ece5d2`), aldri ren hvit, og `primary` blir salvie.
- **Aldri nøytral grå.** Skjeletter, deaktiverte knapper og tomme tall er varme
  lin-toner (`--skel-*`, `--disabled-*`, `--score-unset-fg`).
- **Sollys på hullsiden i appen** (#2252) er det ene stedet med ren hvit (`#ffffff`)
  og ren svart (`#000000`): kanter på 3 px og ingen tonede flater, for en skjerm i
  direkte sol. Scorefargene og `primary` er lys-verdiene. Unntaket er godkjent i
  forslaget og gjelder bare der.
- **Gull kicker på startbilletten i appen** (#2255) er ett av unntakene fra «gull er en
  medalje»: spillnavnet over banenavnet står i `accent` på det skoggrønne hodet, som
  eieren valgte fra designlerretet 29.09.2026. Mot `surface-strong` holder gullet 4,9:1 i
  lys og 6,3:1 i klubbhus-natt, så det er lesbar tekst der. Unntaket gjelder bare den
  kickeren; på lyse flater er gull tekst fortsatt `accent-text`.
- **Duellfarger i formatkortenes prikkfigur** (#2260): petrol og terrakotta står også i
  figuren for et format der nøyaktig to sider møtes («2 mot 2», «1 mot 1»), som på
  artboardet «Forslag: formatkortene» eieren valgte. Lag ellers er skoggrønne (`primary`),
  og en spiller alene er `--lineup-solo`. Unntaket gjelder bare den figuren.
- **Gullpille rundt Skins-figuren** (#2260) er ett av unntakene fra «gull er en medalje»:
  potten i Skins tegnes som en `accent`-strek rundt hele gruppa, som på artboardet. Den er
  ren dekor (`aria-hidden`) og gjelder bare den figuren.

## Typografi

- **Tegnformene er som på tegningene** (eierens valg 2026-10-01, #2263: «Som
  tegningene, overalt»). `body` setter verken `font-feature-settings` eller
  `font-variation-settings`; nettleserens standard er designet.
- **Fraunces** (`font-serif`) bærer hierarki og tall, med automatisk optisk størrelse,
  så en stor overskrift får formen tegningene viser. Vekt 500 for overskrifter, 600 for
  scoretall (`--fw-serif-*`).
- **Inter** (`font-sans`) bærer all UI-tekst, med standard tegnformer (ingen
  `ss01`/`cv11`).
- **Tall er hovedpersoner.** Et tall som er selve poenget (hull, score, total,
  handicap) får `.score-num` (serif, 600, tabulære sifre). Et tall i en setning får
  `.inline-num`. Kolonner med tall får alltid `tabular-nums`.
- **Kicker** (`components/ui/Kicker.tsx`): 10 px Inter, 600, versaler, 0,2em sperring,
  over overskrifter og seksjoner. Den bærer alltid informasjon, derfor `accent-text`
  når den er gull.
- **Overskrifter** bruker `text-wrap: pretty` globalt. Sidetittel via `PageHeader`
  (Fraunces 30 px, 500, stram sperring).
- **Norsk skikk:** setningsstil i overskrifter og knapper, «» som anførselstegn, `…` for
  ellipse.

## Layout og avstand

- Mobil først: hovedplattformen er iPhone Safari installert som PWA. Én kolonne,
  full bredde med sidemarger, og en bunnmeny (`BottomNav`) i spillerflatene.
- Tailwinds 4 px-skala. Kort har 24 px innvendig luft (`p-6`, `sm:p-7`); sidetittelen
  har 32 px under seg.
- Tette lister (leaderboard, protokoll-rader) deles med `--row-divider-warm`, ikke med
  kort-i-kort.

## Former og dybde

- **Pill** (`rounded-full`): knapper, chips, statusmerker, segmenterte valg.
- **16 px** (`rounded-2xl`): kort og store flater. **12 px** (`rounded-xl`): input.
  **8/6 px**: små elementer inni kort.
- **Skygger er hvisking:** kortet har `0 1px 2px` + `0 2px 8px` i skoggrønn med 4 %
  alfa; mørk modus bytter til en svak svart. Ingen tunge skygger, ingen glassmorfisme.

## Komponenter

Bruk primitivene i `components/ui/`; lag aldri en ny knapp, et nytt kort eller et nytt
felt ved siden av dem.

- **Button / LinkButton:** pill, minst 44 px høy, variantene `primary` (skoggrønn),
  `secondary` (kant), `danger` og `ghost`. `pending` gir spinner og `aria-busy`.
  Navigasjon er `LinkButton`, handling er `Button`.
- **SubmitButton:** skjemaknapp som følger skjemaets ventestatus.
- **Card:** hvit flate, beige hårlinje, 16 px radius.
- **Input:** etikett over feltet (eller `labelHidden` for skjermlesere), hint, advarsel
  eller feil under.
- **Chips og merker:** `StatusChip` (spillstatus), `ModeChip` og `FormatStyleBadge`
  (spillform), `GuestBadge`, `UnconfirmedBadge`.
- **Valg:** `Switch`, `SegmentedField`, `SettingRow`.
- **Disclosure:** innfelling for sekundært innhold. Aldri for destruktive handlinger;
  de har egne bekreftelsessider under `/slett`-ruter.
- **Seier og ledelse:** `Medallion`, `ChampagneMedallion`, lederkortet med gull-hårlinje
  (`.leader-card`).
- **Skall:** `AppShell`, `AdminShell`, `TopBar`, `BottomNav`, `PageHeader`, `BackLink`.
- **Venting:** `Skeleton`, `HomeSkeleton`, `LeaderboardSkeleton`, `Spinner`.
- **Merket:** `BrandMark` og `BrandHero` tegner ordmerket med ballen på T-en.

## Tilgjengelighet og berøring

- **Trykkflater minst 44 px.** Små kontroller får `.tap-extend` (usynlig utvidelse som
  ikke flytter fokusringen) i stedet for større synlig boks (#1356).
- **Fokus eies globalt.** `:focus-visible`-regelen i `globals.css` tegner ringen for alt
  interaktivt (#1386). Ikke legg til egne fokusstiler. Flater som klipper
  (`overflow-hidden`) merkes `data-focus-inset`; skoggrønne containere merkes
  `data-focus-surface="strong"`.
- **Redusert bevegelse respekteres alltid.** Hver animasjon i `globals.css` har en
  `prefers-reduced-motion`-variant.
- **Langtrykk på iOS** gir ikke systemmeny på knapper og lenker (`-webkit-touch-callout`).

## Bevegelse

Kort og rolig: 100–180 ms på knapper og hullbytte, 80 ms trinnvis inntoning av
leaderboard-rader, en langsom pust på venteprikker, shimmer på lederkortet og konfetti
ved seier. Ingen sprett, ingen evige løkker uten grunn og ingen animasjonsbiblioteker.

## Gjør og ikke gjør

**Gjør**
- Bruk tokenene via Tailwind (`bg-surface`, `text-muted`, `text-accent-text` …).
- La gull bety seier.
- Test i klubbhus-natt og på 390 px bredde før du sier ferdig.
- Kjør `humanizer:humanizer` på ny norsk tekst.

**Ikke gjør**
- Nye fonter, nye farger, lilla/blå gradienter eller nøytrale gråtoner.
- Tekst i `accent`, `success` eller `warning` (bruk `*-text`).
- Kort inni kort inni kort.
- Hardkodede hex-verdier i komponenter når et token finnes.

## Verktøyene

Design-skillene i `.claude/skills/` (Web Design Guidelines, Playwright CLI, Taste Skill),
Image-to-Code-regelen og når hver brukes: `docs/style-and-brand.md` §Designverktøy.
