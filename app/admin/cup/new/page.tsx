import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { createTournamentDraft } from '@/lib/cup/actions';
import { FourballAllowanceField } from './FourballAllowanceField';

type SearchParams = Promise<{ error?: string | string[] }>;

const ERROR_MESSAGES: Record<string, string> = {
  name: 'Cup-navnet må være mellom 1 og 80 tegn.',
  team_1: 'Navn på lag 1 må være mellom 1 og 40 tegn.',
  team_2: 'Navn på lag 2 må være mellom 1 og 40 tegn.',
  team_dup: 'Lagene må ha forskjellige navn.',
  points: 'Point-målet må være et positivt tall (typisk 4,5 for 8 matches).',
  allowance: 'Allowance må være mellom 0 og 100.',
  insert_failed: 'Klarte ikke å opprette cupen. Prøv igjen, eller sjekk Vercel-loggene.',
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function NewCupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const errorCode = first(sp.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const supabase = await getServerClient();
  await requireAdmin(supabase);
  const userId = await getProxyVerifiedUserId();

  return (
    <AdminShell>
      <TopBar backHref="/admin" kicker="Sekretariatet" userId={userId} />
      <BrassRibbon kicker="Ny cup" />
      <PageHeader
        title="Opprett cup"
        subtitle="Bind sammen flere matches til én lag-vs-lag-konkurranse."
      />

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <form action={createTournamentDraft} className="space-y-5">
        <Input
          label="Cup-navn"
          id="name"
          name="name"
          required
          maxLength={80}
          placeholder="Tørny Cup 2026 — Sommer-runde"
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Lag 1"
            id="team_1_name"
            name="team_1_name"
            required
            maxLength={40}
            placeholder="Team Skog"
          />
          <Input
            label="Lag 2"
            id="team_2_name"
            name="team_2_name"
            required
            maxLength={40}
            placeholder="Team Sjø"
          />
        </div>

        <Input
          label="Point-mål"
          id="points_to_win"
          name="points_to_win"
          required
          type="text"
          inputMode="decimal"
          pattern="[0-9]+([,.][0-9]+)?"
          defaultValue="4,5"
          hint="Vanlig regel: halvparten av tilgjengelige point + 0,5. Med 8 matches blir det 4,5."
        />

        <FourballAllowanceField />

        <div className="pt-2">
          <Button type="submit" className="w-full">
            Opprett cup
          </Button>
        </div>
      </form>
    </AdminShell>
  );
}
