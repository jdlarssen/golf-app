import 'server-only';
import {
  getModeContentMap,
  mergeModeContent,
} from '@/lib/formats/getModeContent';
import {
  MODE_LABELS,
  type GameMode,
  type GameModeConfig,
} from '@/lib/scoring/modes/types';
import { formatDisplayLabel } from '@/lib/games/formatLabel';
import type { FormatGuideEntry } from '@/components/FormatGuideList';

/**
 * Bygger format-oppslagsverket server-side til serialiserbare rader (#498).
 *
 * Eier den pedagogiske rekkefølgen (CATALOG) + fletter DB-innhold med
 * MODE_GUIDE-fallback via `mergeModeContent`, slik at både oppslagssiden
 * /spillformater og «?»-arket i veiviseren deler én kilde. Resultatet er ren
 * data (ingen server-only-binding), så det kan sendes inn i den klient-rendrede
 * veiviseren som prop.
 */

type CatalogEntry = {
  key: string;
  mode: GameMode;
  /**
   * Valgfri config for variant-bevisste oppføringer. 4BBB Stableford (#282)
   * deler game_mode med solo-Stableford, så den får en egen katalog-rad med
   * team_size 2 slik at den viser 4BBB-navn + -forklaring.
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

export async function getFormatGuideEntries(): Promise<FormatGuideEntry[]> {
  const modeContentMap = await getModeContentMap();

  return CATALOG.map((entry) => {
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

    return {
      key: entry.key,
      mode: entry.mode,
      label,
      summary: merged.summary,
      points: merged.points,
      playStyleTeamSize: entry.modeConfig ? teamSize : undefined,
    };
  });
}
