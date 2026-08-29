'use client';

import { useCallback, useState } from 'react';
import {
  resolveVisibleNudge,
  type NudgeSlotId,
  type NudgeSlotStatuses,
} from '@/lib/home/nudgeQueue';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { PushNudge } from '@/components/pwa/PushNudge';
import { PasskeyEnrollmentPrompt } from '@/components/passkey/PasskeyEnrollmentPrompt';
import { ProductUpdateBannerClient } from '@/components/products/ProductUpdateBannerClient';

export type ProductUpdateNudge = {
  notificationId: string;
  title: string;
  body: string;
  link: string | null;
  ctaLabel: string | null;
};

/**
 * Klient-orkestratoren for nudge-køen på Hjem (#1797, kontrakt #1069 K6).
 * Server-avgjorte fakta (produktnytt + passkey-utrulling) kommer som props fra
 * `HomeNudges`; Install/Push/Passkey avklarer seg selv i klienten og melder
 * verdikt via `onVerdict`. `resolveVisibleNudge` peker ut plassen som vises.
 *
 * Låsen: første plass som vises beholder plassen ut sidevisningen. En lavere
 * nudge blir aldri byttet ut av en høyere som kvalifiserer sent (det ville
 * vært banner-byttingen kontrakten forbyr), og en dismiss forfremmer ikke
 * nestemann før neste sidelast — å lukke ett banner skal ikke åpne et nytt.
 */
export function HomeNudgeRail({
  productUpdate,
  passkeyEligible,
}: {
  productUpdate: ProductUpdateNudge | null;
  passkeyEligible: boolean;
}) {
  const [statuses, setStatuses] = useState<NudgeSlotStatuses>({
    install: 'pending',
    push: 'pending',
    // Server-decided slots start resolved — no client probe needed.
    productUpdate: productUpdate ? 'yes' : 'no',
    passkey: passkeyEligible ? 'pending' : 'no',
  });
  const [latched, setLatched] = useState<NudgeSlotId | null>(null);

  const report = useCallback((slot: NudgeSlotId, qualified: boolean) => {
    setStatuses((prev) => {
      const next = qualified ? 'yes' : 'no';
      if (prev[slot] === next) return prev;
      return { ...prev, [slot]: next };
    });
  }, []);

  const reportInstall = useCallback(
    (q: boolean) => report('install', q),
    [report],
  );
  const reportPush = useCallback((q: boolean) => report('push', q), [report]);
  const reportPasskey = useCallback(
    (q: boolean) => report('passkey', q),
    [report],
  );

  const resolved = resolveVisibleNudge(statuses);
  // Render-adjust (React's «adjusting state during render» pattern) so the
  // latch lands in the same render that first resolves a winner — no
  // one-frame window where a later report could swap the visible slot.
  if (latched === null && resolved !== null) {
    setLatched(resolved);
  }
  const visible = latched ?? resolved;

  return (
    <>
      <InstallBanner
        visible={visible === 'install'}
        onVerdict={reportInstall}
      />
      <PushNudge visible={visible === 'push'} onVerdict={reportPush} />
      {productUpdate && visible === 'productUpdate' && (
        <ProductUpdateBannerClient
          notificationId={productUpdate.notificationId}
          title={productUpdate.title}
          body={productUpdate.body}
          link={productUpdate.link}
          ctaLabel={productUpdate.ctaLabel}
        />
      )}
      {passkeyEligible && (
        <PasskeyEnrollmentPrompt
          visible={visible === 'passkey'}
          onVerdict={reportPasskey}
        />
      )}
    </>
  );
}
