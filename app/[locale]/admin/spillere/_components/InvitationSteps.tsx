/**
 * Where an invitation stands (#2346): Sendt → Ba om kode → Inne.
 * Only rendered once the recipient has asked for a code (`opened_at`), so the
 * second step is always the current one. «Inne» never lights here: an accepted
 * invitation leaves the waiting list.
 */
export function InvitationSteps({
  label,
  sentLabel,
  requestedLabel,
  insideLabel,
}: {
  /** Screen readers: what the list describes. */
  label: string;
  sentLabel: string;
  requestedLabel: string;
  insideLabel: string;
}) {
  const steps = [
    { text: sentLabel, done: true, current: false },
    { text: requestedLabel, done: true, current: true },
    { text: insideLabel, done: false, current: false },
  ];
  return (
    <ol aria-label={label} className="mt-1.5 flex items-center font-sans text-[12px] text-muted">
      {steps.map((step, i) => (
        <li
          key={i}
          aria-current={step.current ? 'step' : undefined}
          className={`flex items-center ${step.current ? 'font-semibold text-text' : ''}`}
        >
          {i > 0 && (
            <span
              aria-hidden="true"
              className={`mx-1.5 block h-[2px] w-[18px] ${step.done ? 'bg-primary' : 'bg-border'}`}
            />
          )}
          <span
            aria-hidden="true"
            className={`mr-1.5 block h-2 w-2 rounded-full ${
              step.done ? 'bg-primary' : 'border-[1.5px] border-otp-divider'
            }`}
          />
          {step.text}
        </li>
      ))}
    </ol>
  );
}
