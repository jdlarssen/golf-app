# Kontrakt: #309 — Modus-hint i invitasjons-mailen

**Issue:** https://github.com/jdlarssen/golf-app/issues/309
**Type:** feat (area:mail) — #299-tråden
**Branch:** claude/beautiful-goldstine-ee8943

## Mål

En invitert spiller møter spillet først i invitasjons-mailen. Legg til modus-navn +
ett-linjes sammendrag + lenke til `/spillformer` i den game-scoped invite-mailen,
så terskelen senkes før de åpner appen.

## Tilnærming (ingen gråsoner — issue fullt spesifisert)

- `sendInviteNotification` får ny optional `gameMode?: string`. Defensiv lookup:
  rendres kun når `hasGame` OG `gameMode` er en gyldig nøkkel i `MODE_GUIDE`
  (ukjent/inaktivt format → ingen hint, ingen krasj).
- Innhold: `MODE_LABELS[mode]` (navn) + `MODE_GUIDE[mode].summary` (én linje) +
  lenke til `https://tornygolf.no/spillformer` («Les mer om spillformene»).
  `/spillformer` har ingen per-modus-anker, så generell lenke (per issue).
- Plassering: én hint-linje etter intro-linjen, før «kom i gang»-instruksjonen.
  Både HTML og text. Holdes til én linje + lenke (ikke regelbok).
- `app/admin/games/[id]/inviteToGameActions.ts` sender `gameMode: game.game_mode`
  (allerede i `select('id, name, status, game_mode')`). De to åpne invite-flytene
  (admin/spillere, invite/actions) er ikke game-scoped → uendret.
- `modeGuide.ts` er klient-trygt (ingen `server-only`) → trygt å importere i mail.

## Suksesskriterier

- [x] `InviteNotificationParams.gameMode?: string` + `resolveModeHint`; hint kun ved hasGame + `hasOwnProperty(MODE_GUIDE, gameMode)`
- [x] HTML (14px callout) + text inneholder MODE_LABELS-navn + MODE_GUIDE.summary + lenke til /spillformer
- [x] Ukjent gameMode → ingen hint (test: `not_a_real_mode` → ikke «Spillform:»); ingen kast
- [x] Åpen invite (gameMode uten gameName) → ingen hint (test)
- [x] `inviteToGameActions.ts` sender `gameMode: game.game_mode`
- [x] Type B-snapshot: ny lås for game+mode-text + hint-HTML-ekstraktor; eksisterende caser uendret
- [x] Ny copy («Spillform:», «Les mer om spillformene») er minimal + idiomatisk; summary er pre-eksisterende #299-innhold

**Gates:** `npx vitest run lib/mail/` 96 grønne (12 filer) · `npm run build` ✓ · eslint ren. Versjon → 1.59.5. Self-eval (liten, godt testet mail-endring; ingen subagent-eval).

## Gates

- `npx vitest run lib/mail/` — alle mail-tester grønne (snapshot oppdatert med review)
- `npm run build` · `npx eslint` på endrede filer

## Versjonering

Ny bruker-synlig mail-innhold → **PATCH** + CHANGELOG (1.59.y-serie).
