'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';

// Step 1 of two-step OTP login. Verifies the email is either registered
// (existing user) or has an open invitation, then asks Supabase to send a
// 6-digit code. Existing users are detected implicitly: shouldCreateUser
// is gated on whether the email has an open invitation row, and Supabase
// reports an error for unknown emails when shouldCreateUser=false — we
// map that to user_not_found.
export async function sendCode(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const nextRaw = String(formData.get('next') ?? '').trim();
  const next =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '';

  // Honeypot — the `website` field is hidden via CSS/tabindex/aria so real
  // users never see it. Form-filling bots typically populate every input that
  // looks plausibly relevant, including hidden ones. If we see a value, we
  // pretend success (redirect to the verify step) without calling Supabase,
  // so the bot can't distinguish a hit from a miss. Logged to Vercel for
  // traffic awareness only — no DB write.
  const honeypot = String(formData.get('website') ?? '').trim();
  if (honeypot) {
    console.warn('[honeypot] silent reject', { route: 'login' });
    const qs = new URLSearchParams({ step: 'verify', email });
    if (next) qs.set('next', next);
    redirect(`/login?${qs.toString()}`);
  }

  if (!email) {
    redirect('/login?error=unknown');
  }

  const supabase = await getServerClient();

  const { data: isInvited } = await supabase.rpc('email_is_invited', {
    check_email: email,
  });
  const shouldCreateUser = Boolean(isInvited);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser },
  });

  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    let code: 'rate_limited' | 'user_not_found' | 'unknown' = 'unknown';
    if (
      msg.includes('rate') ||
      msg.includes('too many') ||
      msg.includes('security purposes')
    ) {
      code = 'rate_limited';
    } else if (
      msg.includes('not found') ||
      msg.includes('signups not allowed') ||
      msg.includes('signups are disabled') ||
      msg.includes('otp_disabled') ||
      msg.includes('disabled')
    ) {
      code = 'user_not_found';
    }
    redirect(`/login?error=${code}`);
  }

  // Best-effort: stamp opened_at on the matching pending invitation row so
  // admins can see "has requested a code" vs "mail never acted on".
  // Uses the service-role client because the user has no session yet at this
  // point — RLS cannot grant write access to a pre-auth visitor.
  // We only set it once (is null guard), so repeated OTP requests don't
  // overwrite the first-open timestamp.
  try {
    const adminClient = getAdminClient();
    await adminClient
      .from('invitations')
      .update({ opened_at: new Date().toISOString() })
      .ilike('email', email)
      .is('accepted_at', null)
      .is('opened_at', null);
  } catch (err) {
    console.error('[login/sendCode] opened_at stamp failed', err);
  }

  const qs = new URLSearchParams({ step: 'verify', email });
  if (next) qs.set('next', next);
  redirect(`/login?${qs.toString()}`);
}

// Step 2: verify the 6-digit code, set the session cookie, mark any
// pending invitation rows for this email as accepted (replaces the
// side-effect that lived in /auth/callback), and redirect to next
// destination.
export async function verifyCode(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const token = String(formData.get('token') ?? '').trim();
  const nextRaw = String(formData.get('next') ?? '').trim();
  const next =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';

  if (!email || !token) {
    const qs = new URLSearchParams({
      step: 'verify',
      email,
      error: 'code_invalid',
    });
    redirect(`/login?${qs.toString()}`);
  }

  const supabase = await getServerClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    const code = msg.includes('expired') ? 'code_expired' : 'code_invalid';
    const qs = new URLSearchParams({ step: 'verify', email, error: code });
    redirect(`/login?${qs.toString()}`);
  }

  // Mark any pending invitation rows for this email as accepted. Best-effort:
  // never block login on failure. Allowed by RLS policy 0012 ("invitations
  // self mark accepted") since auth.jwt() ->> 'email' is populated post-
  // verifyOtp.
  try {
    await supabase
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .ilike('email', email)
      .is('accepted_at', null);
  } catch (err) {
    console.warn('[login/verifyCode] invitation-accept side-effect threw', err);
  }

  redirect(next);
}
