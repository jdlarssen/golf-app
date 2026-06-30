-- Edit a published product update (#993) — atomic dual-write.
--
-- Why: /admin/lanseringer can publish a launch (one product_updates row + a
-- fan-out of a 'product_update' notification to every user, each carrying a
-- COPY of title/body/link/cta_label in payload, tagged with
-- payload.source_id = product_updates.id). There was no way to fix a published
-- launch: the /foreslaa_ide typo (2026-06-30) shipped a broken CTA link to
-- everyone and had to be patched by hand in BOTH places. This function is the
-- atomic correction — it updates the source row and every already-sent
-- notification copy in one transaction.
--
-- Design notes:
--   - SILENT correction: read_at / archived_at are never touched, so a fix
--     does not re-surface a dismissed banner (owner decision, #993).
--   - ALL copies: every notification matched on payload.source_id is updated,
--     including read + archived, so a fixed link is correct everywhere it can
--     still be opened.
--   - link / cta_label are REMOVED from payload when cleared (mirrors the
--     publish fan-out, which omits empty keys; the payload Zod schema treats
--     them as optional, not nullable).
--   - service_role only: called from the admin-client server action. anon /
--     authenticated cannot execute it, so a hostile direct RPC can't edit
--     launches (product_updates has no UPDATE policy either).
--   - Raises product_update_not_found if no source row matches, rolling back
--     the whole transaction (atomic-or-nothing).

create or replace function public.edit_product_update(
  p_id uuid,
  p_title text,
  p_body text,
  p_link text,
  p_cta_label text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_rows integer;
  v_notif_rows integer;
begin
  update public.product_updates
  set title = p_title,
      body = p_body,
      link = p_link,
      cta_label = p_cta_label
  where id = p_id;

  get diagnostics v_source_rows = row_count;
  if v_source_rows = 0 then
    raise exception 'product_update_not_found';
  end if;

  update public.notifications
  set payload =
        (payload - 'link' - 'cta_label')
        || jsonb_build_object('title', p_title, 'body', p_body)
        || case when p_link is not null
                then jsonb_build_object('link', p_link) else '{}'::jsonb end
        || case when p_cta_label is not null
                then jsonb_build_object('cta_label', p_cta_label) else '{}'::jsonb end
  where kind = 'product_update'
    and payload->>'source_id' = p_id::text;

  get diagnostics v_notif_rows = row_count;
  return v_notif_rows;
end;
$$;

revoke all on function public.edit_product_update(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.edit_product_update(uuid, text, text, text, text)
  to service_role;
