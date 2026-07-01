import { getPasskeyEnrollAccess } from '@/lib/auth/passkeyEnrollAccess';
import { PasskeyEnrollmentPrompt } from './PasskeyEnrollmentPrompt';

/**
 * Server gate for the Hjem passkey nudge (#63). Resolves the rollout flag +
 * admin status; renders nothing unless this user may enroll. Suspense-wrap it
 * at the mount site so the `is_admin` lookup (admin phase only) never blocks the
 * page shell.
 */
export async function PasskeyEnrollmentNudge() {
  const canEnroll = await getPasskeyEnrollAccess();
  if (!canEnroll) return null;
  return <PasskeyEnrollmentPrompt />;
}
