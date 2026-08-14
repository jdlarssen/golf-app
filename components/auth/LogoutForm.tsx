'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

/**
 * «Logg ut»-formen på profil-siden (#1404). Før POST-en til /logout kjøres
 * en best-effort drain av sync-køen og — kun når køen da er tom — en tømming
 * av de lokale tabellene, så en delt enhet står ren for nestemann. Racet mot
 * en kort timeout i `prepareLogoutBrowser`, så utloggingen aldri henger på
 * nettet; beholdt data dekkes av eierbytte-vakta i SyncBoot.
 *
 * Native `form.submit()` re-trigger IKKE onSubmit, så den programmatiske
 * innsendingen etter oppryddingen løper rett til route-handleren.
 */
export function LogoutForm({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [cleaning, setCleaning] = useState(false);

  return (
    <form
      ref={formRef}
      action="/logout"
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        if (cleaning) return;
        setCleaning(true);
        void (async () => {
          try {
            const cleanup = await import('@/lib/sync/localDataCleanup');
            await cleanup.prepareLogoutBrowser();
          } catch {
            // Best-effort — utloggingen skal aldri blokkeres av opprydding.
          }
          formRef.current?.submit();
        })();
      }}
    >
      {/* Button direkte (ikke SubmitButton): useFormStatus fyrer aldri for en
          nativ URL-action, så pending drives av oppryddings-tilstanden. */}
      <Button
        type="submit"
        variant="secondary"
        className="w-full"
        pending={cleaning}
        pendingLabel={pendingLabel}
      >
        {label}
      </Button>
    </form>
  );
}
