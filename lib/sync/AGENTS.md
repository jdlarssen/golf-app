# lib/sync — offline-sync og realtime

> Flyttet ordrett fra CLAUDE.md (#2100). Dexie-navnet `'golf-app'` er frosset; den regelen står i CLAUDE.md.

## Offline-sync

Lokal-først via Dexie. `writeScore()` → IndexedDB → sync-kø → `upsert_score_if_newer` RPC. Last-write-wins via `client_updated_at`. Sync-worker drainer kø på online-event, focus, og 30-sek-interval. Realtime sub for live updates fra flight-medlemmer.

## Realtime

⚠️ Realtime: prim auth med argument-løs `await supabase.realtime.setAuth()` FØR du subscriber (#1366). `RealtimeChannel.subscribe()` snapshotter join-payloaden synkront og leser `socket.accessTokenValue` som den står der og da — uten priming joiner første kanal etter en sidelast helt uten token. Argument-løs `setAuth()` henter tokenet via bibliotekets egen `accessToken`-callback (supabase-js kobler den alltid til `auth.getSession()`, som også fornyer et utløpt token) og lar `_manuallySetToken` stå `false`. Send ALDRI tokenet som argument: `setAuth(token)` setter `_manuallySetToken` og skrur AV bibliotekets eget vedlikehold (`_setAuthSafely` no-op-er på connect og heartbeat, join-ok hopper over `socket.setAuth()`). `subscribeRealtimeChannel` (`lib/sync/realtimeChannel.ts`) eier dette — den primer auth, gir `.subscribe()` en statuscallback og bygger kanalen på nytt etter 3 påfølgende `CHANNEL_ERROR`/`TIMED_OUT` (backoff, parkert mens offline). Postgres Changes spilles aldri av på nytt, så en forbruker gir `onResubscribed` og leser tilstanden på nytt når kanalen er `SUBSCRIBED` etter en feil eller en gjenoppbygging (#2093) — ellers står endringer fra utkoblingen aldri på skjermen. supabase-js kaller selv `setAuth(token)` — MED token — på hver `TOKEN_REFRESHED`/`SIGNED_IN`, så `_manuallySetToken` blir uansett `true` i produksjon kort tid etter første token-refresh; nettopp derfor skjer argument-løs priming per kanalbygg (hver `openChannel`), ikke bare én gang ved appstart.
