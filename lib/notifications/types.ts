import { z } from 'zod';

/**
 * In-app notification-kindene som støttes. Polymorf `notifications`-tabell
 * (migrasjon 0032, utvidet 0035) bruker dette som CHECK-discriminator, og
 * payload-shape per kind valideres her i TypeScript-laget før insert.
 */
export type NotificationKind =
  | 'invite'
  | 'peer_approval_request'
  | 'scorecard_submitted'
  | 'scorecard_approved'
  | 'game_finished'
  | 'product_update'
  | 'team_invite'
  | 'registration_request'
  | 'registration_approved'
  | 'registration_rejected'
  | 'team_member_withdrew'
  | 'deliver_reminder';

// `z.guid()` aksepterer enhver UUID-shaped string (8-4-4-4-12 hex), inkludert
// nil-UUID og ikke-versjonerte kanoniske test-sentinels som "11111111-...".
// `z.string().uuid()` i Zod 4 håndhever RFC 9562-versjonert UUID, hvilket
// avviser test-sentinels — vi vil ha en mer permissiv sjekk her siden vi
// uansett mottar UUID fra Supabase (`gen_random_uuid()` → v4) eller fra
// kjente DB-rader.
const uuid = z.guid();

const inviteSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
  invited_by_name: z.string().min(1),
});

const peerApprovalRequestSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
  submitter_name: z.string().min(1),
});

const scorecardSubmittedSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
  player_name: z.string().min(1),
});

const scorecardApprovedSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
  approver_name: z.string().min(1),
});

const gameFinishedSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
});

// Product-update payload (issue #202). Source-id refererer til
// product_updates-raden så banner + innboks kan deeplinke til samme
// authoritative content. Link er valgfri intern rute (startsWith '/'),
// håndhevet her som defense-in-depth mot phishing-misbruk via banner/mail.
const productUpdateSchema = z.object({
  source_id: uuid,
  title: z.string().min(1),
  body: z.string().min(1),
  link: z.string().startsWith('/').optional(),
  cta_label: z.string().min(1).optional(),
});

// Selv-påmelding payload-skjemaer (issue #199).

// team_invite: kapteinen ber en kjent Tørny-bruker bli med i lag.
// request_id peker til game_registration_requests-raden invitéen kan akseptere/avslå.
// game_short_id er nødvendig for å deeplinke til /signup/[shortId]/team.
const teamInviteSchema = z.object({
  game_id: uuid,
  game_short_id: z.string().regex(/^[0-9a-z]{8}$/),
  game_name: z.string().min(1),
  team_name: z.string().min(1),
  invited_by_name: z.string().min(1),
  request_id: uuid,
});

// registration_request: noen meldte seg på et `open`-spill, ELLER ba om å
// bli med i et `manual_approval`-spill. Sendes til admin/creator.
// `request_id` er kun satt for manual_approval (deeplinker til godkjennings-
// siden); for open-modus utelates den fordi det ikke eksisterer en request-rad
// — admin trenger ingen handling, kun en heads-up at en spiller har joined.
const registrationRequestSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
  requester_name: z.string().min(1),
  request_id: uuid.optional(),
  message: z.string().optional(),
});

// registration_approved: admin godkjente forespørsel. Til søker.
const registrationApprovedSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
});

// registration_rejected: admin avslo forespørsel. Til søker.
const registrationRejectedSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
  reason: z.string().optional(),
});

// team_member_withdrew: medspiller trakk seg pre-start. Til kaptein.
// game_short_id for deeplink til /signup/[shortId]/team for å invitere ny medspiller.
const teamMemberWithdrewSchema = z.object({
  game_id: uuid,
  game_short_id: z.string().regex(/^[0-9a-z]{8}$/),
  game_name: z.string().min(1),
  withdrawn_player_name: z.string().min(1),
  team_name: z.string().min(1),
});

// deliver_reminder: spilleren har registrert alle 18 hull men ikke levert
// scorekortet. Fyres automatisk (game-home-render) eller manuelt fra admin-
// purringen. Deeplinker til /games/[game_id]/submit. Samme slanke payload
// som game_finished — game_name brukes i innboks-detalj + mail. (#376)
const deliverReminderSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
});

const schemas = {
  invite: inviteSchema,
  peer_approval_request: peerApprovalRequestSchema,
  scorecard_submitted: scorecardSubmittedSchema,
  scorecard_approved: scorecardApprovedSchema,
  game_finished: gameFinishedSchema,
  product_update: productUpdateSchema,
  team_invite: teamInviteSchema,
  registration_request: registrationRequestSchema,
  registration_approved: registrationApprovedSchema,
  registration_rejected: registrationRejectedSchema,
  team_member_withdrew: teamMemberWithdrewSchema,
  deliver_reminder: deliverReminderSchema,
} as const;

export type NotificationPayload<K extends NotificationKind = NotificationKind> =
  z.infer<(typeof schemas)[K]>;

export type ParsedNotification<K extends NotificationKind = NotificationKind> = {
  kind: K;
  payload: NotificationPayload<K>;
};

/**
 * Validér payload mot zod-skjema for gitt kind. Kastes hvis payload
 * mangler felter eller har feil typer — caller skal aldri lagre ugyldig
 * data i `notifications.payload`-JSONB-en (innboks-UI-en stoler på shape-en).
 */
export function parseNotificationPayload<K extends NotificationKind>(
  kind: K,
  raw: unknown,
): ParsedNotification<K> {
  const schema = schemas[kind];
  const payload = schema.parse(raw) as NotificationPayload<K>;
  return { kind, payload };
}
