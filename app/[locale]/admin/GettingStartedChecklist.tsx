import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';

// ─── «Kom i gang»-sjekkliste (#1177) ───────────────────────────────────────
//
// Goal-gradient onboarding for a brand-new admin: the launch runbook
// (docs/launch-checklist.md) surfaced in-app as a checklist that starts above
// zero — «Konto opprettet» is pre-checked — so the very first screen shows
// progress instead of a blank slate.
//
// Presentational and admin-only by construction: mounted only inside TilesGrid,
// which the page reaches only after branching non-admins to PlayerKlubbhus
// (#392). State is derived — no dismiss, no persistence: once the three real
// steps are done the whole card returns null and never reappears (the
// ActionItemsStripe «quiet days stay quiet» pattern).

type Step = {
  key: string;
  label: string;
  done: boolean;
  /** Door for a pending step; omitted for the always-done account step. */
  href?: string;
};

export function GettingStartedChecklist({
  hasCourse,
  hasGame,
  hasInvited,
}: {
  hasCourse: boolean;
  hasGame: boolean;
  hasInvited: boolean;
}) {
  const t = useTranslations('admin.dashboard');

  // Auto-hide once the loop is complete. The account step is always done, so
  // this is exactly «all three data-steps done».
  if (hasCourse && hasGame && hasInvited) return null;

  const steps: Step[] = [
    { key: 'account', label: t('gettingStarted.stepAccount'), done: true },
    {
      key: 'course',
      label: t('gettingStarted.stepCourse'),
      done: hasCourse,
      href: '/admin/courses/new',
    },
    {
      key: 'game',
      label: t('gettingStarted.stepGame'),
      done: hasGame,
      href: '/admin/games/new',
    },
    {
      key: 'invite',
      label: t('gettingStarted.stepInvite'),
      done: hasInvited,
      href: '/admin/spillere',
    },
  ];
  // Never zero: the account step is always counted (the goal-gradient head start).
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section
      className="mb-4"
      data-testid="getting-started-checklist"
      data-done-count={doneCount}
      aria-labelledby="getting-started-heading"
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
        <p
          id="getting-started-heading"
          className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted"
        >
          {t('gettingStarted.heading')}
        </p>
        <p className="font-sans text-[11px] tabular-nums text-muted">
          {t('gettingStarted.progress', { done: doneCount, total: steps.length })}
        </p>
      </div>
      <ul className="overflow-hidden rounded-2xl border border-accent/30 bg-accent/[0.05]">
        {steps.map((step, i) => (
          <li
            key={step.key}
            data-testid="getting-started-step"
            data-done={step.done ? 'true' : 'false'}
            className={i > 0 ? 'border-t border-accent/20' : ''}
          >
            {step.done || !step.href ? (
              <div className="flex min-h-[44px] items-center gap-3 px-4 py-3">
                <StepMark done={step.done} />
                <span
                  className={`text-[13px] ${
                    step.done ? 'text-muted' : 'font-medium text-text'
                  }`}
                >
                  {step.label}
                </span>
                {step.done ? (
                  <span className="sr-only">{t('gettingStarted.done')}</span>
                ) : null}
              </div>
            ) : (
              <SmartLink
                href={step.href}
                data-testid={`getting-started-link-${step.key}`}
                className="flex min-h-[44px] items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/[0.09] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <StepMark done={false} />
                <span className="text-[13px] font-medium text-text">{step.label}</span>
                <span aria-hidden className="ml-auto shrink-0 text-muted">
                  →
                </span>
              </SmartLink>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepMark({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
        done ? 'border-accent bg-accent text-primary' : 'border-border text-transparent'
      }`}
    >
      ✓
    </span>
  );
}
