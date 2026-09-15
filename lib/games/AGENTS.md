# lib/games — cachet spill-data

> Flyttet ordrett fra CLAUDE.md (#2100). Utløser: `docs/agent-discipline/bindings.md` §Domain triggers, rad «Caching».

## Server-actions og caching

`lib/games/getGameWithPlayers.ts` — `unstable_cache`-wrappet helper med tag `game-${id}` og admin-client for RLS-bypass (cookies fungerer ikke inne i cache-callbacks). Authz beholdes på call-site via `me = players.find(...)` → `notFound()`.

Alle game-side-konsumenter leser fra cachen (hull-page, scorecard, submit, approve, game-home, leaderboard). Mutasjons-server-actions kaller `revalidateTag(\`game-${id}\`, 'max')` (Next.js 16 to-arg-form; single-arg er deprecated). Auto-start-fallback i game-home server-component bruker `after(() => revalidateTag(..., { expire: 0 }))` siden `revalidateTag` kaster under render-fase.

`courses(...)` / `tee_boxes(...)` joins er IKKE cachet — caching ville krevd cross-game fan-out på course-edits. Konsumenter som trenger join-data fetcher det som slim direkte-call parallelt med cached helper.
