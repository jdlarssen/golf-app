'use client';

import { useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { sendCode, verifyCode } from '../actions';

// Supabase's default OTP length is 8 digits (per v0.4.1 fix). When the
// input reaches this length — typically via iOS Safari's auto-fill from
// Mail.app suggestion, or paste — we auto-submit the form so users don't
// have to tap "Logg inn" manually. The double-tap pattern was causing
// "code expired" errors when iOS auto-fill + manual tap consumed the OTP
// twice.
const OTP_LENGTH = 8;

export function VerifyCodeForm({
  email,
  next,
  invite = '',
  changeEmailHref,
}: {
  email: string;
  next: string;
  /**
   * Invitasjons-token fra `?invite=` (#1169) — følger begge formene så både
   * «Send ny kode» og en feiltastet kode beholder kontekstkortet gjennom
   * redirecten (#1345).
   */
  invite?: string;
  /**
   * Step-1-URL med `email`, `next` og `invite` beholdt (#1346) — utveien når
   * adressen er feiltastet. E-posten prefyller feltet på steg 1, og `invite`
   * holder kontekstkortet (#1169) i live på veien tilbake.
   */
  changeEmailHref: string;
}) {
  return (
    // Resend-knappen er i et separat <form> UNDER verify-skjemaet for å unngå
    // nøstede <form>-elementer (ugyldig HTML) og kollisjon med verifyCode-
    // action og «token required»-validering.
    <div className="space-y-4">
      <form action={verifyCode} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="invite" value={invite} />
        <FormBody email={email} />
      </form>
      <form action={sendCode} className="text-center">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="invite" value={invite} />
        {/*
          #1345: forteller sendCode at forespørselen kom FRA verify-steget, så
          en feil (typisk Supabase-throttle innen 60 sek) lar brukeren stå igjen
          ved kodefeltet med feilmeldingen — ikke på et tomt steg 1 mens koden
          er på vei. Kun formData; aldri en URL-param.
        */}
        <input type="hidden" name="from" value="verify" />
        <ResendFooter />
      </form>
      {/*
        #1346: søsken til begge skjemaene, aldri nøstet inni dem. En ren GET
        tilbake til steg 1 er utveien for en feiltastet adresse — «Send ny kode»
        sender bare til samme feil adresse på nytt.
      */}
      <ChangeEmailLink href={changeEmailHref} />
    </div>
  );
}

function ChangeEmailLink({ href }: { href: string }) {
  const t = useTranslations('auth.verifyCode');
  return (
    <div className="text-center">
      <Link
        href={href}
        data-testid="change-email-link"
        className="inline-flex min-h-[44px] items-center justify-center px-3 text-xs text-muted underline"
      >
        {t('changeEmail')}
      </Link>
    </div>
  );
}

function FormBody({ email }: { email: string }) {
  const { pending } = useFormStatus();
  const t = useTranslations('auth.verifyCode');

  if (pending) {
    return (
      <div className="py-3 text-center space-y-2">
        <p className="font-serif text-base text-text">{t('pending')}</p>
        <div className="flex justify-center pt-1">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-muted">
        {t('instructionPrefix')}{' '}
        <strong className="text-foreground">{email}</strong>
        {t('instructionSuffix')}
      </p>
      <p className="text-xs text-muted -mt-1">
        {t('spamHint')}
      </p>
      <CodeInput />
      <Button type="submit" className="w-full mt-2">
        {t('submitButton')}
      </Button>
    </>
  );
}

function ResendFooter() {
  const { pending } = useFormStatus();
  const t = useTranslations('auth.verifyCode');
  // Prompten står på egen linje over knappen, slik at knappen får full
  // 44px-høyde (#1349) uten å sprenge linjeboksen i en tekstparagraf.
  // Samme boks-geometri (44px-linje) som ChangeEmailLink under, men bevisst
  // ULIK vekt: resend er handlingen (text-primary, #1349), change-email er
  // dempet utvei (text-muted). Ikke harmoniser fargene.
  return (
    <>
      <p className="text-xs text-muted">{t('resendPrompt')}</p>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[44px] items-center justify-center px-3 text-sm font-medium text-primary underline underline-offset-2 disabled:opacity-50"
      >
        {t('resendLink')}
      </button>
    </>
  );
}

function CodeInput() {
  const { pending } = useFormStatus();
  const t = useTranslations('auth.verifyCode');
  // Belt-and-suspenders guard against double-submit: useFormStatus.pending
  // flips asynchronously after requestSubmit, so there's a brief window
  // where pending is still false but we've already triggered the action.
  // iOS Safari also occasionally fires its own auto-submit after auto-fill;
  // this ref blocks any further requestSubmit calls from this component
  // until the page navigates away.
  const submittedRef = useRef(false);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (pending || submittedRef.current) return;
    // Strip non-digits in case iOS auto-fill pastes a code with spaces
    // (the mail template formats it as "1234 5678" — Safari has been
    // observed to occasionally include the space).
    const digitsOnly = e.target.value.replace(/\D/g, '');
    if (digitsOnly !== e.target.value) {
      e.target.value = digitsOnly;
    }
    if (digitsOnly.length === OTP_LENGTH && e.target.form) {
      submittedRef.current = true;
      e.target.form.requestSubmit();
    }
  }

  return (
    <Input
      id="token"
      name="token"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]{6,8}"
      maxLength={OTP_LENGTH}
      label={t('codeLabel')}
      required
      autoFocus
      onChange={onChange}
      disabled={pending}
    />
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
