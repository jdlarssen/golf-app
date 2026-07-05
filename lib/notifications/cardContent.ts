import type { NotificationKind, NotificationPayload } from './types';
import { formatKr } from '@/lib/format/formatKr';

/**
 * Minimal translator shape shared by client `useTranslations('inbox')` and the
 * server-side `createTranslator(...namespace:'inbox')`. Typed loosely on the key
 * so dynamic keys (e.g. reason codes) and both translator implementations fit.
 */
export type NotificationTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/**
 * Builds the title + one-line detail for a notification, per kind, from the
 * `inbox` catalog. Single source of truth used by both the inbox card (client)
 * and Web Push (server). Moved out of NotificationCard so push reuses it (#24).
 */
export function buildNotificationText(
  kind: NotificationKind,
  payload: NotificationPayload,
  t: NotificationTranslator,
): { title: string; detail: string } {
  switch (kind) {
    case 'invite': {
      const p = payload as NotificationPayload<'invite'>;
      return {
        title: t('kinds.invite.title', { invitedByName: p.invited_by_name }),
        detail: t('kinds.invite.detail', { gameName: p.game_name }),
      };
    }
    case 'peer_approval_request': {
      const p = payload as NotificationPayload<'peer_approval_request'>;
      return {
        title: t('kinds.peerApprovalRequest.title'),
        detail: t('kinds.peerApprovalRequest.detail', {
          submitterName: p.submitter_name,
          gameName: p.game_name,
        }),
      };
    }
    case 'scorecard_submitted': {
      const p = payload as NotificationPayload<'scorecard_submitted'>;
      return {
        title: t('kinds.scorecardSubmitted.title'),
        detail: t('kinds.scorecardSubmitted.detail', {
          playerName: p.player_name,
          gameName: p.game_name,
        }),
      };
    }
    case 'scorecard_approved': {
      const p = payload as NotificationPayload<'scorecard_approved'>;
      return {
        title: t('kinds.scorecardApproved.title'),
        detail: t('kinds.scorecardApproved.detail', {
          approverName: p.approver_name,
          gameName: p.game_name,
        }),
      };
    }
    case 'game_finished': {
      const p = payload as NotificationPayload<'game_finished'>;
      return {
        title: t('kinds.gameFinished.title'),
        detail: t('kinds.gameFinished.detail', { gameName: p.game_name }),
      };
    }
    case 'product_update': {
      const p = payload as NotificationPayload<'product_update'>;
      // product_update title/body are DB content — render verbatim in both locales
      return {
        title: p.title,
        detail: p.body,
      };
    }
    case 'team_invite': {
      const p = payload as NotificationPayload<'team_invite'>;
      return {
        title: t('kinds.teamInvite.title', {
          invitedByName: p.invited_by_name ?? t('somePlayerFallback'),
          teamName: p.team_name ?? t('someTeamFallback'),
        }),
        detail: t('kinds.teamInvite.detail', { gameName: p.game_name }),
      };
    }
    case 'registration_request': {
      const p = payload as NotificationPayload<'registration_request'>;
      // Compose the display name at render time: plain name, optionally wrapped
      // as «Navn (kaptein for Lag)» when the request is a team captain's (#583).
      const name = p.requester_name ?? t('somePlayerFallback');
      const requesterName = p.team_name
        ? t('kinds.registrationRequest.captainOf', { name, teamName: p.team_name })
        : name;
      return {
        title: t('kinds.registrationRequest.title', { requesterName }),
        detail: t('kinds.registrationRequest.detail', { gameName: p.game_name }),
      };
    }
    case 'registration_approved': {
      const p = payload as NotificationPayload<'registration_approved'>;
      return {
        title: t('kinds.registrationApproved.title', { gameName: p.game_name }),
        detail: t('kinds.registrationApproved.detail'),
      };
    }
    case 'registration_rejected': {
      const p = payload as NotificationPayload<'registration_rejected'>;
      return {
        title: t('kinds.registrationRejected.title', { gameName: p.game_name }),
        // reason = free-text DB content (admin rejection), rendered verbatim.
        // reason_code = app-generated reason, localised here; else generic fallback (#583).
        detail:
          p.reason ??
          (p.reason_code
            ? t(`kinds.registrationRejected.reasonCodes.${p.reason_code}`)
            : t('kinds.registrationRejected.defaultReason')),
      };
    }
    case 'registration_expired': {
      const p = payload as NotificationPayload<'registration_expired'>;
      return {
        title: t('kinds.registrationExpired.title', { gameName: p.game_name }),
        detail: t('kinds.registrationExpired.detail'),
      };
    }
    case 'team_member_withdrew': {
      const p = payload as NotificationPayload<'team_member_withdrew'>;
      return {
        title: t('kinds.teamMemberWithdrew.title', {
          withdrawnPlayerName: p.withdrawn_player_name ?? t('somePlayerFallback'),
        }),
        detail: t('kinds.teamMemberWithdrew.detail', {
          teamName: p.team_name ?? t('someTeamFallback'),
          gameName: p.game_name,
        }),
      };
    }
    case 'deliver_reminder': {
      const p = payload as NotificationPayload<'deliver_reminder'>;
      return {
        title: t('kinds.deliverReminder.title'),
        detail: t('kinds.deliverReminder.detail', { gameName: p.game_name }),
      };
    }
    case 'cup_finished': {
      const p = payload as NotificationPayload<'cup_finished'>;
      return {
        title: t('kinds.cupFinished.title'),
        detail: t('kinds.cupFinished.detail', { tournamentName: p.tournament_name }),
      };
    }
    case 'cup_started': {
      const p = payload as NotificationPayload<'cup_started'>;
      return {
        title: t('kinds.cupStarted.title'),
        detail: t('kinds.cupStarted.detail', { tournamentName: p.tournament_name }),
      };
    }
    case 'club_join_request': {
      const p = payload as NotificationPayload<'club_join_request'>;
      return {
        title: t('kinds.clubJoinRequest.title', { requesterName: p.requester_name }),
        detail: t('kinds.clubJoinRequest.detail', { groupName: p.group_name }),
      };
    }
    case 'club_role_changed': {
      const p = payload as NotificationPayload<'club_role_changed'>;
      const detail =
        p.new_role === 'owner'
          ? t('kinds.clubRoleChanged.detailOwner', { groupName: p.group_name })
          : p.new_role === 'admin'
            ? t('kinds.clubRoleChanged.detailAdmin', { groupName: p.group_name })
            : t('kinds.clubRoleChanged.detailMember', { groupName: p.group_name });
      return {
        title: t('kinds.clubRoleChanged.title'),
        detail,
      };
    }
    case 'friend_request': {
      const p = payload as NotificationPayload<'friend_request'>;
      return {
        title: t('kinds.friendRequest.title', {
          actorName: p.actor_name ?? t('someoneFallback'),
        }),
        detail: t('kinds.friendRequest.detail'),
      };
    }
    case 'friend_accepted': {
      const p = payload as NotificationPayload<'friend_accepted'>;
      return {
        title: t('kinds.friendAccepted.title', {
          actorName: p.actor_name ?? t('someoneFallback'),
        }),
        detail: t('kinds.friendAccepted.detail'),
      };
    }
    case 'player_added': {
      const p = payload as NotificationPayload<'player_added'>;
      return {
        title: t('kinds.playerAdded.title', {
          addedByName: p.added_by_name,
          gameName: p.game_name,
        }),
        detail: t('kinds.playerAdded.detail'),
      };
    }
    case 'game_started': {
      const p = payload as NotificationPayload<'game_started'>;
      return {
        title: t('kinds.gameStarted.title'),
        detail: t('kinds.gameStarted.detail', { gameName: p.game_name }),
      };
    }
    case 'auto_start_blocked': {
      const p = payload as NotificationPayload<'auto_start_blocked'>;
      return {
        title: t('kinds.autoStartBlocked.title'),
        detail: t('kinds.autoStartBlocked.detail', {
          gameName: p.game_name,
          reason: blockReasonText(p.reason, t),
        }),
      };
    }
    case 'achievement_unlocked': {
      const p = payload as NotificationPayload<'achievement_unlocked'>;
      // Neutral umbrella title covers both brags (ace/eagle/turkey) and the
      // snowman «moment» without congratulating a blunder. Detail lists the
      // moments + game name; «×N» only when a moment happened more than once.
      const moments = p.moments
        .map((m) => {
          const label = t(`kinds.achievementUnlocked.moments.${MOMENT_KEY[m.kind]}`);
          return m.count > 1 ? `${label} ×${m.count}` : label;
        })
        .join(', ');
      return {
        title: t('kinds.achievementUnlocked.title'),
        detail: t('kinds.achievementUnlocked.detail', {
          moments,
          gameName: p.game_name,
        }),
      };
    }
    case 'idea_built':
      // Generisk delight-kort: «Vi bygde det du foreslo». Payload har bare
      // submission_id (sporbarhet), ikke noe tekst å vise.
      return {
        title: t('kinds.ideaBuilt.title'),
        detail: t('kinds.ideaBuilt.detail'),
      };
    case 'payment_reminder': {
      const p = payload as NotificationPayload<'payment_reminder'>;
      return {
        title: t('kinds.paymentReminder.title'),
        detail: t('kinds.paymentReminder.detail', {
          gameName: p.game_name,
          amount: formatKr(p.entry_fee_kr),
        }),
      };
    }
  }
}

// Maps the payload's snake_case moment kind to its camelCase `inbox` catalog key.
const MOMENT_KEY: Record<'hole_in_one' | 'eagle' | 'turkey' | 'snowman', string> = {
  hole_in_one: 'holeInOne',
  eagle: 'eagle',
  turkey: 'turkey',
  snowman: 'snowman',
};

type BlockReasonKey =
  | 'incomplete_sides'
  | 'pending_players'
  | 'no_players'
  | 'tee_missing'
  | 'tee_missing_rating'
  | 'rotation_player_count';

const KNOWN_BLOCK_REASONS: ReadonlySet<string> = new Set<BlockReasonKey>([
  'incomplete_sides',
  'pending_players',
  'no_players',
  'tee_missing',
  'tee_missing_rating',
  // #969: Wolf/Round Robin couldn't draw a rotation — too few/many signed up.
  'rotation_player_count',
]);

/**
 * Translates the block reason from startScheduledGame to something the creator
 * can act on. Generic fallback for unknown/future reasons — the payload schema
 * is intentionally loosely typed (see types.ts).
 */
function blockReasonText(reason: string, t: NotificationTranslator): string {
  if (KNOWN_BLOCK_REASONS.has(reason)) {
    return t(`blockReasons.${reason as BlockReasonKey}`);
  }
  return t('blockReasons.default');
}
