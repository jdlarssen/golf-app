'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SubmitButton as UiSubmitButton } from '@/components/ui/SubmitButton';

/**
 * «Del lenken din» (#2267): the share sheet with just the «legg til meg» link,
 * as the app's `Share.share({ message: url })`. Without a share sheet
 * (desktop) the link is copied, and where the clipboard is blocked it shows
 * in a prompt. A dismissed share sheet is no error. The absolute URL is built
 * on the client so it works on whatever domain the app runs.
 */
export function ShareLinkButton({
  path,
  label,
  copiedLabel,
  promptFallback,
}: {
  path: string;
  label: string;
  copiedLabel: string;
  promptFallback: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}${path}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ url });
        return;
      } catch (err) {
        // The player closed the sheet — not an error.
        if (err instanceof Error && err.name === 'AbortError') return;
        // Anything else falls through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (older Safari, a setting): show the link to copy by hand.
      window.prompt(promptFallback, url);
    }
  }

  return (
    <>
      {/* The label swap alone is silent to screen readers; this announces it. */}
      <span role="status" className="sr-only">
        {copied ? copiedLabel : ''}
      </span>
      <Button
        type="button"
        variant="onStrong"
        size="medium"
        onClick={share}
        className="grow"
        data-testid="friends-share-link"
      >
        {copied ? copiedLabel : label}
      </Button>
    </>
  );
}

/**
 * «Få med gjengen» (#2267): the forest card at the top of the friends page.
 * Your own initials and a dashed «+», the share link, and «På e-post», which
 * folds the e-mail field out inside the card. Without a friend code (the
 * lookup failed) only «På e-post» shows, and the card's line says what it does.
 */
export function GetTheGangCard({
  ownInitials,
  sharePath,
  emailOpenAtStart,
  addByEmailAction,
  text,
}: {
  ownInitials: string;
  /** `null` when the friend code could not be read. */
  sharePath: string | null;
  /** `?status=email_required` opens the field from the start. */
  emailOpenAtStart: boolean;
  addByEmailAction: (formData: FormData) => void;
  text: {
    title: string;
    shareLine: string;
    emailLine: string;
    shareButton: string;
    emailButton: string;
    copied: string;
    promptFallback: string;
    emailLabel: string;
    emailPlaceholder: string;
    emailPending: string;
    emailAdd: string;
  };
}) {
  const [emailOpen, setEmailOpen] = useState(emailOpenAtStart);
  const fieldRef = useRef<HTMLInputElement>(null);
  const regionId = useId();
  const titleId = useId();

  function toggleEmail() {
    const next = !emailOpen;
    setEmailOpen(next);
    // The field mounts with this render; focus it once it is there.
    if (next) requestAnimationFrame(() => fieldRef.current?.focus());
  }

  return (
    <section
      aria-labelledby={titleId}
      data-focus-surface="strong"
      data-testid="friends-hero"
      className="mx-4 mt-3.5 flex flex-col gap-3 rounded-[18px] bg-surface-strong p-4"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex">
          <span className="flex size-[30px] items-center justify-center rounded-full bg-on-strong text-[10px] font-semibold text-surface-strong ring-2 ring-surface-strong">
            {ownInitials}
          </span>
          <span className="-ml-1.5 flex size-[30px] items-center justify-center rounded-full border-[1.5px] border-dashed border-on-strong/70 bg-surface-strong text-[16px] text-on-strong">
            +
          </span>
        </span>
        <div className="grow">
          <h2 id={titleId} className="font-serif text-[18px] font-medium text-on-strong">
            {text.title}
          </h2>
          <p className="text-[12px] text-on-strong/85">
            {sharePath ? text.shareLine : text.emailLine}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {sharePath && (
          <ShareLinkButton
            path={sharePath}
            label={text.shareButton}
            copiedLabel={text.copied}
            promptFallback={text.promptFallback}
          />
        )}
        <Button
          type="button"
          variant="onStrongOutline"
          size="medium"
          aria-expanded={emailOpen}
          aria-controls={regionId}
          onClick={toggleEmail}
          className="text-[13px]! px-3.5!"
          data-testid="friends-email-toggle"
        >
          {text.emailButton}
        </Button>
      </div>
      <div id={regionId} hidden={!emailOpen} data-testid="friends-email-region">
        {emailOpen && (
          <div className="flex flex-col gap-3">
            {/* Without a code the card's own line already says this. */}
            {sharePath && <p className="text-[12px] text-on-strong/85">{text.emailLine}</p>}
            <AddByEmailForm
              action={addByEmailAction}
              fieldRef={fieldRef}
              label={text.emailLabel}
              placeholder={text.emailPlaceholder}
              pendingLabel={text.emailPending}
              buttonLabel={text.emailAdd}
            />
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * E-mail field + «Legg til» in the green card, the button disabled until
 * something is typed. Mirrors InviteFriendForm (#369 twin for friends).
 */
function AddByEmailForm({
  action,
  fieldRef,
  label,
  placeholder,
  pendingLabel,
  buttonLabel,
}: {
  action: (formData: FormData) => void;
  fieldRef: React.Ref<HTMLInputElement>;
  label: string;
  placeholder: string;
  pendingLabel: string;
  buttonLabel: string;
}) {
  const [hasEmail, setHasEmail] = useState(false);

  function handleChange(e: FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    setHasEmail(String(fd.get('email') ?? '').trim().length > 0);
  }

  return (
    <form action={action} onChange={handleChange} className="flex items-stretch gap-2">
      <div className="flex-1">
        <Input
          id="friend-email"
          ref={fieldRef}
          name="email"
          type="email"
          variant="onStrong"
          label={label}
          labelHidden
          placeholder={placeholder}
          autoComplete="off"
          required
        />
      </div>
      <UiSubmitButton
        variant="onStrong"
        size="medium"
        className="shrink-0"
        disabled={!hasEmail}
        pendingLabel={pendingLabel}
      >
        {buttonLabel}
      </UiSubmitButton>
    </form>
  );
}
