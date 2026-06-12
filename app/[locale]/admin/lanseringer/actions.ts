'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { publishProductUpdate } from '@/lib/productUpdates/publish';
import { sendDigestForPeriod } from '@/lib/productUpdates/digest';
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

  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const linkRaw = String(formData.get('link') ?? '').trim();
  const ctaRaw = String(formData.get('cta_label') ?? '').trim();

  if (!title) redirect({ href: '/admin/lanseringer?error=title_required', locale });
  if (!body) redirect({ href: '/admin/lanseringer?error=body_required', locale });

  // Link, if present, must be internal (starts with '/') — same guard
  // the Zod schema enforces for the notification payload.
  if (linkRaw && !linkRaw.startsWith('/')) redirect({ href: '/admin/lanseringer?error=link_must_be_internal', locale });

  // cta_label only meaningful with a link
  if (ctaRaw && !linkRaw) redirect({ href: '/admin/lanseringer?error=cta_without_link', locale });

  try {
    const result = await publishProductUpdate({
      title,
      body,
      link: linkRaw || null,
      cta_label: ctaRaw || null,
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

export async function sendDigestNowAction() {
  const locale = (await getLocale()) as AppLocale;
  const { userId } = await loadAdminContext();

  try {
    const result = await sendDigestForPeriod({ sentByUserId: userId });
    revalidatePath('/admin/lanseringer');

    if (result.kind === 'already_sent') {
      redirect({ href: '/admin/lanseringer?digest=already_sent', locale });
    }
    if (result.kind === 'no_updates') {
      redirect({ href: '/admin/lanseringer?digest=no_updates', locale });
    }
    // TypeScript cannot narrow past next-intl redirect (not declared `never`);
    // assert the `sent` branch explicitly after the two guard redirects above.
    const sent = result as Extract<typeof result, { kind: 'sent' }>;
    redirect({
      href: `/admin/lanseringer?digest=sent&recipients=${sent.recipientCount}&updates=${sent.updateCount}`,
      locale,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
      throw err;
    }
    console.error('[sendDigestNowAction]', err);
    redirect({ href: '/admin/lanseringer?error=digest_failed', locale });
  }
}
