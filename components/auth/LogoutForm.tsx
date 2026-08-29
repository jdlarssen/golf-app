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
 * #1790: samme runde rydder enhetens push-kobling for kontoen som logger ut
 * (server-rad + browser-abonnement + husket APNs-token), mens sesjonen ennå er
 * gyldig. Callbacken injiseres her — formen kan importere server-actions,
 * `lib/sync/` skal ikke. Best-effort inne i samme race: får ikke ryddingen
 * fullført, reddes neste konto av 42501-fallbacken i registreringen.
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
            const [cleanup, push, pushActions, apnsActions] = await Promise.all([
              import('@/lib/sync/localDataCleanup'),
              import('@/lib/pwa/push'),
              import('@/app/[locale]/profile/pushActions'),
              import('@/app/[locale]/profile/apnsActions'),
            ]);
            await cleanup.prepareLogoutBrowser(() =>
              push.disablePush(
                pushActions.removePushSubscription,
                apnsActions.removeApnsToken,
              ),
            );
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
