# Handoff: Quick Win #7 — Iconset + komplett designsystem

## Hva er dette
Ti håndtegnede Tørny-ikoner **pluss** den komplette grafiske spec'en som hører til: farger, fonter, mellomrom, skygger, hjørner, komponentregler, ikon-bruk per kontekst. Designeren har låst alle valg — utvikleren trenger ikke gjette.

Filer:
- `design-reference.html` — interaktiv visning av alle 10 ikoner + skala + kontekst
- `tokens.css` — alle CSS-variabler (full Tørny-palett, type, spacing, shadows)
- `icons/*.svg` — 10 enkeltstående SVG-er, alle `currentColor`
- `icons/Icons.tsx` — React-komponenter (alle 10 + TypeScript-props)
- `assets/brand-mark.svg` — wordmark (referanse)

---

## 1 · Fargesystem

### Kjernepalett

| Token | Hex | Hvor |
|---|---|---|
| `--primary` | `#1B4332` | Primær handlinger, ikoner default, navigasjon |
| `--accent` | `#C9A961` | **Kun** vinnermomenter, fokusringer, highlights |
| `--accent-deep` | `#B89446` | Aksent-tekst på lys bg (kicker, tagline) |
| `--bg` | `#F8F6F0` | Hovedbakgrunn (spillerflater) |
| `--admin-bg` | `#F5F1E4` | Varmere bakgrunn (admin/sekretariatet) |
| `--surface` | `#FFFFFF` | Kort, modaler, opphøyde flater |
| `--border` | `#E5E0D3` | Standardgrense på kort/inputs |
| `--row-divider` | `#EDE6D2` | Mellom tabellrader (varmere enn border) |
| `--text` | `#1A2E1F` | Body, headlines |
| `--text-muted` | `#5C5347` | Meta, captions, sekundær info |

### Semantiske farger

| Token | Hex | Hvor |
|---|---|---|
| `--success` | `#4A7C59` | Bekreftet, ferdig, sage-grønn |
| `--danger` | `#B8463E` | Sletting, feil — muted brick (aldri rød rød) |
| `--warning` | `#D89B3A` | Advarsel, amber (sjelden brukt) |

### Statuspille-toner
```css
/* aktiv */    bg: rgba(74,124,89,0.16);  fg: #2F5A3C;
/* påmelding */bg: rgba(216,155,58,0.18); fg: #7A5410;
/* signert */  bg: rgba(92,83,71,0.10);   fg: var(--text-muted);
/* utkast */   bg: rgba(184,70,62,0.12);  fg: #7A3935;
```

### Score-toner (på score-pille i scorekort)
```css
/* under par */ bg: rgba(74,124,89,0.14);  fg: #2F5A3C;
/* par */       bg: transparent;           fg: var(--text-muted);
/* bogey */     bg: rgba(229,224,211,0.55);fg: var(--text);
/* double+ */   bg: rgba(184,70,62,0.10);  fg: #7A3935;
```

### Brass-detaljer (hairlines, stamps)
```css
--brass-top: #D3C9A6;        /* champagne hairline */
--brass-bottom: #E5E0D3;     /* warm beige under hairline */
--stamp-stroke: rgba(184,148,70,0.35);
--stamp-fill:   rgba(184,148,70,0.55);
```

### Dark mode
```css
--bg-dark:           #1A2620;
--admin-bg-dark:     #1F2F23;
--surface-dark:      #243828;
--border-dark:       #2E4536;
--text-dark:         #E8E2D4;
--text-muted-dark:   #9A8F7C;
/* primary inverts to bg-tint for body text on forest bg */
--bg-tint:           #F0EDE5;
/* accent stays #C9A961 — gold reads on both */
```

---

## 2 · Typografi

### Fontstack
```css
--serif: 'Fraunces', Georgia, 'Times New Roman', serif;
--sans:  'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```
- **Fraunces** (variable serif) — *next/font/google* med `--font-serif`. Til headings, score-tall, status-tags. Alltid `font-variation-settings` SOFT-aksen via variable-axes.
- **Inter** (sans) — *next/font/google* med `--font-sans`. UI, body, knapper, meta.

### Type-skala

| Token | Familie | Størrelse | Vekt | Tracking | Hvor |
|---|---|---|---|---|---|
| `--ts-display` | serif | 38 / 1.05 | 500 | -0.018em | Splash, store headings |
| `--ts-h1`      | serif | 26 / 1.1  | 500 | -0.015em | Skjerm-tittel |
| `--ts-h2`      | serif | 22 / 1.1  | 500 | -0.015em | Section heading |
| `--ts-h3`      | serif | 18 / 1.15 | 500 | -0.005em | Kort-tittel, list-label |
| `--ts-h4`      | serif | 15 / 1.2  | 500 | -0.005em | Mini-heading, ledger value |
| `--ts-body`    | sans  | 14 / 1.55 | 400 | 0        | Body |
| `--ts-meta`    | sans  | 12 / 1.4  | 500 | 0        | Captions, list-meta |
| `--ts-caption` | sans  | 11 / 1.4  | 400 | 0        | Sub-meta |
| `--ts-kicker`  | sans  | 10–11 / 1 | 600 | 0.18–0.20em uppercase | Section labels, brass ribbons |
| `--ts-pill`    | sans  | 9.5–10 / 1| 600 | 0.16em uppercase | Status pills |
| `--ts-quote`   | serif italic | 11 / 1.5 | 500 | 0 | Footer quotes |

### Tall (kritisk)
**Alle tall** i UI bruker `font-variant-numeric: tabular-nums`. Dette inkluderer:
- Score (Fraunces)
- HCP-indeks (Fraunces)
- Tee-tider (Inter)
- Dato (Inter)
- Sak-numre (Inter)
- Slag-antall (Fraunces)

```css
.tabular-nums { font-variant-numeric: tabular-nums; }
/* Tailwind: tabular-nums */
```

### Norsk støtte
Begge fonter støtter `ø å æ Ø Å Æ` fullt. Test: «Tørny · Bogstad · Lørdagsslaget».

---

## 3 · Spacing & layout

### Spacing-stige (4px-base)
```css
--sp-1: 4px;   --sp-2: 8px;   --sp-3: 12px;
--sp-4: 16px;  --sp-5: 20px;  --sp-6: 24px;
--sp-7: 28px;  --sp-8: 32px;  --sp-10: 40px;
--sp-12: 48px; --sp-16: 64px;
```
Bruk skritt på 4px. Aldri 5, 7, 13.

### Hjørner
```css
--r-sm: 9px;   /* pills, små knapper */
--r-md: 12px;  /* buttons, inputs */
--r-lg: 14px;  /* ledger cards, lister */
--r-xl: 16px;  /* hero-kort, salutation */
--r-2xl: 20px; /* leaderboard 1.-plass */
--r-full: 9999px;
```
Tørnys signatur: `rounded-2xl` (16px) på kort. Aldri 100% rounded utenom piller.

### Skygger
```css
--shadow-card:   0 1px 2px rgba(26,46,31,0.04), 0 2px 8px rgba(26,46,31,0.04);
--shadow-lift:   0 1px 2px rgba(26,46,31,0.06), 0 4px 14px rgba(26,46,31,0.08);
--shadow-hover:  0 2px 4px rgba(26,46,31,0.06), 0 6px 18px rgba(26,46,31,0.10);
--shadow-winner: 0 4px 18px rgba(201,169,97,0.28), 0 1px 2px rgba(26,46,31,0.06);
```
Aldri rene grå skygger. Alle skygger har forest-tint (`rgba(26,46,31, ..)`).

### Layout-regler
- Maks innholdsbredde mobil: 390px. PWA renderes alltid på telefonbredde.
- Side-padding: 14–18px på spiller-skjermer.
- Knapphøyde min: 44px (hit target).
- Touch-targets: aldri mindre enn 44×44, selv om visual er mindre.

---

## 4 · Ikon-system

### Tegne-spec
- **viewBox** `0 0 24 24` — alltid.
- **Strek** 1.5px, `stroke-linecap: round`, `stroke-linejoin: round`.
- **Farge** `currentColor` — arver fra parent.
- **Outline** er default. **Aksent** = ett fyllområde med `fill-opacity: 0.18`.
- 2px safe-zone — ingen kropp utenfor `(2,2) → (22,22)`.

### De ti

| Ikon | Bruk |
|---|---|
| **Flagg** | Hull-skjerm, leaderboard radmarkering, navigasjon til runde |
| **Utslag** | Tee-time, start-runden, kalenderen for kommende spill |
| **Pokal** | Leaderboard-vinner, resultatprotokoll, profil-trofeer |
| **Scorekort** | Mitt scorekort, lever-flyt, bunn-nav scorekort-tab |
| **Bane** | Banevelger, admin → baner, kort-meta for banen |
| **Konvolutt** | Magic link login, invitasjoner, admin → invitasjoner |
| **Laurbær** | Vinner-detalj (rundt 1. plass), historie, klubbmesterskap-merker |
| **Handicap** | Profil-HCP, HCP-input, sett-handicap-modal |
| **Kølle** | Format-velger, Start runden-CTA, klubb-relaterte handlinger |
| **Kalender** | Dato, tee-time, planlegg ny runde, historikk |

### Størrelser (low to high)

| Px | Hvor | Eksempel |
|---|---|---|
| 14 | Status-piller, kategori-piller | `<KalenderIcon size={14}/>` ved siden av dato i pille |
| 18 | Listerader, ledger-rader, inline labels | `<ScorekortIcon size={18}/>` ved siden av list-tittel |
| 22 | Headere, section tile icons | `<BaneIcon size={22}/>` i admin section-tile |
| 32 | Empty states, små hero-blokker | `<KonvoluttIcon size={32}/>` i invitasjoner-tom |
| 48 | Splash, store hero | `<PokalIcon size={48}/>` i leaderboard-vinner |
| 64+ | Spesielt — pre-spill, decorative | Bruk med aksent-variant for mer karakter |

### Farge i kontekst
- **Default** ikoner: `color: var(--primary)` (forest).
- **På forest bg**: `color: var(--bg-tint)` med eventuell `--accent` for fokuselementer.
- **Som aksent-CTA i primær-knapp**: `color: var(--accent)` (kølle på "Start runden" knapp).
- **Muted**: `color: var(--text-muted)` for sekundære ikoner i lister.
- **Champagne** (kun ved vinner-felt): `color: var(--accent-deep)`.

### Aksent-variant (champagne-fyll)
Brukes **kun** for vinner-momenter og resultathøydepunkter — aldri default.
```jsx
<PokalIcon className="text-accent-deep">
  {/* legg til <path ... fill="currentColor" fill-opacity="0.18"/> internt */}
</PokalIcon>
```
Standard pattern: ett enkelt fyllområde med 0.18 opacity over outline-strokes. Bruk sparsomt — maks 1 aksent-variant per skjerm.

---

## 5 · Komponentregler

### Kort
```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  padding: 24px 28px;          /* p-6 sm:p-7 */
  box-shadow: var(--shadow-card);
}
```

### Primær knapp
```css
.btn-primary {
  background: var(--primary);
  color: var(--bg-tint);
  border: none;
  height: 48px;
  padding: 0 18px;
  border-radius: var(--r-md);
  font: 600 14px/1 var(--sans);
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.btn-primary:hover  { transform: translateY(-1px); box-shadow: var(--shadow-lift); }
.btn-primary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
```
Med ikon: `--accent` på ikonet, 8px gap til label.

### Sekundær knapp
```css
.btn-secondary {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  /* resten som primary */
}
```

### Inputs
```css
.input {
  background: var(--surface);
  border: 1px solid var(--border);
  height: 48px;
  padding: 0 14px;
  border-radius: var(--r-md);
  font-variant-numeric: tabular-nums;  /* alltid */
}
.input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
```
Fokus i champagne (`--accent`), **ikke** i primary. Dette er bevisst — gir gull-følelsen.

### Status-pille
```css
.pill-status {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: var(--r-full);
  font: 600 9.5px/1 var(--sans);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
```

### Brass ribbon (admin/section-skille)
```css
.ribbon {
  display: flex;
  align-items: center;
  gap: 14px;
}
.ribbon-line {
  flex: 1;
  height: 6px;
  position: relative;
}
.ribbon-line::before,
.ribbon-line::after {
  content: "";
  position: absolute;
  inset: auto 0 auto 0;
  height: 1px;
}
.ribbon-line::before { top: 1px; background: var(--brass-top); }
.ribbon-line::after  { top: 5px; background: var(--brass-bottom); }
.ribbon-kicker {
  font: 600 11px/1 var(--sans);
  letter-spacing: 0.20em;
  text-transform: uppercase;
  color: var(--accent-deep);
}
```

---

## 6 · Bevegelse

| Trigger | Anim | Tid |
|---|---|---|
| Leaderboard rad mount | fade + 6px transY | 320ms `cubic-bezier(.16,1,.3,1)`, stagger 80ms |
| Score-pille mount | scale 0.96→1 + fade | 200ms ease-out |
| 1.-plass kort | shimmer (1 syklus) | 1.8s linear, kjøres én gang |
| Konfetti | physics burst (54 partikler) | 2.4s, én gang per leaderboard-mount |
| Knapp hover | translateY(-1px) + shadow-lift | 120ms ease |
| Pill mount | fade-in | 160ms ease-out |
| **ALDRI** | page transitions, spinners, bouncing, gjentakende pulser |

Bevegelse må tjene clarity. Ingenting roterer for dekorasjon. Ett unntak: klubb-stempelet i admin (`-8deg` static, ikke roterende).

---

## 7 · Tekst & tonalitet

### Stemme
- **Norsk-først**. Alle UI-strings på norsk. Engelsk kun for fagtermer (Stableford, par, eagle, birdie, bogey).
- **Du**-form, aldri "De" eller "deg". Eks: «Sjekk innboksen din.» (ikke «Sjekk Deres innboks»).
- **Du-tone fra klubbsekretæren** — vennlig men presis. Ikke chummy. Ikke korporativ. «God ettermiddag, Sindre.» framfor «Hei der! 👋»
- **Ingen emoji** i produksjon. Ikoner gjør jobben.

### Casing
- **Sentence case** for headings og knapper: «Start runden», ikke «Start Runden».
- **UPPERCASE TRACKING** (0.16–0.20em) for kickers, pill-labels, brass-kicker.
- **Tall**: alltid `tabular-nums`. Eks: HCP `14.2`, ikke `14,2` (med mindre lokale tall-formater er aktivert).

### Vokabular
| Bruk | Ikke bruk |
|---|---|
| Sekretariatet | Admin |
| Sak 2026-019 | Tournament #19 |
| Spill | Turnering (i UI) — «turnering» kun i marketing |
| Lever scorekort | Submit scorecard |
| Pågående | Active/In progress |
| Påmelding | Registration |
| Saksbehandler | Admin user |
| Resultatprotokoll | History/Past tournaments |

---

## 8 · Tørny-prinsipper (rask å huske)

1. **Data først.** Tall er konge. Tabular-nums alltid.
2. **Champagne sparsomt.** Aksent er for vinnere, fokus, og brass-detaljer. Aldri bakgrunn, aldri body-tekst.
3. **Forest grunner.** Primær bg er linen, primær ink er forest. Alt annet er nyanser av disse to.
4. **Brass-hairlines** signaliserer struktur — bruk dem i seksjonskiller, ikke som dekor.
5. **Klubbhus-følelse på admin.** Varmere bg, "protokoll"-vokabular, stempler, ledger-tabeller.
6. **Ingen page transitions.** Ingen spinners. Konfetti er ett unntak — leaderboard-avsløring.
7. **Norsk-først, ø-en er stolt.** Wordmarken skriver `Tørny`, ikke `Torny`.

---

## 9 · Filer i denne pakken

```
quick-win-7/
├── README.md                       ← du leser den
├── design-reference.html           ← interaktiv ikon-katalog
├── tokens.css                      ← full CSS-variabel-fil
├── icons/
│   ├── Icons.tsx                   ← 10 React-komponenter
│   ├── flagg.svg
│   ├── utslag.svg
│   ├── pokal.svg
│   ├── scorekort.svg
│   ├── bane.svg
│   ├── konvolutt.svg
│   ├── laurbaer.svg
│   ├── handicap.svg
│   ├── kolle.svg
│   └── kalender.svg
└── assets/
    └── brand-mark.svg              ← Tørny-wordmark (referanse)
```

## 10 · Akseptkriterier

- [ ] Alle 10 ikoner kommer inn som React-komponenter i `components/icons/`
- [ ] `currentColor` arves overalt — ingen hardkodet `stroke="#1B4332"`
- [ ] Lucide-importer fjernes der Tørny-ikon finnes (flagg, pokal, scorekort, bane, konvolutt, kalender)
- [ ] Lucide beholdes som **fallback** for sjeldne ikoner ikke i settet
- [ ] `tokens.css` (eller tilsvarende `:root`-block i `globals.css`) eksporterer alle variabler
- [ ] Score-piller bruker `tabular-nums` overalt
- [ ] Brass-ribbon brukes på admin-seksjonskiller og leaderboard-vinner-kort
- [ ] Fokusringer er `--accent` (gull), aldri `--primary` (forest)
- [ ] Knapp-hover er `translateY(-1px)` + shadow-lift, ingen scale/opacity
- [ ] Touch-target ≥ 44px overalt, selv om ikonet er 18px
- [ ] Dark mode bruker `--bg-dark`/`--surface-dark`/`--text-dark` — primary bytter rolle med bg

## 11 · Out of scope

- Ikoner for sjeldne flater (innstillinger, varsler, bell, søk) — bruk Lucide
- Animerte ikoner (alle Tørny-ikoner er statiske)
- Filled-only variants (kun outline + aksent-variant er definert)
- Logo-revisjon (wordmark er låst — se Quick Win #2)
