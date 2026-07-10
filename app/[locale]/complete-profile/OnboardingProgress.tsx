import { getTranslations } from 'next-intl/server';

type StepState = 'done' | 'active' | 'upcoming';

const STEPS: readonly { key: 'step1' | 'step2' | 'step3'; state: StepState }[] = [
  { key: 'step1', state: 'done' },
  { key: 'step2', state: 'active' },
  { key: 'step3', state: 'upcoming' },
];

const INDICATOR_BASE =
  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums';

const INDICATOR_BY_STATE: Record<StepState, string> = {
  // Champagne accent only on the completed check (forest glyph on gold).
  done: 'bg-accent text-primary',
  active: 'bg-primary text-white',
  upcoming: 'border border-border bg-surface text-muted',
};

const LABEL_BY_STATE: Record<StepState, string> = {
  done: 'text-text',
  active: 'text-text font-medium',
  upcoming: 'text-muted',
};

/**
 * Goal-gradient onboarding tracker (#1170): a static three-step row shown above
 * the profile form so onboarding never starts at 0 %. The «Konto opprettet» step
 * is always complete on arrival — reaching this page requires an authenticated
 * session — so the bar opens with drive instead of a blank slate.
 *
 * Purely presentational. The page's redirect gate (`profile_completed_at`)
 * already guarantees the state is always step1=done / step2=active /
 * step3=upcoming, so there are no queries and no props to thread through.
 */
export async function OnboardingProgress() {
  const t = await getTranslations('onboarding.progress');

  return (
    <div className="mb-6">
      <p className="mb-3 text-xs font-medium text-muted">{t('summary')}</p>
      <ol className="flex items-start gap-2">
        {STEPS.map(({ key, state }, index) => (
          <li
            key={key}
            className="flex flex-1 flex-col items-center gap-1.5 text-center"
          >
            <span
              className={`${INDICATOR_BASE} ${INDICATOR_BY_STATE[state]}`}
              aria-hidden="true"
            >
              {state === 'done' ? (
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 10.5l4 4 8-9" />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            <span className={`text-[11px] leading-tight ${LABEL_BY_STATE[state]}`}>
              {t(key)}
              <span className="sr-only"> ({t(`status.${state}`)})</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
