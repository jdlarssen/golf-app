import type { Metadata } from 'next';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormatGuideList } from '@/components/FormatGuideList';
import { getFormatGuideEntries } from '@/lib/formats/buildFormatGuide';
// Dynamic: fetches DB content via getModeContentMap (requires SUPABASE_SERVICE_ROLE_KEY
// at request time). Static pre-render would fail in build without env.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Spillformer',
};

// Oppslagsverk over alle spillformene (#299, #307, #308). Ren lærings-ressurs —
// ingen per-bruker-data. Hvert format er et utvidbart ModeGuideCard med
// DB-drevet innhold + lenke til detaljside. Innholdet bygges via
// getFormatGuideEntries (cached på 'format-mapping'-tag) og rendres med den
// delte FormatGuideList-komponenten (#498), samme liste som «?»-arket i
// veiviseren bruker.
export default async function SpillformerPage() {
  const entries = await getFormatGuideEntries();

  return (
    <AppShell>
      <header className="mb-2 flex items-center justify-between gap-4">
        <BackLink href="/">← Hjem</BackLink>
        <Kicker tone="accent">SPILLFORMER</Kicker>
        <span className="w-12" aria-hidden />
      </header>

      <PageHeader
        title="Spillformer"
        subtitle="Trykk på en form for å se hvordan den funker. Da tør du å bli med uansett hva som settes opp."
      />

      <FormatGuideList entries={entries} />
    </AppShell>
  );
}
