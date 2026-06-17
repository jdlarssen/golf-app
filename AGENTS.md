<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Before you build: known traps

Most recent prod bugs (#641, #642, #647, #648, #666–#704) came from builders who were confident
they were right. Five traps drove almost all of them. Read `docs/bug-prevention.md` before touching
the DB, scoring, RLS, or any multi-step creation flow. Schema ground-truth snapshot lives in
`docs/schema-ground-truth.md`; Supabase client conventions in `lib/supabase/AGENTS.md`.

1. **Live DB is truth, not the types file.** Hand-recalled schema compiles green and fails in prod — query via Supabase MCP or `npm run gen:types` when in doubt.
2. **0-row write = failure, not success.** PostgREST returns `error == null` for updates that match nothing — chain `.select()` and assert row count, or use the `expectAffected` helper in `lib/supabase/affectedRows.ts`.
3. **RLS is the real authz layer.** A direct PostgREST PATCH bypasses every TS guard — every write needs a matching policy; column-level rules need a trigger. Test with the hostile-PATCH rig (#440).
4. **A rule has one home.** When a limit lives in CHECK + validator + RLS + UI, change all layers in one commit and add a test that asserts they agree.
5. **Creation is atomic-or-compensated.** Multi-step inserts need a rollback or compensating delete; every route needs an `error.tsx` so users never see a raw 500.
