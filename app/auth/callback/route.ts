import { NextRequest, NextResponse } from 'next/server';

// Magic-link URL flow was retired 2026-05-13 in favor of OTP-code login.
// This route stays for ~30 days to redirect stale magic-link clicks
// gracefully. Delete the route after 2026-06-13 (tracked in TODO.md).
export async function GET(request: NextRequest) {
  return NextResponse.redirect(
    new URL('/login?error=link_expired', request.url),
  );
}
