import { ownedScoresByPlayer } from './filledHoles';
import {
  flightDeliveryCandidates,
  type DeliveryGame,
  type DeliveryPlayer,
  type DeliveryScore,
} from './flightDelivery';
import { holeCountForSegment } from './holeScope';
import { deliveryCoversWholeTeam } from './teamDelivery';

// Påminnelsen går til den som fører (#2200 del 2). Før gikk den bare når
// spilleren selv åpnet spillsiden, og aldri til gjester. Målt i prod: de som
// ikke leverte, hadde nesten aldri tastet et slag selv. Nå finner en sveip
// (`app/api/cron/delivery-reminder`) kortene som er ferdige, og sender
// påminnelsen til den som kan levere dem.
//
// Dette er det ene hjemmet for regelen. Den er ren TS: sveipen leser rosteret
// og slagene og spør her. Hvem som KAN levere et kort for en annen, spør den
// delte leveringsregelen (`flightDeliveryCandidates`), og hva som er et fullt
// kort, `ownedScoresByPlayer`. Ingen av dem skrives på nytt her.

/** Et kvarter etter siste hull (eierens svar 2026-09-27: «Et kvarter, én gang»). */
export const REMINDER_QUIET_MS = 15 * 60 * 1000;

/** Rosterraden regelen leser: leveringsregelens rad pluss purre-stemplet. */
export type SweepPlayer = DeliveryPlayer & {
  deliver_reminder_sent_at: string | null;
};

/** En `scores`-rad med serverens skrivetid (`updated_at`, ikke telefonens klokke). */
export type SweepScore = DeliveryScore & { updated_at: string };

/** Én påminnelse: til hvem, for hvilke kort, og hvilke av dem som er andres. */
export type ReminderGroup = {
  recipientId: string;
  cardUserIds: string[];
  /**
   * Kortene som ikke er mottakerens eget, og ikke lagets felles kort i et
   * format der én levering dekker laget. Styrer ordlyden («kortene du har
   * ført»); sveipen teller dem blant kortene den faktisk stemplet.
   */
  otherCardUserIds: string[];
};

/**
 * Hvem som skal ha leverings-påminnelse nå, og for hvilke kort.
 *
 * Et kort er med når det er fullt (hvert hull i segmentet har slag), ikke
 * levert, ikke trukket, ikke purret før, og siste hull ble skrevet for minst et
 * kvarter siden. En front9-spiller med ulevert back9-søsken purres via back9
 * (#1466) og er ikke med.
 *
 * Mottakeren er den som tastet siste hull, når hen kan levere kortet: sitt eget,
 * lagets kort der én levering dekker laget, eller et kort leveringsregelen lar hen
 * levere for en makker. Ellers går påminnelsen til eieren. En mottaker må være
 * aktiv og ikke gjest; finnes ingen, sendes ingenting. Kortene samles per
 * mottaker, så en fører får én påminnelse for alle kortene hen har ført.
 *
 * Grupper og kort kommer i roster-rekkefølge.
 */
export function deliveryReminderGroups(input: {
  players: readonly SweepPlayer[];
  scores: readonly SweepScore[];
  game: DeliveryGame;
  now: number;
  undeliveredSiblingUserIds?: ReadonlySet<string>;
}): ReminderGroup[] {
  const { players, scores, game, now, undeliveredSiblingUserIds } = input;
  const mode = game.game_mode;
  const expectedHoles = holeCountForSegment(game.hole_segment);
  const owned = ownedScoresByPlayer({
    players,
    scores: scores.filter((s) => s.strokes != null),
    mode,
  });
  const byId = new Map(players.map((p) => [p.user_id, p]));

  const canRemind = (userId: string): boolean => {
    const p = byId.get(userId);
    return p != null && p.withdrawn_at == null && !p.is_guest;
  };
  // Samme predikat som leverings-kjernens lagkaskade: bare der kan en på laget
  // levere lagkameratens kort. Patsome er ikke med.
  const teamCascade = deliveryCoversWholeTeam(mode);
  const sameTeamCard = (a: string, b: string): boolean => {
    if (!teamCascade) return false;
    const team = byId.get(a)?.team_number;
    return team != null && team === byId.get(b)?.team_number;
  };
  const deliverable = new Map<string, Set<string>>();
  const canDeliverFor = (actorId: string, ownerId: string): boolean => {
    if (!deliverable.has(actorId)) {
      deliverable.set(
        actorId,
        new Set(flightDeliveryCandidates(actorId, { players, scores, game })),
      );
    }
    return deliverable.get(actorId)!.has(ownerId);
  };

  const recipientFor = (ownerId: string, lastKeyer: string | null): string | null => {
    if (
      lastKeyer != null &&
      canRemind(lastKeyer) &&
      (lastKeyer === ownerId ||
        sameTeamCard(lastKeyer, ownerId) ||
        canDeliverFor(lastKeyer, ownerId))
    ) {
      return lastKeyer;
    }
    return canRemind(ownerId) ? ownerId : null;
  };

  const cardsByRecipient = new Map<string, string[]>();
  for (const p of players) {
    if (p.submitted_at != null || p.withdrawn_at != null) continue;
    if (p.deliver_reminder_sent_at != null) continue;
    if (undeliveredSiblingUserIds?.has(p.user_id)) continue;

    const rows = owned.get(p.user_id) ?? [];
    if (rows.length < expectedHoles) continue;

    // Siste hull: nyeste `updated_at`; ved likt tidspunkt vinner høyest hull.
    let last = rows[0];
    for (const row of rows) {
      const diff = Date.parse(row.updated_at) - Date.parse(last.updated_at);
      if (diff > 0 || (diff === 0 && row.hole_number > last.hole_number)) last = row;
    }
    if (now - Date.parse(last.updated_at) < REMINDER_QUIET_MS) continue;

    const recipient = recipientFor(p.user_id, last.entered_by);
    if (recipient == null) continue;
    cardsByRecipient.set(recipient, [...(cardsByRecipient.get(recipient) ?? []), p.user_id]);
  }

  return players
    .filter((p) => cardsByRecipient.has(p.user_id))
    .map((p) => {
      const cardUserIds = cardsByRecipient.get(p.user_id)!;
      return {
        recipientId: p.user_id,
        cardUserIds,
        otherCardUserIds: cardUserIds.filter(
          (id) => id !== p.user_id && !sameTeamCard(id, p.user_id),
        ),
      };
    });
}
