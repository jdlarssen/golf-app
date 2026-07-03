# Evaluation: Liga-tabellen som embed (issue #1024)

## Verdict
ACCEPT — **betinget av prod-migrasjon 0130** (samme mønster som #1023). Fersk-kontekst-evaluator (opus) fant ingen blockers/majors; alle kode-verifiserbare kriterier PASS. PR #1035 står åpen til `leagues.spectate_token` er påført prod — merges den før, knekker liga-sidene (snapshot-selecten spør etter kolonnen).

## Success Criteria

- [PASS] **Embed-snutt fra liga-forvaltning + game-home** — `LigaEmbedControl` (toggle + «Kopier koden til nettsiden», `buildEmbedSnippet`) montert i `LigaManagement`; `LiveFollowControl` fikk embed-kopi-knapp. Staging-klikkrunde: toggle satte/nullet token i DB via UI.
- [PASS] **Rendrer uinnlogget i iframe; resten av appen nekter framing** — verifisert live på staging: injisert iframe lastet begge embed-rutene med fullt innhold; curl: `frame-ancestors *` på `/embed/...`, `'none'` på `/` og `/login` (200 uten cookies på embed). Header-rekkefølge-logikken bekreftet mot Next 16-doc («last header key overrides»).
- [PASS] **Samme data som live-lenken, verken mer eller mindre** — spill-embed gjenbruker `renderLeaderboardContent` (identisk med spectate, samme token); liga-embed gjenbruker `LeagueStandingsPanel` (samme tavle som `/liga/[id]`). Ingen deltaker-e-post/forvaltnings-UI i synlig DOM (verifisert). Revokert token → not-found-innhold (200-status er PPR-stream-oppførsel, identisk med spectate).
- [PASS] **Selvoppdaterende** — `SpectatePoller` gjenbrukt: 20 s på spill (stopper ved finished), 60 s på liga (poller kun aktiv sesong). Optional `intervalMs`-prop; eksisterende co-located test fortsatt grønn.
- [PASS] **tabular-nums / no+en / humanizer / noindex** — `LeagueStandingsTable` har tabular-nums (4 steder); alle 13 nye nøkler finnes i begge kataloger; humanizer kjørt (3 justeringer: em-dash-fragment, «pågår»→«er i gang», bestemt form); `robots: {index:false}` på begge rutene.
- [PASS/ÅPEN] **Migrasjon 0130** — staging påført + verifisert (kolonne + partial unique index). **Prod: BLOKKERT på eier-godkjenning** (auto-mode-classifieren nektet prod-DDL). `database.types.ts` hånd-patchet (Row/Insert/Update) i tråd med b9162dd4-presedens.
- [PASS] **Flyt-diagram** — `06-liga-fremtid.svg` fikk «NY · klubbside-embed #1024»-callout fra tabell-noden, PNG regenerert og visuelt sjekket (kjent qlmanage-crop uendret).

## Key Decisions

- [HONORERT] Begge flater i v1; liga fikk token-modellen fra #938 (opt-in, ikke-roterende, revokerbar).
- [HONORERT] Ren iframe, ikke script-tag; fast høyde + intern scroll; attributt-escaping testet.
- [HONORERT] Kun CSP frame-ancestors (ingen XFO) — appen fikk clickjacking-vern for første gang.
- [HONORERT] Polling, ikke realtime; lys modus default med `?theme=dark` opt-in (inline script, gaten i globals.css:136).
- [REVIDERT, dokumentert] Spill-embed: full leaderboard-render-sti i stedet for kompakt buildShareCardData-tabell (podium er topp-3-only). Revidert kontrakt postet på issuet.

## Gates

- `npx tsc --noEmit` 0 feil · eslint 0 feil på endrede filer · vitest 13/13 på nye + berørte suiter (hele lib/games-suiten 874 grønn tidligere i sesjonen) · `npm run build` grønt (staging-env; NB: hovedrepoets `.env.local` har ugyldig service-nøkkel → lokal prod-bygg feiler på /baner uansett branch) · staging-klikkrunde av begge flyter · pre-push-hook passert.

## Åpent før merge

1. Eier godkjenner prod-DDL: kjør 0130 mot `glofubopddkjhymcbaph` via Supabase MCP.
2. Merge PR #1035 (`gh pr merge --rebase --delete-branch`), closing-kommentar på #1024, vurder å lukke epic #1021 (alle tre deler i prod).
