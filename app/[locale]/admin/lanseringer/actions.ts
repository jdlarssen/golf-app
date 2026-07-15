'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { publishProductUpdate } from '@/lib/productUpdates/publish';
import { editProductUpdate } from '@/lib/productUpdates/edit';
import { validateProductUpdateInput } from '@/lib/productUpdates/validateUpdateInput';
import type { AppLocale } from '@/i18n/routing';

/**
 * Self-gate + return `{ userId }` for the lanseringer-actions. Wraps the
 * shared `requireAdmin` helper so each action keeps its existing
 * destructure-shape. Prepares for Fase 4 chunk 2 (#223) lifting the
 * admin-layout-gate.
 */
async function loadAdminContext() {
  const supabase = await getServerClient();
  const role = await requireAdmin(supabase);
  return { userId: role.userId };
}

export async function publishProductUpdateAction(formData: FormData) {
  const locale = (await getLocale()) as AppLocale;
  const { userId } = await loadAdminContext();

  const parsed = validateProductUpdateInput({
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
    link: String(formData.get('link') ?? ''),
    cta_label: String(formData.get('cta_label') ?? ''),
  });
  if (!parsed.ok) {
    redirect({ href: `/admin/lanseringer?error=${parsed.error}`, locale });
    throw new Error('unreachable'); // redirect() threw; narrows parsed below.
  }

  try {
    const result = await publishProductUpdate({
      ...parsed.value,
      createdByUserId: userId,
    });

    revalidatePath('/admin/lanseringer');
    redirect({
      href: `/admin/lanseringer?published=1&recipients=${result.recipientCount}`,
      locale,
    });
  } catch (err) {
    // redirect() i Next.js kaster en spesiell error som vi MÅ slippe gjennom.
    if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
      throw err;
    }
    console.error('[publishProductUpdateAction]', err);
    redirect({ href: '/admin/lanseringer?error=publish_failed', locale });
  }
}

export async function editProductUpdateAction(formData: FormData) {
  const locale = (await getLocale()) as AppLocale;
  await loadAdminContext();

  const id = String(formData.get('id') ?? '').trim();
  if (!id) {
    redirect({ href: '/admin/lanseringer?error=edit_failed', locale });
    throw new Error('unreachable');
  }

  const parsed = validateProductUpdateInput({
    title: String(formData.get('title') ?? ''),
    body: String(formData.get('body') ?? ''),
    link: String(formData.get('link') ?? ''),
    cta_label: String(formData.get('cta_label') ?? ''),
  });
  if (!parsed.ok) {
    redirect({ href: `/admin/lanseringer/${id}/rediger?error=${parsed.error}`, locale });
    throw new Error('unreachable');
  }

  try {
    const result = await editProductUpdate({ id, ...parsed.value });

    revalidatePath('/admin/lanseringer');
    redirect({
      href: `/admin/lanseringer?edited=1&notifs=${result.notificationCount}`,
      locale,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
      throw err;
    }
    console.error('[editProductUpdateAction]', err);
    redirect({ href: `/admin/lanseringer/${id}/rediger?error=edit_failed`, locale });
  }
}
