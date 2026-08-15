# Spec: reopenGame sender rå navn i game_reopened-payloaden; loadAdminContext får to-navn-formen

**Issue:** #1670 · **Branch:** claude/1670-reopen-game-audit-string

## Design
1. `app/[locale]/admin/games/[id]/actions.ts` `loadAdminContext` (:34): returnér i tillegg
   `name: role.name?.trim() || null` (to-navn-formen som `loadAdminOrCreatorContext`, #1364);
   `actorName` (audit-streng med 'Admin'-fallback) beholdes for `logAdminEvent`.
2. `reopenGame` (:548, :606–609): send `actorName: name` (rå, kan være null) til
   `notifyPlayersGameReopened`; `logAdminEvent` beholder audit-strengen.
3. `lib/notifications/events.ts` `notifyPlayersGameReopened` (:170): `actorName: string | null`
   → payload `actor_name: game.actorName` (schema `gameReopenedSchema` er alt
   `nullable().optional()`; `cardContent.ts:97` gir `organizerFallback` ved null).
4. `endGame` (:314): sjekk om `actorName`-strengen når en varsel-payload via `endGameCore`
   (`lib/games/endGameCore*`); hvis ja → samme kur; hvis kun mail/audit → la stå og skriv det i
   commit-body.
5. Tester: `lib/notifications/events.test.ts` (game_reopened-casen: null-navn → `actor_name: null`),
   `admin/games/[id]/actions.test.ts` (reopenGame: navnløs admin → payload null, audit «Admin»).
6. `.changes/1670-gjenaapning-arrangoer.md` (fix): «Gjenåpner en arrangør uten navn i profilen
   et spill, sier varselet «Arrangøren» — ikke «Admin».»

## Success Criteria
- [x] Navnløs admin gjenåpner spill → `game_reopened`-payload `actor_name: null`; kortet rendrer «Arrangøren».
- [x] Audit-loggen uendret («Admin»-fallback).
- [x] Tester grønne; `npm run build`, `npm run lint`.

## Gates
- [x] `npx vitest run lib/notifications "app/[locale]/admin/games/[id]" lib/games`
- [x] `npm run build` · `npm run lint`
- [x] Staging: navnløs admin gjenåpner et ferdig spill → spillerens innboks-kort «Arrangøren åpnet …» (samme rigg som #1598-runden)


## Evidens (runde 1, ACCEPT)
- Staging: rigg-spill, navnløs admin → «Arrangøren åpnet …», payload `actor_name: null`; navngitt admin → ekte navn (negativ kontroll). Mutasjoner på begge nye tester → røde. 84 filer/1484 tester, tsc 0, build 0, lint 0 errors. Commit d4cb28ae.
