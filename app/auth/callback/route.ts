import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

// Magic-link callback. Supabase redirects the user here after they click the
// link in their email; we exchange the short-lived `code` for a session
// cookie, then forward them to the originally-requested page (or '/').
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const nextRaw = url.searchParams.get('next') ?? '';
  // Only allow same-origin relative paths to prevent open redirects.
  const next =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';

  if (code) {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // Missing/invalid code → bounce back to login with a generic error.
  return NextResponse.redirect(new URL('/login?error=unknown', request.url));
}
