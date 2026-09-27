// Native N4 (#1828): pott-formatene. Skins og Nassau er ikke tabeller med en
// total nederst — de er en pott og tre delkonkurranser, og vises som det.
import { Text, View } from 'react-native';
import type { NassauResult, SkinsResult } from '../../../../../lib/scoring/modes/types';
import type { Settlement } from '../../../../../lib/scoring/settlement';
import {
  carriedPotLine,
  NASSAU_SECTION_LABELS,
  nassauSectionLine,
} from '../../lib/leaderboardModel';
import { useTheme } from '../../theme';
import { SettlementCard } from './SettlementCard';
import { LeaderTable } from './Table';

export function SkinsView({
  result,
  status,
  settlement,
  nameOf,
}: {
  result: SkinsResult;
  status: string;
  /** Pengeoppgjøret (#2221), eller null når spillet ikke har kroner per skin. */
  settlement: Settlement | null;
  nameOf: (userId: string) => string;
}) {
  const { ui } = useTheme();
  const potLine = carriedPotLine(result.carriedPot, status);
  return (
    <View testID="skins-view">
      <LeaderTable
        testID="leaderboard-table"
        columns={[
          { key: 'rank', label: '#', flex: 0.5, numeric: true },
          { key: 'name', label: 'Navn', flex: 3 },
          { key: 'skins', label: 'Skins', numeric: true },
          { key: 'holes', label: 'Hull', numeric: true },
        ]}
        rows={result.players.map((player) => ({
          key: player.userId,
          highlight: player.rank === 1,
          cells: [player.rank, nameOf(player.userId), player.totalSkins, player.holesWon],
        }))}
      />
      {potLine ? (
        <Text style={ui.muted} testID="skins-pot">
          {potLine}
        </Text>
      ) : null}
      {settlement ? <SettlementCard settlement={settlement} nameOf={nameOf} /> : null}
      <Text style={ui.muted}>
        {result.scoring === 'net' ? 'Spilles på netto.' : 'Spilles på brutto.'}
      </Text>
    </View>
  );
}

export function NassauView({
  result,
  settlement,
  nameOf,
}: {
  result: NassauResult;
  /** Pengeoppgjøret (#2221), eller null når spillet ikke har kroner per seksjon. */
  settlement: Settlement | null;
  nameOf: (userId: string) => string;
}) {
  const { ui } = useTheme();
  const sections = [
    result.sections.front9,
    result.sections.back9,
    result.sections.total18,
  ];

  return (
    <View testID="nassau-view">
      <LeaderTable
        testID="leaderboard-table"
        columns={[
          { key: 'rank', label: '#', flex: 0.5, numeric: true },
          { key: 'name', label: 'Navn', flex: 3 },
          { key: 'units', label: 'Poeng', numeric: true },
        ]}
        rows={result.players.map((player) => ({
          key: player.userId,
          highlight: player.rank === 1,
          cells: [player.rank, nameOf(player.userId), player.units],
        }))}
      />
      <Text style={ui.sectionTitle}>De tre konkurransene</Text>
      {sections.map((section) => (
        <View key={section.name} style={ui.card} testID={`nassau-section-${section.name}`}>
          <Text style={ui.body}>{NASSAU_SECTION_LABELS[section.name]}</Text>
          <Text style={ui.muted}>{nassauSectionLine(section, nameOf)}</Text>
        </View>
      ))}
      {/* Etter de tre konkurransene, som på nettsiden. */}
      {settlement ? <SettlementCard settlement={settlement} nameOf={nameOf} /> : null}
      <Text style={ui.muted}>
        {result.scoring === 'net' ? 'Spilles på netto.' : 'Spilles på brutto.'}
      </Text>
    </View>
  );
}
