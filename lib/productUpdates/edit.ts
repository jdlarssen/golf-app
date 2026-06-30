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

  const { data, error } = await admin.rpc('edit_product_update', {
    p_id: input.id,
    p_title: input.title,
    p_body: input.body,
    p_link: input.link,
    p_cta_label: input.cta_label,
  });

  if (error) {
    throw new Error(`editProductUpdate: ${error.message}`);
  }

  return { notificationCount: data ?? 0 };
}
