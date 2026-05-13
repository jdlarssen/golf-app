-- Track when an invitee first requests an OTP code (i.e. "opens" the
-- invitation flow). Lets admins distinguish "mail never acted on" from
-- "they started login but didn't finish". NULL = not yet opened.

alter table public.invitations
  add column if not exists opened_at timestamptz default null;
