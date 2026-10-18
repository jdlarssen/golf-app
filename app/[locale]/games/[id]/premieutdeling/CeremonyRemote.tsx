'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { setLiveFollow } from '@/lib/games/spectate';
import { setCeremonyStep } from './actions';

export interface RemoteStep {
  /** The tap that shows this step: «Vis 3. plass», «Avslør vinneren». */
  button: string;
  /** «Neste: 2. plass · Jonas Berg · 36 poeng». */
  next: string;
  /** «Vises nå: 2. plass». */
  now: string;
}

export interface RemoteLabels {
  start: string;
  back: string;
  restart: string;
  close: string;
  nowHidden: string;
  notStarted: string;
  allShown: string;
  error: string;
}

/**
 * The organiser's remote for the prize-giving (#2298). One big button with
 * the next step, what the next tap shows so it can be read out, and the way
 * back. Every tap writes an absolute step, so a double tap is harmless; the
 * TV polls it. The strings come translated from the page.
 */
export function CeremonyRemote({
  gameId,
  initialStep,
  steps,
  labels,
}: {
  gameId: string;
  initialStep: number | null;
  steps: RemoteStep[];
  labels: RemoteLabels;
}) {
  const [step, setStep] = useState<number | null>(initialStep);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function go(target: number | null) {
    setFailed(false);
    startTransition(async () => {
      // Offline, the action's request throws; it is the same «try again».
      const res = await setCeremonyStep(gameId, target).catch(() => ({ ok: false as const }));
      if (res.ok) setStep(target);
      else setFailed(true);
    });
  }

  const done = step !== null && step >= steps.length;
  const status =
    step === null ? labels.notStarted : step === 0 ? labels.nowHidden : steps[step - 1]!.now;
  const nextText = step !== null && !done ? steps[step]!.next : null;
  const primary =
    step === null
      ? { label: labels.start, target: 0 }
      : done
        ? null
        : { label: steps[step]!.button, target: step + 1 };

  return (
    <Card>
      <div className="space-y-4" data-testid="ceremony-remote">
        <p role="status" className="text-base font-medium text-text" data-testid="ceremony-status">
          {status}
        </p>
        {nextText && (
          <p className="text-sm text-muted" data-testid="ceremony-next">
            {nextText}
          </p>
        )}
        {done && <p className="text-sm text-muted">{labels.allShown}</p>}

        {primary && (
          <Button
            type="button"
            size="large"
            className="w-full"
            pending={isPending}
            onClick={() => go(primary.target)}
            data-testid="ceremony-primary"
          >
            {primary.label}
          </Button>
        )}

        {failed && (
          <p role="alert" className="text-sm text-danger">
            {labels.error}
          </p>
        )}

        {step !== null && (
          <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
            {step > 0 && (
              <Button type="button" variant="secondary" className="w-full" disabled={isPending} onClick={() => go(step - 1)}>
                {labels.back}
              </Button>
            )}
            {step > 0 && (
              <Button type="button" variant="secondary" className="w-full" disabled={isPending} onClick={() => go(0)}>
                {labels.restart}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={isPending}
              onClick={() => go(null)}
              data-testid="ceremony-close"
            >
              {labels.close}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * The big screen uses the live link. When it is off, this turns it on and the
 * page comes back with the link to copy.
 */
export function BigScreenSwitch({
  gameId,
  label,
  errorText,
}: {
  gameId: string;
  label: string;
  errorText: string;
}) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        pending={isPending}
        data-testid="ceremony-tv-on"
        onClick={() => {
          setFailed(false);
          startTransition(async () => {
            try {
              await setLiveFollow(gameId, true);
              router.refresh();
            } catch (err) {
              console.error('[BigScreenSwitch] setLiveFollow failed', err);
              setFailed(true);
            }
          });
        }}
      >
        {label}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-danger">
          {errorText}
        </p>
      )}
    </div>
  );
}
