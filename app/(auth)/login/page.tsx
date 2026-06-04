import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { BrandHero } from '@/components/ui/BrandHero';
import { SendCodeForm } from './_components/SendCodeForm';
import { VerifyCodeForm } from './_components/VerifyCodeForm';

type SearchParams = Promise<{
  step?: string | string[];
  email?: string | string[];
  error?: string | string[];
  next?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: 'Vent litt før du prøver igjen.',
  user_not_found:
    'Denne mailen er ikke registrert. Be admin om en invitasjon.',
  invite_expired:
    'Invitasjonen din er utløpt. Be arrangøren om å sende en ny.',
  disposable_email:
    'Engangs-e-post går ikke. Bruk en vanlig e-postadresse, så er du i gang.',
  code_invalid: 'Feil kode. Sjekk mailen og prøv igjen.',
  code_expired: 'Koden er gått ut. Be om ny kode.',
  link_expired: 'Lenken er gått ut. Be om ny kode.',
  unknown: 'Noe gikk galt. Prøv igjen.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const step = first(params.step) === 'verify' ? 'verify' : 'email';
  const email = first(params.email) ?? '';
  const next = first(params.next) ?? '';
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const resendQs = new URLSearchParams();
  if (email) resendQs.set('email', email);
  if (next) resendQs.set('next', next);
  const resendHref = `/login${resendQs.toString() ? '?' + resendQs.toString() : ''}`;

  return (
    <AppShell>
      <div className="mt-10">
        <BrandHero className="mb-10" />
        <Card>
          {errorMessage && (
            <div role="alert" className="mb-4">
              <Banner tone="error">{errorMessage}</Banner>
            </div>
          )}

          {step === 'email' ? (
            <SendCodeForm
              defaultEmail={email}
              next={next}
              allowSelfRegistration={
                process.env.NEXT_PUBLIC_ALLOW_SELF_REGISTRATION === 'true'
              }
            />
          ) : (
            <VerifyCodeForm
              email={email}
              next={next}
              resendHref={resendHref}
            />
          )}
        </Card>
      </div>
    </AppShell>
  );
}
