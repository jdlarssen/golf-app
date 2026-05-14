# Tørny Morning Report

You are the Tørny morning report agent. You run once per day at 08:00
Europe/Oslo on the scheduled-tasks infrastructure. Your job is to read the
last 24 hours of `agent_findings`, render a summary mail via
`lib/agent-monitor/morning-mail.ts`, and send it via Resend. Quiet days =
no mail, no row in `agent_runs`.

## Env vars used in this run

The following must be available in the execution environment:

- `MONITORING_ENABLED` — kill-switch, sourced from Vercel project env
- `RESEND_API_KEY` — Resend bearer token, sourced from Vercel project env

Project IDs:

- Supabase project id: `glofubopddkjhymcbaph` (hardcoded)

## Shell-variable conventions

All shell snippets below assume `$run_id` (UUID) and `$started_at_iso` (ISO
timestamp string) have been exported into the shell environment after
Step 2. Use `export run_id=<value>` and `export started_at_iso=<value>` so
later snippets can reference them without re-fetching.

## Variable substitution for SQL queries

When you pass SQL to `mcp__36be25a6-2d72-41c3-a675-2352133ed510__execute_sql`, you MUST substitute shell variables in the query string before sending. The MCP tool does NOT do shell expansion.

Example — wrong:
```
query: "delete from agent_runs where id = '$run_id'"
```
This would search for the literal string `$run_id`.

Example — right:
```
query: `delete from agent_runs where id = '${run_id}'`
```
Build the query string in your code/shell with the variable value already interpolated.

For UUIDs (`${run_id}`), validate they match `[0-9a-f-]+`. For integer counts
(`${fixed_count}`, `${pending_count}`, `${needs_judgment_count}`,
`${total_count}`), validate they're numeric before interpolation. For
free-text fields like `${notes}`, escape single quotes (`'` → `''`) before
interpolating to prevent breaking the query. For ISO timestamps, they come
from Postgres so are trusted.

## Step 1: Kill-switch

FIRST: read the env var `MONITORING_ENABLED`. If it is `"false"`, EXIT
immediately. Do nothing else — including writing to `agent_runs`. The
morning report is silent when disabled (no row clutter from killswitch
heartbeats).

## Step 2: Initialize run row

Insert a row into `agent_runs` so we have a `run_id` to reference. The
`agent_runs` schema is `(id, ran_at, agent_kind, duration_ms,
findings_count, notes)` — there is no `started_at`/`ended_at`, just `ran_at`
(default `now()`) which we capture to compute duration in Step 7:

```sql
insert into agent_runs (agent_kind)
values ('morning_report')
returning id, ran_at;
```

Use `mcp__36be25a6-2d72-41c3-a675-2352133ed510__execute_sql`. Capture both
returned values: `id` as `$run_id`, `ran_at` as `$started_at_iso` (the ISO
timestamp string of when the row was created). Reference both throughout
the rest of the run.

Note: Step 8 will DELETE this row if the run was a no-op (no findings to
report). Step 7 will UPDATE the row when we actually send a mail.

## Step 3: Query findings

Use `mcp__36be25a6-2d72-41c3-a675-2352133ed510__execute_sql` to fetch
findings from the last 24 hours, ordered chronologically. We pull
`time` already formatted in Europe/Oslo so we don't have to re-do timezone
arithmetic in shell:

```sql
select
  to_char(detected_at at time zone 'Europe/Oslo', 'HH24:MI') as time,
  source,
  severity,
  summary,
  action_taken,
  action_ref,
  fingerprint
from public.agent_findings
where detected_at > now() - interval '24 hours'
  and action_taken in ('auto_pushed', 'pr_opened', 'reported')
order by detected_at asc;
```

If the result set is empty → goto Step 8 (delete the Step-2 row and exit
silently). No mail is sent on quiet days.

## Step 4: Build mail input

Group the rows from Step 3 by `action_taken`:

- `'auto_pushed'` → `fixed[]` — `refType: 'commit'`, `ref: row.action_ref`
  (commit SHA)
- `'pr_opened'` → `pending[]` — `refType: 'pr'`, `ref: row.action_ref`
  (PR number as string)
- `'reported'` → `needsJudgment[]` — `refType: 'commit'` (ignored by the
  renderer for these entries since they aren't linked, but supply a value
  to satisfy the type; pass empty string `''` as `ref`)

Each `FindingRow` object needs `{ time, summary, ref, refType }` per
`lib/agent-monitor/morning-mail.ts:7-12`. The `time` value already comes
back from the SQL formatted as `"HH:MM"` in Europe/Oslo (Step 3 query).

Then query total errors logged in the last 24 hours from `agent_runs`
(sum of `findings_count` across hourly runs):

```sql
select coalesce(sum(findings_count), 0)::int as total_errors
from public.agent_runs
where ran_at > now() - interval '24 hours'
  and agent_kind = 'hourly';
```

Capture as `$total_errors`. We don't track distinct affected users yet, so
`totalUsersAffected` is hardcoded to `0` — leave a follow-up note in
`TODO.md` if that surfaces a need later.

## Step 5: Render mail

Call the renderer via `npx tsx -e`. Build the JSON arrays for `fixed`,
`pending`, and `needsJudgment` from the grouped rows in Step 4. Use `jq`
or a shell heredoc to assemble the JSON safely (so embedded quotes in
`summary` don't break the inline TypeScript):

```bash
# Assemble the input JSON via jq (assumes you've collected rows into
# fixed_rows.json, pending_rows.json, needs_rows.json as JSON arrays):
INPUT_JSON=$(jq -n \
  --slurpfile fixed /tmp/fixed-$run_id.json \
  --slurpfile pending /tmp/pending-$run_id.json \
  --slurpfile needs /tmp/needs-$run_id.json \
  --argjson total_errors "$total_errors" \
  '{
    fixed: $fixed[0],
    pending: $pending[0],
    needsJudgment: $needs[0],
    totalErrorsLogged: $total_errors,
    totalUsersAffected: 0
  }')

echo "$INPUT_JSON" > /tmp/mail-input-$run_id.json

npx tsx -e "
import { renderMorningMail } from './lib/agent-monitor/morning-mail';
import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync('/tmp/mail-input-${run_id}.json', 'utf8'));
const mail = renderMorningMail(input);
if (mail === null) {
  console.error('renderer returned null — should not happen, counts already checked');
  process.exit(2);
}
console.log(JSON.stringify(mail));
" > /tmp/mail-$run_id.json
```

If the renderer exits with code 2 (null return — shouldn't happen since
Step 3 already filtered empty result sets) → goto Step 8.

## Step 6: Send via Resend

Pull the rendered `subject`, `html`, and `text` out of the mail JSON and
POST to Resend. We use `jq -n` with `--arg` to build the request body so
embedded quotes in subject/html/text don't escape into the JSON
incorrectly:

```bash
SUBJECT=$(jq -r '.subject' /tmp/mail-$run_id.json)
HTML=$(jq -r '.html' /tmp/mail-$run_id.json)
TEXT=$(jq -r '.text' /tmp/mail-$run_id.json)

RESPONSE=$(curl -sS https://api.resend.com/emails \
  -H "Authorization: Bearer ${RESEND_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg subject "$SUBJECT" \
    --arg html "$HTML" \
    --arg text "$TEXT" \
    '{
      from: "Tørny Agent <agent@tornygolf.no>",
      to: "eier@example.com",
      subject: $subject,
      html: $html,
      text: $text
    }')")

echo "$RESPONSE" > /tmp/resend-response-$run_id.json

if echo "$RESPONSE" | jq -e '.id' >/dev/null 2>&1; then
  SEND_OK=true
else
  SEND_OK=false
  echo "Resend send failed: $RESPONSE" >&2
fi
```

If `$SEND_OK == false`, still UPDATE the run row in Step 7 but flip the
notes to record the failure (so the operator can see *why* the morning
mail didn't arrive). Do NOT delete the run row on send-failure — we want
the record to exist for postmortem.

## Step 7: Update agent_runs

Compute totals:
- `${fixed_count}` = `fixed.length`
- `${pending_count}` = `pending.length`
- `${needs_judgment_count}` = `needsJudgment.length`
- `${total_count}` = sum of the three

Notes — short Norwegian summary. On success:

> `"Sendte mail med ${fixed_count} fixet, ${pending_count} PR ventende, ${needs_judgment_count} til vurdering."`

On Resend send-failure:

> `"Resend send feilet — ${fixed_count} fixet, ${pending_count} PR ventende, ${needs_judgment_count} til vurdering rapportert i agent_findings men mail nådde ikke fram."`

UPDATE the row inserted in Step 2. Compute `duration_ms` server-side from
`$started_at_iso` so everything stays on the database's clock:

```sql
update agent_runs
set duration_ms = extract(epoch from (now() - '${started_at_iso}'::timestamptz)) * 1000,
    findings_count = ${total_count},
    notes = '${notes}'
where id = '${run_id}';
```

## Step 8: Quiet-day exit

Reached only if Step 3 returned no rows, or if the renderer unexpectedly
returned null in Step 5. Delete the Step-2 row so the `agent_runs` table
stays clean on quiet days:

```sql
delete from public.agent_runs where id = '${run_id}';
```

Then exit silently (no mail). The morning report only writes rows on days
where it actually surfaced something.

## Step 9: Cleanup

Always remove the temp JSON files at the end of every run, regardless of
which path was taken:

```bash
rm -f /tmp/mail-input-$run_id.json \
      /tmp/mail-$run_id.json \
      /tmp/fixed-$run_id.json \
      /tmp/pending-$run_id.json \
      /tmp/needs-$run_id.json \
      /tmp/resend-response-$run_id.json
```
