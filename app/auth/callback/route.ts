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
      // Best-effort: mark any pending invitation rows for this user's email
      // as accepted. Allowed by the "invitations self mark accepted" RLS
      // policy (migration 0012). Multiple pending rows can exist for one
      // email — admin UI counts rows, so mark them all. Failure here must
      // never block the redirect; logging in matters more than this stat.
      try {
        const { data: userData } = await supabase.auth.getUser();
        const email = userData?.user?.email;
        if (email) {
          const { error: updateError } = await supabase
            .from('invitations')
            .update({ accepted_at: new Date().toISOString() })
            .ilike('email', email)
            .is('accepted_at', null);
          if (updateError) {
            console.warn(
              '[auth/callback] failed to mark invitation accepted',
              updateError,
            );
          }
        }
      } catch (err) {
        console.warn('[auth/callback] invitation-accept side-effect threw', err);
      }
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // Missing/invalid code → bounce back to login with a generic error.
  return NextResponse.redirect(new URL('/login?error=unknown', request.url));
}
