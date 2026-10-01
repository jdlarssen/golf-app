import type { NotificationKind } from './types';

/**
 * One emoji per notification kind — the disc on an inbox row without a person
 * (#2263), and before that the bubble on the old inbox card. One home, so a new
 * kind is a compile error here until it has one.
 */
export const NOTIFICATION_EMOJI: Record<NotificationKind, string> = {
  invite: '📨',
  peer_approval_request: '✋',
  scorecard_submitted: '📋',
  scorecard_approved: '✅',
  // «sendt i retur» — bevisst ikke 🚫, som er tatt av registration_rejected
  // og betyr «du kom ikke med», et annet budskap.
  scorecard_rejected: '↩️',
  // #1363: «låst opp igjen» — kortet ditt er ute av arkivet og kan redigeres.
  // Bevisst ikke ↩️ (scorecard_rejected) som betyr «sendt i retur med grunn».
  scorecard_reopened: '🔓',
  game_finished: '🏆',
  // #1363: hele runden er spolt tilbake til aktiv — 🔄 leser som «i sving
  // igjen» uten å kollidere med 🏁/⛳ som allerede eier start og mål.
  game_reopened: '🔄',
  product_update: '✨',
  team_invite: '🤝',
  registration_request: '📩',
  registration_approved: '🎉',
  registration_rejected: '🚫',
  registration_expired: '⏱️',
  team_member_withdrew: '👋',
  deliver_reminder: '📤',
  cup_finished: '🏁',
  cup_started: '🏌️',
  cup_signup: '📝',
  // #1884: kampene er akkurat avdekket. 🎭 for at teppet går opp — bevisst
  // ikke 🏌️ (cup_started) eller 🏁 (cup_finished), som eier start og slutt.
  cup_lineup_revealed: '🎭',
  club_join_request: '🙋',
  club_role_changed: '🔑',
  friend_request: '👋',
  friend_accepted: '🫂',
  player_added: '🏌️',
  game_started: '⛳',
  auto_start_blocked: '⏳',
  achievement_unlocked: '🏅',
  idea_built: '💡',
  payment_reminder: '💸',
};
