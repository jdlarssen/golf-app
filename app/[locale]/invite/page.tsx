import { redirect } from 'next/navigation';

/**
 * The invite-a-friend form moved inline onto /profile so the user
 * doesn't get bounced off the page they were on. This route stays as a
 * permanent redirect so any old links/bookmarks/email references still
 * land somewhere useful.
 */
export default function InviteRedirect() {
  redirect('/profile');
}
