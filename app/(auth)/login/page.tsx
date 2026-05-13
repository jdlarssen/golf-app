import { sendCode, verifyCode } from './actions';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { BrandHero } from '@/components/ui/BrandHero';

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
  code_invalid: 'Feil kode. Sjekk mailen og prøv igjen.',
  code_expired: 'Koden er gått ut. Be om ny kode.',
  link_expired: 'Lenken er gått ut. Be om ny kode på login.',
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
            <form action={sendCode} className="space-y-4">
              <input type="hidden" name="next" value={next} />
              <Input
                id="email"
                name="email"
                type="email"
                label="E-post"
                autoComplete="email"
                defaultValue={email}
                required
              />
              <Button type="submit" className="w-full mt-2">
                Send meg kode
              </Button>
              <p className="text-xs text-muted mt-6 text-center">
                Vi sender deg en 6-sifret kode på mail.
              </p>
            </form>
          ) : (
            <form action={verifyCode} className="space-y-4">
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="next" value={next} />
              <p className="text-sm text-muted">
                Skriv inn 6-sifret kode vi sendte til{' '}
                <strong className="text-foreground">{email}</strong>.
              </p>
              <Input
                id="token"
                name="token"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                label="Kode"
                required
              />
              <Button type="submit" className="w-full mt-2">
                Logg inn
              </Button>
              <p className="text-xs text-muted mt-6 text-center">
                Fikk du ikke koden?{' '}
                <a href={resendHref} className="underline">
                  Send ny kode
                </a>
              </p>
            </form>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
