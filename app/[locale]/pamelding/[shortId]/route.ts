import { NextResponse, type NextRequest } from 'next/server';
import { isSignupShortId } from '@/lib/appLinks/appLinkPaths';
import { linkRedirect } from '@/lib/appLinks/linkRedirect';

/**
 * The signup link an organiser shares (#2748). With the app it opens the round
 * there, since the app claims this path (`lib/appLinks/appLinkPaths.ts`). Without
 * the app the browser comes here and goes on to `/signup/<shortId>`, with the page's
 * `og:` fields for a link preview. `/signup/*` itself can't be claimed: the app sends
 * players there for what it doesn't do, teams and picking a side.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ locale: string; shortId: string }> },
) {
  const { locale, shortId } = await ctx.params;
  if (!isSignupShortId(shortId)) return new NextResponse(null, { status: 404 });

  const src = request.nextUrl.searchParams.get('src');
  const query = src ? `?${new URLSearchParams({ src }).toString()}` : '';
  return linkRedirect(request, locale, `/signup/${shortId}${query}`);
}
