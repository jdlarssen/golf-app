'use client';

import { useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

/**
 * «+ Inviter en spiller» (#2346): a button pinned above the bottom nav that
 * reveals the invite form and puts the cursor in the e-mail field. The form
 * stays in the DOM (`hidden`) until then, so the input is mounted for the
 * invitation flow's tests and for a screen reader.
 *
 * With nothing pending the form starts open and the button is gone, as before.
 */
export function InviteDock({
  initiallyOpen,
  buttonLabel,
  children,
}: {
  initiallyOpen: boolean;
  buttonLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const formRef = useRef<HTMLDivElement>(null);

  function openForm() {
    // Commit the un-hide first, or focus() on a `hidden` field is a no-op.
    flushSync(() => setOpen(true));
    const wrapper = formRef.current;
    wrapper?.querySelector<HTMLInputElement>('#email')?.focus({ preventScroll: true });
    wrapper?.scrollIntoView({ block: 'nearest' });
  }

  return (
    <>
      <div id="invite-form" ref={formRef} hidden={!open} className="mt-2">
        {children}
      </div>
      {!open && (
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-20 mt-5">
          <button
            type="button"
            data-testid="invite-toggle"
            aria-expanded={open}
            aria-controls="invite-form"
            onClick={openForm}
            className="h-[52px] w-full rounded-full bg-primary font-sans text-[15px] font-semibold text-white dark:text-bg"
            style={{ boxShadow: '0 6px 18px rgba(27, 67, 50, 0.28)' }}
          >
            {buttonLabel}
          </button>
        </div>
      )}
    </>
  );
}
