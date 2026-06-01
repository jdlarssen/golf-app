# Handoff: Quick Win #8 — Skeleton-skjelett

## Overview
Lasting-states for **Hjem** og **Leaderboard** — to skjermer der appen ofte må vente på Supabase-data før noe kan rendres.

Tørny-skjelettet bryter med default-Tailwind-skeleton-mønsteret på fire måter:

1. **Varm linen-base** (`#ECE5D2`) i stedet for kald grå (`#E5E7EB`). Skeleton-fargen er en del av paletten, ikke et neutral.
2. **Shimmer-sweep**, ikke pulse. Én 1.8 s lineær sveip over hver shape; aldri pulserende opacity.
3. **Match-shapen 1:1 med ekte UI.** Skjelettet skal forutsi den ekte layouten — 38px icon-tile blir 38px skeleton-square, ikke et generisk avatar-cirkel.
4. **Stagget mount** (90 ms mellom radene) — så det føles som om data kommer inn rad-for-rad, ikke alt på én gang. Matcher leaderboard-mount-animasjonen.

## Files
- `design-reference.html` — interaktiv view av begge skeletons
- `skeleton.tsx` — `<Skeleton>` primitive + `<HomeSkeleton>` + `<LeaderboardSkeleton>`
- `tokens.css` — full token-fil (samme som forrige pakker)
- `README.md` — denne fila

## Visual spec

### Skeleton primitive
```css
.sk {
  background: linear-gradient(
    100deg,
    #ECE5D2 0%,
    #F3EDDD 50%,
    #ECE5D2 100%
  );
  background-size: 220% 100%;
  background-position: 100% 0;
  animation: shimmer 1.8s ease-in-out infinite;
  border-radius: 6px;
}
@keyframes shimmer {
  0%   { background-position: 100% 0; }
  100% { background-position: -120% 0; }
}
```

| Token | Verdi |
|---|---|
| Base color | `#ECE5D2` (warm linen, mellom `--border` og `--row-divider`) |
| Tint (shimmer-peak) | `#F3EDDD` |
| Gradient angle | `100deg` (svak diagonal — feels handmade) |
| Duration | `1.8s` |
| Easing | `ease-in-out` |
| Loop | `infinite` |
| Default radius | `6px` (rect), `9999px` (pill/circle variants) |

### Stagger pattern
Sett `animationDelay` på hver shape, ikke på containeren. Slik fortsetter shimmer-en synkront når alle elementer er i samme stagger-trinn.

| Trinn | Delay |
|---|---|
| 1 (first card) | `0ms` |
| 2 | `90ms` |
| 3 | `180ms` |
| 4 | `270ms` |
| 5+ | `+ 90ms hver` |

Maks 6–8 trinn synlige samtidig. Etter det skal flere skeletoner ikke trenges — det er en feil-tilstand, ikke loading.

## Screens

### Home skeleton
Speil av den ekte hjem-skjermen:
- Header-bar med kicker (`Tørny`) + 30×30 circle (avatar/profil)
- Greeting-blokk: liten kicker-strek, 200×26px hovedlinje (`Hei, …`), 130×13px sub
- Brass-ribbon med 80×11px skeleton-kicker i mellom
- 2 active-game cards: 38×38 rounded-square icon-tile + 2-linjers titlestack + chevron, så meta-rad med dividers og 64×22px pill høyre side
- 2-kolonne admin-grid med 32×32 icon + label

Total høyde matcher den ekte ~580px Hjem-skjermen.

### Leaderboard skeleton
Speil av leaderboard-skjermen:
- Header-bar: `‹` chevron + kicker + 24×24 circle (replay-button)
- Title-blokk: 100×10px kicker, 180×24px tittel, 140×12px meta
- **1.-plass-podium**: 20px rounded card med champagne-hairline på topp (rendres som faktisk gradient, ikke skeleton — så vinner-feltet føles avslørt selv før dataen lander). 56×56 num-tile + name-stack + score-stack (60×26 hovedscore + 40×11 delta). Bunn meta-rad med 90×11 + 60×22 pill.
- 3 kompakte rader for 2./3./4. plass — 22×18 pos + name-stack + 50×22 score + 38×11 delta

## State management

```tsx
const { data, isLoading } = useGames();

if (isLoading) return <HomeSkeleton />;
return <HomeContent games={data} />;
```

**ALDRI**:
- Vis spinner-overlay over eksisterende skjerm
- Vis "Laster…" tekst
- Bytt fra skeleton til content med fade-transition — content skal pop-in 1:1, så stagger på rad-mount tar over

**ALLTID**:
- Vis skeleton hvis page-load > 100ms
- Skeleton skal være synlig MINIMUM 200ms (unngå flicker hvis data lander raskt)
- Når data lander, mount content med samme 90ms stagger som skeleton-shapes brukte

## Acceptance criteria

- [ ] Skeleton base er `#ECE5D2` (warm linen), ikke kald grå
- [ ] Shimmer-keyframe heter `shimmer` og kjører `1.8s ease-in-out infinite`
- [ ] Gradient er `100deg`, sveiper venstre→høyre
- [ ] Stagger 90ms mellom skeleton-elementer i lister
- [ ] Hjem-skjelett mirror-matcher den ekte hjem-skjermen (icon-tile sizes, kort-padding, brass-ribbon)
- [ ] Leaderboard-skjelett har 1.-plass-podium med champagne-hairline på topp **selv i loading-state**
- [ ] Ingen "Laster…"-tekst noensteds
- [ ] Ingen spinner-overlays
- [ ] Skeleton-shape størrelser matcher final UI ± 4px

## Out of scope

- Skeleton for hull-skjerm (data lander vanligvis raskt nok, vis cached state)
- Skeleton for scorekort-tabell (samme — bruk cached snapshot)
- Skeleton for admin-flater (admin-bruker er tålmodig, ren render er OK)
- Pull-to-refresh skeleton-overlay (en annen samtale)
