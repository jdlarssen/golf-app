import { NextResponse, type NextRequest } from 'next/server';
import { isRoundLinkSubpage } from '@/lib/appLinks/appLinkPaths';
import { linkRedirect } from '@/lib/appLinks/linkRedirect';
import { isUuid } from '@/lib/url/isUuid';

/**
 * The links in the mails about a round (#2748). With the app they open the same
 * screen as the push notification, since the app claims this path
 * (`lib/appLinks/appLinkPaths.ts`). Without the app the browser comes here and goes
 * on to `/games/...`, where the proxy handles the login as it always has.
 * `/games/*` itself can't be claimed: the app's own buttons open those pages in the
 * browser, and Android can't claim `/games/<id>` without every page under it.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ locale: string; id: string; rest?: string[] }> },
) {
  const { locale, id, rest } = await ctx.params;
  const subpage = (rest ?? []).join('/');
  if (!isUuid(id) || !isRoundLinkSubpage(subpage)) return new NextResponse(null, { status: 404 });

  const path = `/games/${id}${subpage ? `/${subpage}` : ''}`;
  return linkRedirect(request, locale, `${path}${request.nextUrl.search}`);
}
