<!--
  Helse-audit av Tørny, 2026-06-17.
  Metode: 9 parallelle kode-finnere + adversariell verifisering per funn, grunnet i live
  produksjons-skjema (hentet via Supabase MCP). 44 kandidater → 41 verifiserte funn → 24 issues (#666–#689).
  Dette er en RAPPORT (engangs-diagnose + plan), ikke backlog. Backlog lever i GitHub Issues.
-->

# Tørny helse-audit & nordstjerne-flyter — 2026-06-17

## 1. Diagnose: hva appen sliter med

Backlogen så rolig ut (16 åpne issues, nesten alt skala-trigget). Den virkelige svakheten lå i
**git-historikken og prod-erfaringen**, ikke i issue-listen. De siste prod-havariene (#641, #642,
#647, #648 — cup og liga knekt ende-til-ende) hadde alle **samme rotårsak** og ble alle funnet av
**manuell QA, aldri av en test**.

Tre systemiske svakheter, i prioritert rekkefølge:

### A. Schema-drift fanges aldri ved bygging (rotårsaken)
Alle fire Supabase-klientene konstrueres **uten `<Database>`-generic** (`lib/supabase/*.ts`). Den
1928-linjers håndholdte `lib/database.types.ts` importeres av **ingenting**. Resultat: `course_holes.par`
(finnes ikke — det er `par_mens/_ladies/_juniors`) og `game_players.status` (finnes ikke) kompilerer
grønt og feiler først i prod. Typefila har allerede driftet (mangler `notifications.archived_at` fra
migrasjon 0098). → **#672** (koble inn generic), **#673** (gen:types + CI-drift-sjekk).

### B. Ingen ende-til-ende-dekning på livssyklusene som faktisk knekker
281 vitest-tester (mest ren logikk) + 26 e2e — men **ingen** test kjører en innlogget kjerne-flyt
eller cup/liga/klubb/lag-livssyklus. e2e-ene asserterer stort sett bare «redirect til login».
Cup/liga-generatoren og standings — der hvert nylig havari levde — har null kjørbar bevisførsel.
→ **#674** (autentisert golden-path + cup/liga-smoke).

### C. Ingen CI og ingen feil-grenser
Det finnes ingen `.github/`-mappe: ingen `tsc`/`vitest`/`e2e` kjører automatisk før merge. Vercel
bygger først **etter** merge til main. Og det finnes ingen `error.tsx` noensteds — en kort
nettverkshikke midt i en runde kaster brukeren til Next.js sin rå engelske 500-side.
→ **#673** (CI-gate), **#680** (feil-grenser).

**Konklusjon — hvordan vi senker bug-raten:** ikke ved å fikse enkeltbugs, men ved å lukke
fabrikasjons-gapet: **typet klient → byggefeil i stedet for prod-feil → CI-gate → livssyklus-smoke.**
Disse fire (#672, #673, #674, #675) er de høyest-leverte issuene i hele auditen.

## 2. Bug-reduksjons-plan (rekkefølge)

| Steg | Issue | Hva det gir |
|---|---|---|
| 1 | **#672** Koble `<Database>` inn i klientene | `course_holes.par`/`game_players.status` blir røde streker i editoren, ikke prod-500. Konverterer hele drift-klassen til byggefeil. |
| 2 | **#673** `gen:types` + CI (tsc/vitest/e2e + drift-diff) | Typene kan aldri drifte fra prod igjen; alle gates kjører før merge. |
| 3 | **#675** Transaksjoner rundt cup/liga-oppretting | Ingen foreldreløse halv-byggede turneringer ved feil midtveis. |
| 4 | **#674** Autentisert golden-path + cup/liga-smoke | En grønn gate som ville fanget #641/#642/#647 før de nådde prod. |
| 5 | **#680** Feil-grenser (`error.tsx`) | Neste schema/RLS-regresjon møter brukeren som vennlig norsk fallback, ikke rå 500. |

## 3. Nordstjerne-flytene — hva appen MÅ være best på

Eier-beslutning (2026-06-17): vekt mot **«Spille en runde»** og **hele kjerne-løkka**. Rangert:

### ⭐ Flyt 3 — Spille en runde (på banen) — *den appen står og faller på*
Taste slag offline → Dexie → synk → leaderboard → lever → peer-godkjenn. Dette er øyeblikket
produktet eksisterer for. **Må være ufeilbarlig.** Nåværende svakheter funnet:
- **#668 (P1)** offline-scores kan bli permanent strandet hvis man leverer før synk.
- **#666 (P1)** leaderboard kan kåre et lag uten score som vinner.
- **#670 (P1, sikkerhet)** spiller kan selv-godkjenne kort / endre eget handicap via RLS-hull.
- **#679 (P2)** live leaderboard oppdaterer ikke på de fleste format-visningene.
- **#680 (P2)** rå 500 ved nettverkshikke. **#688 (P3)** stille synk-overskriving uten varsel.

### Flyt 2 — Bli med i et spill — *førsteinntrykket for hver ny spiller*
Invitasjon → kode-innlogging → land i spillet. Svakheter: **#667 (P1)** lag-kaptein mistes stille,
**#676 (P2)** «både»-spill-medspiller havner som solo, **#685 (P3)** invite_only lag = blindvei.

### Flyt 4 + 5 — Opprett & avslutt (arrangør-løkka) — *der havariene levde*
Svakheter: **#669 (P1)** 5-spiller Wolf kan ikke publiseres, **#675 (P2)** ikke-atomisk oppretting,
**#677 (P2)** stableford liga feil per kjønn, **#678/#683 (P2/P3)** cup-blindveier/feil-gater.

### Flyten som binder alt: opprett → bli med → spille → avslutt
Ingen enkelt-lenke kan svikte. I dag har **ingen** av lenkene en innlogget ende-til-ende-test (#674).
Det er det enkelttiltaket som mest direkte beskytter hele løkka.

> De seks kanoniske flytene (`docs/flows/`) står ved lag. Denne auditen endrer ikke kartet — den
> rangerer hvilke som må være feilfrie først, og peker på de konkrete hullene per flyt.

## 4. Issue-indeks (#666–#689, alle i milepæl «Backlog»)

**P1 — kritisk (4):** #666 leaderboard kårer feil vinner · #667 lag-kaptein mistes stille ·
#668 offline-scores strandes · #669 Wolf-5 kan ikke publiseres.

**Sikkerhet (2):** #670 spiller kan selv-godkjenne/endre handicap (RLS) · #671 DEFINER-herding
(anon e-post-orakel + search_path).

**Bug-forebygging / infra (4):** #672 typet Supabase-klient · #673 CI + gen:types · #674 e2e
golden-path + cup/liga-smoke · #675 transaksjoner rundt cup/liga-oppretting.

**P2 funksjonell (7):** #676 «både»-medspiller solo-blindvei · #677 stableford liga per-kjønn-par ·
#678 cup-kamp planlagt-blindvei · #679 live leaderboard refresh · #680 feil-grenser ·
#681 par-tooltip i18n-lekkasje + dedup · #682 leaderboard god-fil refactor.

**P3 polish/edge (7):** #683 plus-handicap >18 · #684 Nassau-tiebreaker · #685 invite_only lag-blindvei ·
#686 invite-mail strander invité · #687 liga tidssone-opprydding · #688 synk-konflikt-transparens ·
#689 CupSetup død format-gate.

---
*Metode: hvert funn ble adversarielt re-verifisert av en uavhengig agent som leste den siterte koden
mot produksjons-skjemaet før det ble beholdt. 3 av 44 kandidater ble forkastet som falske positive.*
