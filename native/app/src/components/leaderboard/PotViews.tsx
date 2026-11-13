// Native N4 (#1828): Skins er ikke en tabell med en total nederst, men en pott.
// Nassau-tavla (#2755) bor i `NassauBoard.tsx`.
import { Text, View } from 'react-native';
import type { SkinsResult } from '../../../../../lib/scoring/modes/types';
import type { Settlement } from '../../../../../lib/scoring/settlement';
import { skinsPotNow } from '../../../../../lib/leaderboard/skinsPot';
import { carriedPotLine } from '../../lib/leaderboardModel';
import { useTheme } from '../../theme';
import { SettlementCard } from './SettlementCard';
import { SkinsCoinGrid, SkinsPotHero, SkinsStanding } from './SkinsPot';

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
