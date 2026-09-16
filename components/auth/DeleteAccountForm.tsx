'use client';

import { useRef, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import { deleteOwnAccount } from '@/app/[locale]/profile/slett-konto/actions';

/**
 * «Slett kontoen min for alltid» (#1987) — sister of `LogoutForm`. The one
 * exit that used to leave the deleted user's strokes in the browser's local
 * base.
 *
 * Order is the rule, mirroring the app (`native/app/src/data/account.ts`):
 *  1. best-effort drain of offline strokes (bounded, never blocks),
 *  2. the server delete,
 *  3. ONLY when the action returned `{ ok: true }`: wipe the local base and
 *     the owner stamp, then go to login.
 * A blocked or failed delete redirects server-side back to this page with
 * `?error=` (the action promise rejects and Next follows the redirect), so
 * the wipe below is never reached and nothing local is touched
 * — the account still exists, and so must its strokes.
 *
 * `onSubmit` + `startTransition` instead of `<form action>`: React 19 resets a
 * form action on submit, and the client needs control after the success.
 */
export function DeleteAccountForm({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // A ref, not `isPending`: a second tap can land before the re-render.
  const submitting = useRef(false);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (submitting.current) return;
        submitting.current = true;
        startTransition(async () => {
          const cleanup = await import('@/lib/sync/localDataCleanup');
          await cleanup.drainBeforeDeletionBrowser();
          let result: Awaited<ReturnType<typeof deleteOwnAccount>>;
          try {
            result = await deleteOwnAccount();
          } catch (error) {
            submitting.current = false;
            throw error;
          }
          if (result?.ok !== true) {
            submitting.current = false;
            return;
          }
          await cleanup.finishAccountDeletionBrowser();
          router.replace('/login?melding=konto_slettet');
        });
      }}
    >
      <Button
        type="submit"
        data-testid="delete-account-submit"
        className="w-full"
        style={{ background: 'var(--danger-deep)', borderColor: 'var(--danger-deep)' }}
        pending={isPending}
        pendingLabel={pendingLabel}
      >
        {label}
      </Button>
    </form>
  );
}
