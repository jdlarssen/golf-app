import type { NotificationKind, NotificationPayload } from './types';

/**
 * Strukturell delmengde av en notifikasjons-rad — deeplink-en avhenger kun av
 * kind + payload, så helperen tar ikke hele `NotificationRow` (unngår at
 * `lib/` peker tilbake på `components/`).
 */
export type DeeplinkInput = {
  kind: NotificationKind;
  payload: NotificationPayload;
};

/**
 * Per-kind mål-rute for et innboks-varsel, ELLER `null` når varselet ikke har
 * noe meningsfullt sted å ta brukeren.
 *
 * `null` returneres for varsler som tidligere falt tilbake til `/innboks`
 * (seg selv): `registration_rejected` og `product_update` uten lenke. Et
 * `router.push('/innboks')` mens du allerede står på innboksen ga null synlig
 * endring og fikk varselet til å føles ødelagt (#613). Caller skal kun navigere
 * når denne returnerer en non-null sti — mark-as-read skjer uansett.
 *
 * `product_update` returnerer ALLTID `null`: en lansering kan ha lang brødtekst,
 * og helkort-navigering kasta deg ut til lenken før du fikk lest ferdig. Lenken
 * nås nå via en dedikert CTA-knapp i kortet (samme mønster som hjem-banneret),
 * slik at selve kort-tappen bare markerer som lest.
 */
export function notificationDestination(n: DeeplinkInput): string | null {
  if (n.kind === 'product_update') {
    return null;
  }
  switch (n.kind) {
    case 'invite':
    case 'scorecard_approved':
    case 'registration_approved': {
      const p = n.payload as NotificationPayload<'invite'>;
      return `/games/${p.game_id}`;
    }
    case 'peer_approval_request': {
      const p = n.payload as NotificationPayload<'peer_approval_request'>;
      return `/games/${p.game_id}/approve`;
    }
    case 'scorecard_submitted': {
      const p = n.payload as NotificationPayload<'scorecard_submitted'>;
      return `/admin/games/${p.game_id}`;
    }
    case 'game_finished': {
      const p = n.payload as NotificationPayload<'game_finished'>;
      return `/games/${p.game_id}/leaderboard`;
    }
    case 'team_invite': {
      const p = n.payload as NotificationPayload<'team_invite'>;
      return `/signup/${p.game_short_id}/team`;
    }
    case 'registration_request': {
      const p = n.payload as NotificationPayload<'registration_request'>;
      return `/admin/games/${p.game_id}/signups`;
    }
    case 'registration_rejected':
      // Avslaget har ingen egen side; søkeren leser bare beskjeden i kortet.
      return null;
    case 'team_member_withdrew': {
      const p = n.payload as NotificationPayload<'team_member_withdrew'>;
      return `/signup/${p.game_short_id}/team`;
    }
    case 'deliver_reminder': {
      const p = n.payload as NotificationPayload<'deliver_reminder'>;
      return `/games/${p.game_id}/submit`;
    }
    case 'cup_finished': {
      const p = n.payload as NotificationPayload<'cup_finished'>;
      return `/cup/${p.tournament_id}`;
    }
    case 'cup_started': {
      const p = n.payload as NotificationPayload<'cup_started'>;
      return `/cup/${p.tournament_id}`;
    }
    case 'club_join_request': {
      const p = n.payload as NotificationPayload<'club_join_request'>;
      return `/klubber/${p.group_id}`;
    }
    case 'club_role_changed': {
      const p = n.payload as NotificationPayload<'club_role_changed'>;
      return `/klubber/${p.group_id}`;
    }
    case 'friend_request':
    case 'friend_accepted':
      return '/profile/venner';
    case 'player_added': {
      const p = n.payload as NotificationPayload<'player_added'>;
      return `/games/${p.game_id}`;
    }
    case 'game_started': {
      const p = n.payload as NotificationPayload<'game_started'>;
      return `/games/${p.game_id}`;
    }
    case 'auto_start_blocked': {
      // Oppretteren lander på spill-siden der #544-venter-banneret og
      // roster-status viser hva som mangler.
      const p = n.payload as NotificationPayload<'auto_start_blocked'>;
      return `/games/${p.game_id}`;
    }
    case 'achievement_unlocked':
      // Lander på Statistikk-fanen i historikk der badge-veggen bor (#947).
      return '/profile/historikk';
    case 'idea_built':
      // «Vi bygde det du foreslo» har ingen egen side — beskjeden leses i
      // kortet (samme mønster som registration_rejected).
      return null;
  }
}
