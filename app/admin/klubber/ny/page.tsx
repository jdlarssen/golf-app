import { cache } from 'react';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { VarighetField } from '../VarighetField';
import { createClubForAdmin } from './actions';

type SearchParams = Promise<{
  error?: string | string[];
  email?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const requireAdminContext = cache(async () => {
  const supabase = await getServerClient();
  await requireAdmin(supabase);
});

/**
 * /admin/klubber/ny — admin create-club form.
 *
 * Admin-only. Creates a club with a named owner (who must already have a
 * Tørny account), optional member cap, and optional valid_until date.
 *
 * Part of #50 (Klubb-eierskap, delegering & tilgangsstyring).
 */
export default async function NyKlubbPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdminContext();

  const sp = await searchParams;
  const errorCode = first(sp.error);
  const errorEmail = first(sp.email);

  const errorMessages: Record<string, string> = {
    not_auth: 'Du har ikke tilgang til å opprette klubber.',
    name_req: 'Fyll inn et klubbnavn.',
    too_long: 'Klubbnavnet kan ikke være lengre enn 60 tegn.',
    email_req: 'Fyll inn eierens e-postadresse.',
    cap_invalid: 'Medlemstaket må være minst 1.',
    owner_not_found: errorEmail
      ? `Fant ingen Tørny-bruker med e-posten ${errorEmail}. Be dem opprette konto først.`
      : 'Fant ingen Tørny-bruker med den e-posten. Be dem opprette konto først.',
    unknown: 'Noe gikk galt. Prøv igjen.',
  };

  return (
    <AdminShell>
      <TopBar backHref="/admin/klubber" kicker="Klubber" />
      <PageHeader title="Opprett klubb" />

      {errorCode && (
        <div className="mb-6">
          <Banner tone="error">
            {errorMessages[errorCode] ?? 'Noe gikk galt. Prøv igjen.'}
          </Banner>
        </div>
      )}

      <Card>
        <form action={createClubForAdmin} className="space-y-5">
          <Input
            id="name"
            name="name"
            type="text"
            label="Klubbnavn"
            placeholder="F.eks. Bærum Golfklubb"
            maxLength={60}
            required
          />
          <Input
            id="owner_email"
            name="owner_email"
            type="email"
            label="Eierens e-post"
            placeholder="eier@eksempel.no"
            autoComplete="off"
            hint="Personen må ha Tørny-konto fra før."
            required
          />
          <Input
            id="member_cap"
            name="member_cap"
            type="number"
            label="Medlemstak (valgfritt)"
            placeholder="F.eks. 150"
            min={1}
            hint="La stå tom for ubegrenset."
          />

          <VarighetField defaultMode="uendelig" defaultDate="" />

          <Button type="submit" className="w-full">
            Opprett klubb
          </Button>
        </form>
      </Card>
    </AdminShell>
  );
}
