import type { Metadata } from 'next';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { ModeGuideCard } from '@/components/ModeGuideCard';
import type { GameMode } from '@/lib/scoring/modes/types';

export const metadata: Metadata = {
  title: 'Spillformer',
};

// Pedagogisk rekkefølge: de vanligste klubb-/kompis-formatene først, de mer
// spesielle veddemåls-/lag-formatene til slutt. Eksplisitt array framfor
// Object.keys så rekkefølgen er bevisst, ikke avhengig av union-rekkefølge.
const MODE_ORDER: GameMode[] = [
  'stableford',
  'modified_stableford',
  'solo_strokeplay',
  'best_ball',
  'texas_scramble',
  'singles_matchplay',
  'fourball_matchplay',
  'foursomes_matchplay',
  'nassau',
  'skins',
  'wolf',
];

// Oppslagsverk over alle spillformene (#299). Ren, statisk lærings-ressurs —
// ingen per-bruker-data. Hvert format er et utvidbart ModeGuideCard, samme
// komponent som på spill-siden.
export default function SpillformerPage() {
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

      <div className="space-y-3">
        {MODE_ORDER.map((mode) => (
          <ModeGuideCard key={mode} mode={mode} />
        ))}
      </div>
    </AppShell>
  );
}
