# Evaluation: #1739 — Leaderboard: konfetti gir horisontal side-scroll på mobil

**Builder:** Nattkjøreren (#1079), Opus-bygg · **Evaluator:** fresh-context Opus per runde
**Contract:** issue-kommentar #1739 (teknisk fix, produktvalg: false)
**Branch:** `claude/natt-1739-confetti-clip` fra `origin/main@8cb7790`

## Runde 1 — implement → gates → evaluate → NEEDS WORK

Bygget (`75b274d`): `DECOR_CLIP = 'overflow-x-clip -mx-2 px-2'` på begge `LeaderboardShell`-røtter; ConfettiBurst-kommentar rettet (±117°); `.changes/1739-konfetti-sidescroll.md`. Gates grønne (tsc, lint, 52/217 leaderboard-tester, full build; klassen bevist i emitted CSS + prerendret demo-HTML).

Funn:
- **F1** `LeaderboardChrome.tsx + kriterium 3`: fokus-ringen (2px outline + 2px offset) på tilbake-pilene malte utenfor 8px-clip-innsettet — venstre ringsegment klippet (kjent bug-klasse, jf. `data-focus-inset` i globals.css). Remedie: utvid til `-mx-4 px-4`.
- **F2** `LeaderboardChrome.tsx + dokumentasjon`: `DECOR_CLIP`-docblokken foreldreløs-gjorde `LeaderboardShell` sin JSDoc (0 attached blocks via compiler-API). Remedie: flytt konstanten over komponent-JSDoc-en.
- Nits: kommentar-referenter (holes/page + drilldown er UTENFOR shellen), feil piksel-påstand.

## Runde 2 — fiks (`200d07f`) → evaluate → NEEDS WORK

F1 og F2 verifisert RESOLVED (emitted CSS `-mx-4/px-4`; compiler-API: JSDoc re-attached; korrekt kommentar-matematikk). Nytt funn:

- **F3** `LeaderboardChrome.tsx + ingen-ny-overflow`: chromeless-grenen har INGEN paddet forfar på ferdig-spill-stien i 9 formatfiler (View med hardkodet `chromeless` som søsken av AppShell-innpakket podium, rett under flex-`body`) — `-mx-4` ga used width = viewport + 32px → scrollWidth = viewport + 16, altså re-introdusert #1739-symptom. Premiss for remedie: ALLE in-shell-piler er `!chromeless`-gatet → chromeless trenger ingen outset.

## Runde 3 — fiks (`b9a13ad`) → evaluate → ACCEPT

Fiks: `DECOR_CLIP = 'overflow-x-clip'` (delt) + `DECOR_CLIP_INSET` med `-mx-4 px-4` KUN på full-side-grenen. Runde 3-evaluator bekreftet:
- Premisset holder (0 negative horisontale offsets i noen chromeless-subtre; 64 `chromeless`-sites sjekket).
- Fokus-ringer i chromeless-grenen: minste innsett for fokuserbart element er 14px ≫ 4px ring — ingen klipping.
- Fersk build: prerendret demo-HTML uten `-mx-4`; kompilert chunk viser begge greners literals korrekt.
- Regresjoner: ingen (tsc clean, 52/217 grønne, eslint 0, build OK). Ingen nye funn.
- Observasjon (pre-eksisterende, ikke fra denne branchen): chromeless-View på ferdig-sti er uten `max-w-md`-begrensning — uendret av fiksen.

### Suksesskriterier

| # | Kriterium | Bevis | Resultat |
|---|-----------|-------|----------|
| 1 | Ingen side-scroll (statisk del) | `.overflow-x-clip` i emitted CSS; på begge røtter; chromeless uten outset (F3-fiksen) | PASS (statisk) — runtime-måling = manuell QA |
| 2 | Animasjon uendret | `globals.css` urørt; ConfettiBurst-diff er kun kommentar | PASS |
| 3 | 44px tap-flate + fokus-ring bevart | `-mx-4 px-4` på full-side-roten; ring-matte 12px < 16px; tap-flate-geometri verifisert | PASS |
| 4 | Eksisterende tester uendret grønne | 52 filer / 217 tester; full suite 500/6662 (runde 1); ingen testfiler endret | PASS |

### Reviewer-funn → issues

- #1747: fem hånd-rullede tilbake-piler → delt back-link-primitiv (duplikatet + fokus-ring-bug-klassen er roten til F1/F3-kompleksiteten).

## Verdict

**ACCEPT** etter 3 evaluate-runder (innenfor #1077-taket på 5, kryss-modell-gaten medregnet som runde 4). Runtime-scrollWidth på ekte mobil-viewport gjenstår som manuell QA.

## Kryss-modell-gate (Steg 4.5, runde 4) — Sonnet CONFIRM

Uavhengig Sonnet-agent (kun kontrakt + produktdiff + evalueringsrapport) forsøkte å
motbevise kriteriene: **CONFIRM**. Verifiserte selv emitted CSS, kompilert SSR-chunk,
prerendret demo-HTML (chromeless uten `-mx-4`), `!chromeless`-gatingen av alle piler,
og CSS Overflow-semantikken for `clip`. Restnit (upresist JSDoc-prosa om «caller
responsibility») — ikke-substansielt.
