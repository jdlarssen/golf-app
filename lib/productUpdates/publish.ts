import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';

/**
 * Publish a product update (issue #202).
 *
 * Inserts authoritative row in product_updates, then fan-outs an in-app
 * notification (kind 'product_update') to every user. Fan-out is best-effort
 * per recipient via Promise.allSettled — a single failed notify never blocks
 * the rest, and never undoes the product_updates insert.
 *
 * Returns the new product_updates.id + fan-out stats so the admin UI can
 * surface "Lanseringen er ute hos N brukere"-toasts.
 */
export type PublishProductUpdateInput = {
  title: string;
  body: string;
  link?: string | null;
  cta_label?: string | null;
  createdByUserId: string;
};

export type PublishProductUpdateResult = {
  id: string;
  recipientCount: number;
  failedCount: number;
};

export async function publishProductUpdate(
  input: PublishProductUpdateInput,
): Promise<PublishProductUpdateResult> {
  const admin = getAdminClient();

  const linkValue =
    input.link != null && input.link.trim() !== '' ? input.link.trim() : null;
  const ctaValue =
    input.cta_label != null && input.cta_label.trim() !== ''
      ? input.cta_label.trim()
      : null;

  const { data: inserted, error: insertErr } = await admin
    .from('product_updates')
    .insert({
      title: input.title.trim(),
      body: input.body.trim(),
      link: linkValue,
      cta_label: ctaValue,
      created_by: input.createdByUserId,
    })
    .select('id')
    .single<{ id: string }>();

  if (insertErr || !inserted) {
    throw new Error(
      `publishProductUpdate: insert failed — ${insertErr?.message ?? 'no row returned'}`,
    );
  }

  const productUpdateId = inserted.id;

  const { data: users } = await admin
    .from('users')
    .select('id')
    .returns<{ id: string }[]>();

  const userIds = (users ?? []).map((u) => u.id);

  const settled = await Promise.allSettled(
    userIds.map((userId) =>
      notify({
        userId,
        kind: 'product_update',
        payload: {
          source_id: productUpdateId,
          title: input.title.trim(),
          body: input.body.trim(),
          ...(linkValue ? { link: linkValue } : {}),
          ...(ctaValue ? { cta_label: ctaValue } : {}),
        },
      }),
    ),
  );

  let failedCount = 0;
  for (const result of settled) {
    if (result.status === 'rejected') {
      failedCount += 1;
      console.error('[publishProductUpdate] notify failed', result.reason);
    }
  }

  return {
    id: productUpdateId,
    recipientCount: userIds.length - failedCount,
    failedCount,
  };
}
