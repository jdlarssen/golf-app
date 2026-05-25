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
  | 'product_update';

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

const schemas = {
  invite: inviteSchema,
  peer_approval_request: peerApprovalRequestSchema,
  scorecard_submitted: scorecardSubmittedSchema,
  scorecard_approved: scorecardApprovedSchema,
  game_finished: gameFinishedSchema,
  product_update: productUpdateSchema,
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
