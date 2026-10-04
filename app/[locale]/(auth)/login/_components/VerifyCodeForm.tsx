'use client';

import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { Kicker } from '@/components/ui/Kicker';
import {
  OTP_LENGTH,
  formatResendCountdown,
  maskSentToEmail,
} from '@/lib/auth/otpResend';
import { sendCode, verifyCode } from '../actions';

/**
 * The code step (#2349, artboard «Innlogging-forslag»): «Steg 2 av 2», the
 * heading, where the code went (masked) with «Feil adresse?», eight boxes over
 * one real field, «Logg inn», and the «Kom ikke mailen?» card with the
 * countdown to a new code.
 *
 * Three siblings, never nested: the verify form, the resend form inside
 * `ResendCountdown`, and the change-email link up in the instruction line —
 * nested `<form>`s are invalid HTML and would collide on `token` (#1346).
 */
export function VerifyCodeForm({
  email,
  next,
  invite = '',
  changeEmailHref,
  notice,
  resendWaitSeconds,
  sent,
}: {
  email: string;
  next: string;
  /**
   * Invitasjons-token fra `?invite=` (#1169) — følger begge formene så både
   * «Send ny kode» og en feiltastet kode beholder invitasjonen gjennom
   * redirecten (#1345).
   */
  invite?: string;
  /**
   * Step-1-URL med `email`, `next` og `invite` beholdt (#1346) — utveien når
   * adressen er feiltastet. E-posten prefyller feltet på steg 1, og `invite`
   * holder invitasjonen i live på veien tilbake.
   */
  changeEmailHref: string;
  /** The error banner, under the instruction line. */
  notice?: ReactNode;
  /** Seconds until «Send ny kode» can be pressed, from the server (`sent`). */
  resendWaitSeconds: number;
  /** `sent` from the URL (unix seconds), or `''`; both forms carry it on. */
  sent: string;
}) {
  const t = useTranslations('auth.verifyCode');

  return (
    <>
      <div className="px-5 pt-6">
        <Kicker className="leading-[normal]">{t('kicker')}</Kicker>
        <h1 className="mt-1.5 font-serif text-[26px] leading-[1.15] font-medium text-text">
          {t('heading')}
        </h1>
        <p className="mt-2 text-[14px] leading-[1.45] text-muted">
          {t.rich('sentTo', {
            email: maskSentToEmail(email),
            strong: (chunks) => <strong className="font-semibold text-text">{chunks}</strong>,
          })}{' '}
          {/* #1346: a plain GET back to step 1 — «Send ny kode» would only
              send to the same wrong address again. The ::after reaches 44 px
              without moving the text. */}
          <Link
            href={changeEmailHref}
            data-testid="change-email-link"
            className="tap-extend font-semibold text-primary underline [--tap-extend:-14px_-4px]"
          >
            {t('changeEmailShort')}
          </Link>
        </p>
        {notice && <div className="mt-4">{notice}</div>}
      </div>

      <form action={verifyCode}>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="invite" value={invite} />
        <input type="hidden" name="sent" value={sent} />
        <FormBody />
      </form>

      {/* A new code gives a new `sent`, and the key starts the countdown over. */}
      <ResendCountdown
        key={sent}
        email={email}
        next={next}
        invite={invite}
        sent={sent}
        resendWaitSeconds={resendWaitSeconds}
      />
    </>
  );
}

function FormBody() {
  const { pending } = useFormStatus();
  const t = useTranslations('auth.verifyCode');

  if (pending) {
    return (
      <div className="space-y-2 px-5 pt-5 text-center">
        <p className="font-serif text-base text-text">{t('pending')}</p>
        <div className="flex justify-center pt-1">
          <Spinner />
        </div>
      </div>
    );
  }

  // Mounted only while not pending: a wrong code comes back to empty boxes.
  return <CodeEntry />;
}

const subscribeNoop = () => () => {};

/**
 * The eight boxes, the hint and «Logg inn». The boxes are drawn from what the
 * one real field holds; they are decoration (`aria-hidden`).
 */
function CodeEntry() {
  const t = useTranslations('auth.verifyCode');
  const hintId = useId();
  const [digits, setDigits] = useState('');
  // «Logg inn» is grey until all eight digits are there — but only once React
  // runs. The server's HTML keeps it enabled, so the form still works without
  // JS (the field's `required` and `pattern` guard it then).
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  return (
    <>
      <div className="px-5 pt-5">
        <CodeInput digits={digits} onDigits={setDigits} hintId={hintId} />
        <p id={hintId} className="mt-2.5 text-xs leading-[normal] text-muted">
          {t('codeHint')}
        </p>
      </div>
      <div className="px-5 pt-5">
        {/* `!`: the Button base writes font-medium, tracking-tight, a shadow
            and disabled:opacity-50; the artboard's pill is 600, normal
            tracking, flat, and 45 % when off. */}
        <Button
          type="submit"
          disabled={hydrated && digits.length < OTP_LENGTH}
          className="h-[52px] w-full text-[15px] leading-[normal] font-semibold! tracking-normal! [box-shadow:none]! disabled:opacity-45!"
        >
          {t('submitButton')}
        </Button>
      </div>
    </>
  );
}

function CodeInput({
  digits,
  onDigits,
  hintId,
}: {
  digits: string;
  onDigits: (digits: string) => void;
  hintId: string;
}) {
  const { pending } = useFormStatus();
  const t = useTranslations('auth.verifyCode');
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  // Belt-and-suspenders guard against double-submit: useFormStatus.pending
  // flips asynchronously after requestSubmit, so there's a brief window
  // where pending is still false but we've already triggered the action.
  // iOS Safari also occasionally fires its own auto-submit after auto-fill;
  // this ref blocks any further requestSubmit calls from this component
  // until the page navigates away.
  const submittedRef = useRef(false);

  function take(el: HTMLInputElement) {
    // Keep digits only, and at most eight: a pasted «1234 5678» or a code with
    // a stray space from iOS's suggestion must not lose its last digit, which a
    // `maxLength` would cut before the spaces are gone.
    const clean = el.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (clean !== el.value) el.value = clean;
    onDigits(clean);
    if (clean.length === OTP_LENGTH && el.form && !submittedRef.current) {
      submittedRef.current = true;
      el.form.requestSubmit();
    }
  }

  // iOS can fill in the code from Mail before React has hydrated. Read what the
  // field already holds once, and send it if all eight digits are there.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (el.value) take(el);
    if (document.activeElement === el) {
      setFocused(true);
    }
    // Once, on mount: the value and focus are from before hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = focused && digits.length < OTP_LENGTH ? digits.length : -1;

  return (
    <div className="relative">
      <label htmlFor="token" className="sr-only">
        {t('codeLabel')}
      </label>
      <div aria-hidden="true" className="flex h-[58px] items-center gap-1.5">
        {Array.from({ length: OTP_LENGTH }, (_, i) => (
          <Fragment key={i}>
            {i === OTP_LENGTH / 2 && <span className="h-0.5 w-2 shrink-0 bg-otp-divider" />}
            <span
              data-state={i === active ? 'active' : i < digits.length ? 'filled' : 'empty'}
              className={`box-content flex h-[54px] min-w-0 flex-1 basis-0 items-center justify-center rounded-[10px] bg-surface font-serif text-[24px] leading-[normal] font-semibold text-text tabular-nums ${
                i === active
                  ? 'border-2 border-primary ring-3 ring-primary/18'
                  : i < digits.length
                    ? 'border-[1.5px] border-primary'
                    : 'border border-border'
              }`}
            >
              {i === active ? <span className="h-6 w-0.5 bg-text" /> : digits[i]}
            </span>
          </Fragment>
        ))}
      </div>
      {/* The one real field lies over the boxes: a tap on any box focuses it,
          so paste and iOS's code suggestion work. 16 px text or iOS zooms in.
          The active box is the focus mark. The global ring (#1386,
          app/globals.css) is deliberately unlayered and beats every utility in
          `@layer utilities`, so a plain `focus-visible:outline-none` does
          nothing — the `!` makes it important, which wins. */}
      <input
        ref={inputRef}
        id="token"
        name="token"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6,8}"
        required
        autoFocus
        aria-describedby={hintId}
        disabled={pending}
        onChange={(e) => {
          if (pending || submittedRef.current) return;
          take(e.target);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 h-full w-full cursor-text border-0 bg-transparent p-0 text-base text-transparent caret-transparent selection:bg-transparent [-webkit-text-fill-color:transparent] focus-visible:outline-none!"
      />
    </div>
  );
}

/**
 * «Kom ikke mailen?» with the countdown to «Send ny kode» (#2349). Supabase
 * gives the same address a new code after a minute at the earliest; pressed
 * sooner, it says no. So the button waits out the minute.
 *
 * Its own form, a sibling of the verify form (`sendCode`, `from=verify`, and
 * `sent` so a rejected resend keeps the countdown). The deadline is set from
 * `Date.now()` at mount, so the count is right again after a trip to Mail.
 * Without JS the button stays as the server drew it, and a reload after the
 * minute gives an active button.
 */
export function ResendCountdown({
  email,
  next,
  invite,
  sent,
  resendWaitSeconds,
}: {
  email: string;
  next: string;
  invite: string;
  sent: string;
  resendWaitSeconds: number;
}) {
  const t = useTranslations('auth.verifyCode');

  return (
    <form
      action={sendCode}
      className="mx-4 mt-5 flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-3.5"
    >
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="invite" value={invite} />
      <input type="hidden" name="sent" value={sent} />
      {/*
        #1345: forteller sendCode at forespørselen kom FRA verify-steget, så
        en feil (typisk Supabase-throttle innen 60 sek) lar brukeren stå igjen
        ved kodefeltet med feilmeldingen — ikke på et tomt steg 1 mens koden
        er på vei. Kun formData; aldri en URL-param.
      */}
      <input type="hidden" name="from" value="verify" />
      <h2 className="text-[14px] leading-[normal] font-semibold text-text">{t('noMailTitle')}</h2>
      <p className="text-[13px] leading-[1.45] text-muted">{t('spamHint')}</p>
      {/* Keyed by the server's wait: after a redirect (a wrong code, a refused
          resend) the server has worked out a new wait, and the row starts
          from it instead of keeping a count that may be stuck at 0:0X. */}
      <ResendRow key={resendWaitSeconds} initialWaitSeconds={resendWaitSeconds} />
    </form>
  );
}

function ResendRow({ initialWaitSeconds }: { initialWaitSeconds: number }) {
  const { pending } = useFormStatus();
  const t = useTranslations('auth.verifyCode');
  const [left, setLeft] = useState(initialWaitSeconds);

  useEffect(() => {
    if (initialWaitSeconds <= 0) return;
    const deadline = Date.now() + initialWaitSeconds * 1000;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) clearInterval(id);
    }, 250);
    return () => clearInterval(id);
  }, [initialWaitSeconds]);

  const waiting = left > 0;

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[13px] leading-[normal] text-muted tabular-nums">
        {waiting ? t('resendIn', { time: formatResendCountdown(left) }) : null}
      </span>
      <button
        type="submit"
        data-testid="resend-code-button"
        disabled={waiting || pending}
        className={`inline-flex h-11 shrink-0 items-center justify-center rounded-full border bg-bg px-4 text-[13px] leading-[normal] font-semibold disabled:cursor-not-allowed ${
          waiting ? 'border-border text-resend-disabled-fg' : 'border-primary text-primary'
        }`}
      >
        {t('resendLink')}
      </button>
    </div>
  );
}

function Spinner() {
  const t = useTranslations('auth.verifyCode');
  return (
    <span
      aria-label={t('spinnerLabel')}
      role="status"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary"
    />
  );
}
