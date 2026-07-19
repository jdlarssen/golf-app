# Evaluation: #1264 Teknisk SEO-pakke

**Kontrakt:** issue-kommentar på #1264 («📋 Forge-kontrakt tilgjengelig»)
**Bygget:** nattkjøreren 2026-07-19, branch `claude/natt-1264-seo`, Node 22.22.2, byggemodell Opus.
**Evaluator runde 1:** byggerens egen skeptiske ferskkontekst-verifisering (curl mot lokal prod-build).
**Evaluator runde 2 (kryss-modell-gate, #1073):** uavhengig Sonnet-agent — se PR-kommentar.

## Runde 1 — self-eval mot Success Criteria (lokal prod-build, curl)

| Kriterium | Resultat | Bevis |
|---|---|---|
| Anonym `/spillformater` + detalj → 200, server-rendret | ✅ | `/spillformater` 200, `/spillformater/stableford` 200, innhold (Texas/Stableford/Wolf) i HTML |
| Sitemap: alle ruter + én per GameMode + hreflang no/en/x-default | ✅ | 29 `<url>`, 22 mode-sider, hver med no/en/x-default (29/29/29) |
| Canonical (apex, locale-riktig) + unik description + og:image; ingen «– Tørny – Tørny» | ✅ | `/en/spillformater` → canonical `.../en/spillformater`; doblingssweep: 0 treff |
| `/login` + `/spectate/<token>` noindex,nofollow | ✅ | begge `<meta name="robots" content="noindex, nofollow">`; signup beholder eget OG-bilde |
| build/test/lint grønt | ✅ | build exit 0, 4917 vitest, lint 0 errors |

### F1 — BLOCKER funnet i runde 1 → LUKKET i `d8f5231`

Rot-OG-bildet (`app/[locale]/opengraph-image.tsx`) er locale-nested, så proxyen kjører for det.
Uten en `PUBLIC_PATH_PATTERN`-oppføring ble anonyme OG-scrapere (Facebook/WhatsApp) 307-redirigert
til `/login` — hver delt offentlig lenke ville forhåndsvist login-redirecten i stedet for
brand-kortet, stikk i strid med pakkens mål («Delte lenker vises nakne»).

Fix (`d8f5231`): la `opengraph-image` inn i `PUBLIC_PATH_PATTERN`. Verifisert lokalt:
`/no/opengraph-image` → ett 307-hopp → `/opengraph-image` → **200 image/png** (36 630 B);
`/en/opengraph-image` → 200 image/png; ingen regresjon (`/spillformater` 200, `/login` noindex,
ukjent rute fortsatt 307 → login).

## Slutt-verdict runde 1: ACCEPT (etter F1-fix). Kryss-modell-gate følger i runde 2.
