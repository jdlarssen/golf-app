-- 0246: the monthly newsletter claims its month before it sends, and remembers
-- each recipient it reached.
--
-- Before: the sender looked for a row for the month, sent to everyone, and only
-- then wrote the row. Two runs at once both sent, a failed lookup looked like
-- "not sent", and a recipient whose send failed was never tried again because
-- the row closed the month anyway.
--
-- After:
--   product_update_digests          one row per month, inserted BEFORE sending
--                                   (UNIQUE (period_start, period_end) is the
--                                   lock). completed_at is set once a run ends
--                                   with no failed send.
--   product_update_digest_recipients one row per recipient reached. The row is
--                                   inserted before that one send (the primary
--                                   key makes two runs skip each other) and
--                                   deleted again when the send fails, so the
--                                   next run tries that recipient again.
--
-- Both tables are written only by the cron route with the service role. RLS is
-- on with no policies, as for product_update_digests since 0035.

alter table public.product_update_digests
  add column if not exists completed_at timestamptz;

-- Every month sent before this migration is finished.
update public.product_update_digests
   set completed_at = sent_at
 where completed_at is null;

alter table public.product_update_digests
  alter column recipient_count set default 0;

create table if not exists public.product_update_digest_recipients (
  digest_id uuid not null references public.product_update_digests(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (digest_id, user_id)
);

-- FK index hygiene (0091): the user_id side of the key needs its own index.
create index if not exists product_update_digest_recipients_user_id_idx
  on public.product_update_digest_recipients(user_id);

alter table public.product_update_digest_recipients enable row level security;
revoke all on public.product_update_digest_recipients from anon, authenticated;
