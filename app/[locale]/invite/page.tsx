import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';

/**
 * The invite-a-friend form moved inline onto /profile so the user
 * doesn't get bounced off the page they were on. This route stays as a
 * permanent redirect so any old links/bookmarks/email references still
 * land somewhere useful.
 */
export default async function InviteRedirect() {
  const locale = await getLocale();
  redirect({ href: '/profile', locale });
}
