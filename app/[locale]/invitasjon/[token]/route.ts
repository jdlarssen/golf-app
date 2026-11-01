import type { NextRequest } from 'next/server';
import { linkRedirect } from '@/lib/appLinks/linkRedirect';
import { isInviteToken } from '@/lib/auth/getInviteLoginContext';

/**
 * The link in the invitation mail (#2748). With the app it opens the round there,
 * since the app claims this path (`lib/appLinks/appLinkPaths.ts`). Without the app
 * the browser comes here and goes on to the login with the invitation card, the
 * same page the mail used to link to. `/login` itself can't be claimed: the app
 * would then take every login link.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await ctx.params;
  if (!isInviteToken(token)) return linkRedirect(request, locale, '/login');

  const query = new URLSearchParams();
  const email = request.nextUrl.searchParams.get('email');
  if (email) query.set('email', email);
  query.set('invite', token);
  return linkRedirect(request, locale, `/login?${query.toString()}`);
}
