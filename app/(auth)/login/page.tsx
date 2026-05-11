import { sendMagicLink } from './actions';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';

type SearchParams = Promise<{
  error?: string | string[];
  next?: string | string[];
  status?: string | string[];
  email?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: 'Vent litt før du prøver igjen.',
  user_not_found:
    'Denne mailen er ikke registrert. Be admin om en invitasjon.',
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
  const errorCode = first(params.error);
  const next = first(params.next) ?? '';
  const status = first(params.status);
  const sentEmail = first(params.email) ?? '';
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;
  const showSuccess = status === 'sent';

  return (
    <AppShell>
      <div className="mt-8">
        <Card>
          <h1 className="text-2xl font-semibold mb-6 text-center text-zinc-900 dark:text-zinc-100">
            Logg inn
          </h1>

          {showSuccess && (
            <div role="status" className="mb-4">
              <Banner tone="success">
                ✓ Sjekk e-posten din. Klikk lenken vi sendte til {sentEmail} for
                å logge inn.
              </Banner>
            </div>
          )}

          {errorMessage && (
            <div role="alert" className="mb-4">
              <Banner tone="error">{errorMessage}</Banner>
            </div>
          )}

          <form action={sendMagicLink} className="space-y-4">
            <input type="hidden" name="next" value={next} />

            <Input
              id="email"
              name="email"
              type="email"
              label="E-post"
              autoComplete="email"
              required
            />

            <Button type="submit" className="w-full mt-2">
              Send meg lenke
            </Button>
          </form>

          <p className="text-xs text-zinc-500 mt-6 text-center">
            Vi sender deg en lenke på mail. Klikk den for å logge inn.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
