import type { Metadata } from 'next';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { FormatGuideList } from '@/components/FormatGuideList';
import { getFormatGuideEntries } from '@/lib/formats/buildFormatGuide';
// Content comes from the DB via getModeContentMap (service role) at request
// time. Under cacheComponents (#538) uncached IO is never prerendered, so no
// force-dynamic directive is needed to keep it out of the build.

export const metadata: Metadata = {
  title: 'Spillformater',
};

// Oppslagsverk over alle spillformene (#299, #307, #308). Ren lærings-ressurs —
// ingen per-bruker-data. Hvert format er et utvidbart ModeGuideCard med
// DB-drevet innhold + lenke til detaljside. Innholdet bygges via
// getFormatGuideEntries (cached på 'format-mapping'-tag) og rendres med den
// delte FormatGuideList-komponenten (#498), samme liste som «?»-arket i
// veiviseren bruker.
export default async function SpillformaterPage() {
  const entries = await getFormatGuideEntries();

  return (
    <AppShell>
      <header className="mb-2 flex items-center justify-between gap-4">
        <BackLink href="/">← Hjem</BackLink>
        <Kicker tone="accent">SPILLFORMATER</Kicker>
        <span className="w-12" aria-hidden />
      </header>

      <PageHeader
        title="Spillformater"
        subtitle="Trykk på et format for å se hvordan det funker. Da tør du å bli med uansett hva som settes opp."
      />

      <FormatGuideList entries={entries} />
    </AppShell>
  );
}
