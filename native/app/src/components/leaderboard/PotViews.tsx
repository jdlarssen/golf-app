// Native N4 (#1828): pott-formatene. Skins og Nassau er ikke tabeller med en
// total nederst — de er en pott og tre delkonkurranser, og vises som det.
import { Text, View } from 'react-native';
import type { NassauResult, SkinsResult } from '../../../../../lib/scoring/modes/types';
import type { Settlement } from '../../../../../lib/scoring/settlement';
import { skinsPotNow } from '../../../../../lib/leaderboard/skinsPot';
import {
  carriedPotLine,
  NASSAU_SECTION_LABELS,
  nassauSectionLine,
} from '../../lib/leaderboardModel';
import { useTheme } from '../../theme';
import { SettlementCard } from './SettlementCard';
import { SkinsCoinGrid, SkinsPotHero, SkinsStanding } from './SkinsPot';
import { LeaderTable, plainBoardCard } from './Table';

/**
 * Skins (#2317, skinspotten): toppkortet mens runden pågår, én mynt per hull og
 * en slank stilling uten plass, medaljer og reaksjoner, som tegningen og
 * nettets `SkinsView`. Et ferdig spill har resultatets topp over seg i stedet
 * for kortet, og linja om skinsene som aldri ble vunnet.
 */
export function SkinsView({
  result,
  status,
  settlement,
  nameOf,
  viewerUserId = null,
}: {
  result: SkinsResult;
  status: string;
  /** Pengeoppgjøret (#2221), eller null når spillet ikke har kroner per skin. */
  settlement: Settlement | null;
  nameOf: (userId: string) => string;
  /** Seeren: egen rad i stillingen heter «Deg», som på tegningen. */
  viewerUserId?: string | null;
}) {
  const { ui } = useTheme();
  const finished = status === 'finished';
  const pot = skinsPotNow(result.holes, result.carriedPot);
  // Mens runden pågår står potten i toppkortet; linja er bare for ferdige spill.
  const potLine = finished ? carriedPotLine(result.carriedPot, status) : null;
  return (
    <View testID="skins-view">
      {finished ? null : <SkinsPotHero scoring={result.scoring} pot={pot} />}
      {/* Et spill som ble avsluttet før alle hull var spilt, har ingen pott på spill. */}
      <SkinsCoinGrid
        holes={result.holes}
        currentHoleNumber={!finished && pot.kind === 'pending' ? pot.holeNumber : null}
        nameOf={nameOf}
      />
      <SkinsStanding players={result.players} nameOf={nameOf} viewerUserId={viewerUserId} />
      {/* Luft mellom stillingskortet og linjene under. */}
      <View style={{ marginTop: 12, gap: 8 }}>
        {potLine ? (
          <Text style={ui.muted} testID="skins-pot">
            {potLine}
          </Text>
        ) : null}
        {settlement ? <SettlementCard settlement={settlement} nameOf={nameOf} /> : null}
        {finished ? (
          <Text style={ui.muted}>
            {result.scoring === 'net' ? 'Spilles på netto.' : 'Spilles på brutto.'}
          </Text>
        ) : null}
      </View>
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
          reactionTarget: { userId: player.userId, name: nameOf(player.userId) },
          cells: [player.rank, nameOf(player.userId), player.units],
        }))}
      />
      <Text style={ui.sectionTitle}>De tre konkurransene</Text>
      {sections.map((section) => (
        <View key={section.name} style={[ui.card, plainBoardCard]} testID={`nassau-section-${section.name}`}>
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
