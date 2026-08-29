// Modus-bannerne over selve hull-flaten (#1716 — ren flytting ut av
// `page.tsx`): foursomes' tee-starter, patsome sitt segment-banner + tee-valg,
// og chapman sin fase-stripe. Hver slot rendrer sin egen `px-3`-wrapper først
// når den faktisk har noe å vise — akkurat som `&&`-gatene den erstattet.

import type { ReactNode } from 'react';
import type { GameForHole, PlayerForHole } from '@/lib/games/getGameWithPlayers';
import {
  FoursomesTeeStarterBanner,
  FoursomesTeeHint,
} from './FoursomesTeeStarterBanner';
import { PatsomeSegmentBanner } from './PatsomeSegmentBanner';
import {
  PatsomeTeeStarterBanner,
  PatsomeTeeHint,
} from './PatsomeTeeStarterBanner';
import { ChapmanPhaseReminder } from './ChapmanPhaseReminder';

type PartnerOption = { userId: string; displayName: string };

function toPartnerOptions(
  players: PlayerForHole[],
  playerFallback: string,
): PartnerOption[] {
  return players.map((p) => ({
    userId: p.user_id,
    displayName:
      (p.users?.nickname ?? p.users?.name ?? '').split(/\s+/)[0] ||
      playerFallback,
  }));
}

/**
 * Foursomes (#218): tee-starter-banner på hull 1 hvis ikke valgt; hint per
 * hull etter at valget er gjort. Begrenset til foursomes-modus + me's side.
 */
function foursomesTeeSlot(args: {
  game: GameForHole;
  me: PlayerForHole;
  flight: PlayerForHole[];
  gameId: string;
  holeNumber: number;
  playerFallback: string;
}): ReactNode {
  const { game, me, flight, gameId, holeNumber, playerFallback } = args;
  if (game.game_mode !== 'foursomes_matchplay' || me.team_number == null) {
    return null;
  }
  const sideNumber = me.team_number as 1 | 2;
  const teeStarterCol =
    sideNumber === 1
      ? game.foursomes_side1_tee_starter_user_id
      : game.foursomes_side2_tee_starter_user_id;
  // Tee-starter-banneret gjelder kun mitt lag (2 spillere) — filtrer til
  // min side uavhengig av om hele flighten er synlig (#543).
  const myTeamPlayers = flight.filter((p) => p.team_number === me.team_number);
  const partners = toPartnerOptions(myTeamPlayers, playerFallback);
  if (partners.length !== 2) return null;
  if (teeStarterCol == null) {
    return holeNumber === 1 ? (
      <FoursomesTeeStarterBanner
        gameId={gameId}
        sideNumber={sideNumber}
        options={partners}
      />
    ) : null;
  }
  return (
    <FoursomesTeeHint
      holeNumber={holeNumber}
      teeStarterUserId={teeStarterCol}
      partners={partners}
    />
  );
}

/**
 * Patsome (#286): tee-starter-velger/-hint kun i foursomes-segmentet (13–18).
 * Velgeren vises på alle foursomes-hull til laget har valgt (mer tilgivende
 * enn foursomes' kun-hull-1), deretter hint-chipen.
 */
function patsomeTeeSlot(args: {
  me: PlayerForHole;
  flight: PlayerForHole[];
  gameId: string;
  holeNumber: number;
  patsomeTeeStarterUserId: string | null;
  playerFallback: string;
}): ReactNode {
  const {
    me,
    flight,
    gameId,
    holeNumber,
    patsomeTeeStarterUserId,
    playerFallback,
  } = args;
  // Patsome tee-starter: filtrer til mitt lag (2 spillere) — uavhengig av
  // om hele flighten er synlig (#543).
  const myPatsomeTeam = flight.filter((p) => p.team_number === me.team_number);
  if (me.team_number == null || holeNumber < 13 || myPatsomeTeam.length !== 2) {
    return null;
  }
  const partners = toPartnerOptions(myPatsomeTeam, playerFallback);
  return patsomeTeeStarterUserId == null ? (
    <PatsomeTeeStarterBanner
      gameId={gameId}
      teamNumber={me.team_number}
      options={partners}
    />
  ) : (
    <PatsomeTeeHint
      holeNumber={holeNumber}
      teeStarterUserId={patsomeTeeStarterUserId}
      partners={partners}
    />
  );
}

export function HoleTopBanners({
  game,
  me,
  flight,
  gameId,
  holeNumber,
  patsomeTeeStarterUserId,
  playerFallback,
}: {
  game: GameForHole;
  me: PlayerForHole;
  flight: PlayerForHole[];
  gameId: string;
  holeNumber: number;
  patsomeTeeStarterUserId: string | null;
  playerFallback: string;
}) {
  const isPatsome = game.game_mode === 'patsome';
  // Patsome (#286): segment-banner på alle hull.
  const patsomeSegmentSlot = isPatsome ? (
    <PatsomeSegmentBanner holeNumber={holeNumber} />
  ) : null;
  const patsomeTee = isPatsome
    ? patsomeTeeSlot({
        me,
        flight,
        gameId,
        holeNumber,
        patsomeTeeStarterUserId,
        playerFallback,
      })
    : null;
  const foursomesTee = foursomesTeeSlot({
    game,
    me,
    flight,
    gameId,
    holeNumber,
    playerFallback,
  });
  // Chapman (#290): statisk fase-stripe på hver hull-side (begge slår ut → bytt
  // ball → velg beste → spill annenhver). Ingen tee-starter — begge teer hvert
  // hull, så det finnes ingen fast odd/even-rotasjon å spore.
  const chapmanPhaseSlot =
    game.game_mode === 'chapman_matchplay' ? <ChapmanPhaseReminder /> : null;

  return (
    <>
      {patsomeSegmentSlot && <div className="px-3">{patsomeSegmentSlot}</div>}
      {patsomeTee && <div className="px-3">{patsomeTee}</div>}
      {foursomesTee && <div className="px-3">{foursomesTee}</div>}
      {chapmanPhaseSlot && <div className="px-3">{chapmanPhaseSlot}</div>}
    </>
  );
}
