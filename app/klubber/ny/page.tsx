import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createClub } from './actions';

type SearchParams = Promise<{ error?: string | string[] }>;

const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Klubben må ha et navn.',
  too_long: 'Navnet kan ikke ha mer enn 60 tegn.',
  cap: 'Du kan opprette inntil 2 klubber. Ta kontakt om du trenger mer plass.',
  unknown: 'Noe gikk galt. Prøv igjen.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * /klubber/ny — dedicated create-club page.
 *
 * A single-field form (club name) that submits to createClub server action.
 * Error codes from the action are surfaced via ?error= query param and mapped
 * to Norwegian messages here.
 *
 * Login-gated via proxy.ts (all /klubber/* routes require auth).
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export default async function OpprettKlubbPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/klubber/ny');

  const sp = await searchParams;
  const errorCode = first(sp.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  return (
    <AppShell>
      <TopBar backHref="/klubber" kicker="Ny klubb" />
      <PageHeader
        title="Opprett klubb"
        subtitle="Gi klubben et navn — du blir eier og kan legge til folk når den er satt opp."
      />

      {errorMessage && (
        <div className="mb-6">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <Card>
        <form action={createClub} className="space-y-5">
          <Input
            id="club-name"
            name="name"
            label="Klubbnavn"
            placeholder="F.eks. Kompis-gjengen"
            required
            maxLength={60}
            autoComplete="off"
            autoFocus
          />
          <Button type="submit" className="w-full">
            Opprett klubb
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}
