import type { Metadata } from 'next';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { ModeGuideCard } from '@/components/ModeGuideCard';
import type { GameMode } from '@/lib/scoring/modes/types';
import { MODE_LABELS } from '@/lib/scoring/modes/types';
import { getModeContentMap, mergeModeContent } from '@/lib/formats/getModeContent';
import { formatDisplayLabel } from '@/lib/games/formatLabel';
import type { GameModeConfig } from '@/lib/scoring/modes/types';
// Dynamic: fetches DB content via getModeContentMap (requires SUPABASE_SERVICE_ROLE_KEY
// at request time). Static pre-render would fail in build without env.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Spillformer',
};

type CatalogEntry = {
  key: string;
  mode: GameMode;
  /**
   * Valgfri config for variant-bevisste oppføringer. 4BBB Stableford (#282)
   * deler game_mode med solo-Stableford, så den får en egen katalog-rad med
   * team_size 2 slik at ModeGuideCard viser 4BBB-navn + -forklaring.
   */
  modeConfig?: GameModeConfig;
};

// Pedagogisk rekkefølge: de vanligste klubb-/kompis-formatene først, de mer
// spesielle veddemåls-/lag-formatene til slutt. Eksplisitt array framfor
// Object.keys så rekkefølgen er bevisst, ikke avhengig av union-rekkefølge.
const CATALOG: CatalogEntry[] = [
  { key: 'stableford', mode: 'stableford' },
  {
    key: 'stableford-4bbb',
    mode: 'stableford',
    modeConfig: { kind: 'stableford', team_size: 2, points_table: 'standard' },
  },
  { key: 'modified_stableford', mode: 'modified_stableford' },
  { key: 'solo_strokeplay', mode: 'solo_strokeplay' },
  { key: 'best_ball', mode: 'best_ball' },
  { key: 'texas_scramble', mode: 'texas_scramble' },
  { key: 'ambrose', mode: 'ambrose' },
  { key: 'florida_scramble', mode: 'florida_scramble' },
  { key: 'singles_matchplay', mode: 'singles_matchplay' },
  { key: 'fourball_matchplay', mode: 'fourball_matchplay' },
  { key: 'foursomes_matchplay', mode: 'foursomes_matchplay' },
  { key: 'greensome_matchplay', mode: 'greensome_matchplay' },
  { key: 'chapman_matchplay', mode: 'chapman_matchplay' },
  { key: 'gruesome_matchplay', mode: 'gruesome_matchplay' },
  { key: 'nassau', mode: 'nassau' },
  { key: 'skins', mode: 'skins' },
  { key: 'wolf', mode: 'wolf' },
  { key: 'bingo_bango_bongo', mode: 'bingo_bango_bongo' },
  { key: 'nines', mode: 'nines' },
  { key: 'round_robin', mode: 'round_robin' },
  { key: 'acey_deucey', mode: 'acey_deucey' },
  { key: 'shamble', mode: 'shamble' },
  { key: 'patsome', mode: 'patsome' },
];

// Oppslagsverk over alle spillformene (#299, #307, #308). Ren lærings-ressurs —
// ingen per-bruker-data. Hvert format er et utvidbart ModeGuideCard med
// DB-drevet innhold + lenke til detaljside. Innhold hentes via getModeContentMap
// (cached på 'format-mapping'-tag, admin-redigerbart uten deploy).
export default async function SpillformerPage() {
  const modeContentMap = await getModeContentMap();

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
        {CATALOG.map((entry) => {
          const teamSize =
            entry.modeConfig && 'team_size' in entry.modeConfig
              ? entry.modeConfig.team_size
              : 1;
          const merged = mergeModeContent(
            modeContentMap[entry.mode] ?? null,
            entry.mode,
            teamSize,
          );
          const label = entry.modeConfig
            ? formatDisplayLabel(entry.mode, entry.modeConfig)
            : (MODE_LABELS[entry.mode] ?? entry.mode);
          // 4BBB synthetic entry links to the base stableford slug
          const detailHref = `/spillformer/${entry.mode}`;

          return (
            <ModeGuideCard
              key={entry.key}
              label={label}
              summary={merged.summary}
              points={merged.points}
              detailHref={detailHref}
              mode={entry.mode}
              playStyleTeamSize={entry.modeConfig ? teamSize : undefined}
            />
          );
        })}
      </div>
    </AppShell>
  );
}
