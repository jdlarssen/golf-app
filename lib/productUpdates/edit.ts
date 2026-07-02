import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Edit a published product update (#993).
 *
 * Delegates to the `edit_product_update` RPC so the source row and every
 * already-sent notification copy (matched on payload.source_id) are corrected
 * in ONE transaction — no partial-write window (AGENTS.md trap #5). The RPC
 * also keeps the jsonb key-removal logic (clearing link/cta_label) in one
 * place, and is callable by service_role only.
 *
 * `read_at` / `archived_at` are never touched: a fix is a silent correction,
 * not a re-announcement (owner decision, #993).
 *
 * Returns the number of notification rows that were corrected (0 is legitimate
 * for a launch published before anyone existed to notify).
 */
export type EditProductUpdateInput = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  cta_label: string | null;
};

export type EditProductUpdateResult = {
  notificationCount: number;
};

export async function editProductUpdate(
  input: EditProductUpdateInput,
): Promise<EditProductUpdateResult> {
  const admin = getAdminClient();

  // gen:types emits plain `text` RPC args as non-null `string`, but the RPC
  // body explicitly branches on `p_link is not null` / `p_cta_label is not
  // null` — SQL null is a valid, meaning-bearing input (clears the field in
  // the notification payload). The casts preserve that runtime contract
  // without hand-widening the generated types (drift gate #673 diffs them
  // against gen:types output verbatim).
  const { data, error } = await admin.rpc('edit_product_update', {
    p_id: input.id,
    p_title: input.title,
    p_body: input.body,
    p_link: input.link as string,
    p_cta_label: input.cta_label as string,
  });

  if (error) {
    throw new Error(`editProductUpdate: ${error.message}`);
  }

  return { notificationCount: data ?? 0 };
}
