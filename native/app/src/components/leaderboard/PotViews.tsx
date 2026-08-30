// Native N4 (#1828): pott-formatene. Skins og Nassau er ikke tabeller med en
// total nederst — de er en pott og tre delkonkurranser, og vises som det.
import { Text, View } from 'react-native';
import type { NassauResult, SkinsResult } from '../../../../../lib/scoring/modes/types';
import {
  carriedPotLine,
  NASSAU_SECTION_LABELS,
  nassauSectionLine,
} from '../../lib/leaderboardModel';
import { ui } from '../../theme';
import { LeaderTable } from './Table';

export function SkinsView({
  result,
  status,
  nameOf,
}: {
  result: SkinsResult;
  status: string;
  nameOf: (userId: string) => string;
}) {
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
      <Text style={ui.muted}>
        {result.scoring === 'net' ? 'Spilles på netto.' : 'Spilles på brutto.'}
      </Text>
    </View>
  );
}

export function NassauView({
  result,
  nameOf,
}: {
  result: NassauResult;
  nameOf: (userId: string) => string;
}) {
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
      <Text style={ui.muted}>
        {result.scoring === 'net' ? 'Spilles på netto.' : 'Spilles på brutto.'}
      </Text>
    </View>
  );
}
