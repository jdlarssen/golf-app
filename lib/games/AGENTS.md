# lib/games — cachet spill-data

> Flyttet ordrett fra CLAUDE.md (#2100). Utløser: `docs/agent-discipline/bindings.md` §Domain triggers, rad «Caching».

## Server-actions og caching

`lib/games/getGameWithPlayers.ts` — `unstable_cache`-wrappet helper med tag `game-${id}` og admin-client for RLS-bypass (cookies fungerer ikke inne i cache-callbacks). Authz beholdes på call-site via `me = players.find(...)` → `notFound()`.

Alle game-side-konsumenter leser fra cachen (hull-page, scorecard, submit, approve, game-home, leaderboard). Alle mutasjoner (server-actions og route handlers) kaller `expireGameCache(id)` fra `lib/games/expireGameCache.ts` (cupens `tournament-${id}`: `expireTournamentCache`). Hjelperen er `revalidateTag(tag, { expire: 0 })`: `'max'` er stale-while-revalidate og ga gammel status ved første besøk (#2068), og `updateTag` kaster utenfor Server Actions. Vakt-testen ved siden av feiler på direkte `revalidateTag` på disse taggene. Kallet kaster under render-fase, så server-components (auto-start-fallbacken i game-home) pakker det i `after()`.

`courses(...)` / `tee_boxes(...)` joins er IKKE cachet — caching ville krevd cross-game fan-out på course-edits. Konsumenter som trenger join-data fetcher det som slim direkte-call parallelt med cached helper.
