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
  | 'registration_expired'
  | 'team_member_withdrew'
  | 'deliver_reminder'
  | 'cup_finished'
  | 'cup_started'
  | 'club_join_request'
  | 'club_role_changed'
  | 'friend_request'
  | 'friend_accepted'
  | 'player_added'
  | 'game_started'
  | 'auto_start_blocked'
  | 'achievement_unlocked'
  | 'idea_built'
  | 'payment_reminder';

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
  // team_name + invited_by_name nullable: NotificationCard fills the locale
  // fallback at render time so payloads stay locale-agnostic (#583).
  team_name: z.string().min(1).nullable().optional(),
  invited_by_name: z.string().min(1).nullable().optional(),
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
  // requester_name nullable + optional team_name: the card composes the display
  // name («Navn (kaptein for Lag)») at render time in the recipient locale (#583).
  requester_name: z.string().min(1).nullable().optional(),
  team_name: z.string().min(1).optional(),
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
  // reason = free-text DB content (admin rejection), rendered verbatim.
  // reason_code = app-generated reason, localised at render time (#583).
  reason: z.string().optional(),
  reason_code: z.enum(['team_removed']).optional(),
});

// registration_expired: spillet startet før admin fikk avgjort forespørselen
// (#1055). Fyres fra startScheduledGame — ALLE fortsatt-pending requests for
// spillet flippes til 'rejected' og hver søker får dette varselet i stedet
// for registration_rejected (som impliserer en aktiv admin-avgjørelse). Slank
// payload som registration_approved — ingen reason, siden "runden startet"
// ER grunnen.
const registrationExpiredSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
});

// team_member_withdrew: medspiller trakk seg pre-start. Til kaptein.
// game_short_id for deeplink til /signup/[shortId]/team for å invitere ny medspiller.
const teamMemberWithdrewSchema = z.object({
  game_id: uuid,
  game_short_id: z.string().regex(/^[0-9a-z]{8}$/),
  game_name: z.string().min(1),
  // nullable: NotificationCard fills the locale fallback at render time (#583).
  withdrawn_player_name: z.string().min(1).nullable().optional(),
  team_name: z.string().min(1).nullable().optional(),
});

// deliver_reminder: spilleren har registrert alle 18 hull men ikke levert
// scorekortet. Fyres automatisk (game-home-render) eller manuelt fra admin-
// purringen. Deeplinker til /games/[game_id]/submit. Samme slanke payload
// som game_finished — game_name brukes i innboks-detalj + mail. (#376)
const deliverReminderSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
});

// cup_finished: en cup (tournament av matcher) er avsluttet. Fyres til alle
// cup-deltakere fra `finishTournament` — in-app først, mail kun til off-app
// (samme prinsipp som game_finished). Slank payload speiler game_finished:
// tournament_name brukes i innboks-detalj, tournament_id i deeplink til
// /cup/[id]. (#377)
const cupFinishedSchema = z.object({
  tournament_id: uuid,
  tournament_name: z.string().min(1),
});

// cup_started: en cup (tournament av matcher) er startet. Fyres til alle
// cup-deltakere fra `startTournament` — in-app først, mail kun til off-app
// (symmetrisk søster av cup_finished, #417). Identisk slank payload:
// tournament_name brukes i innboks-detalj, tournament_id i deeplink til
// /cup/[id].
const cupStartedSchema = z.object({
  tournament_id: uuid,
  tournament_name: z.string().min(1),
});

// club_join_request: noen ba om å bli med i en klubb via del-lenken. Sendes til
// klubbens eier(e)/admin(er). group_id deeplinker til /klubber/[group_id] hvor
// forespørselen godkjennes/avslås. (#442)
const clubJoinRequestSchema = z.object({
  group_id: uuid,
  group_name: z.string().min(1),
  requester_name: z.string().min(1),
});

// club_role_changed: en klubb-eier endret et medlems rolle. Sendes til den
// berørte. group_id deeplinker til /klubber/[group_id]. new_role er den nye
// rollen. (#50)
const clubRoleChangedSchema = z.object({
  group_id: uuid,
  group_name: z.string().min(1),
  new_role: z.enum(['owner', 'admin', 'member']),
});

// friend_request: noen sendte deg en venneforespørsel. Sendes til mottaker.
// Vennelista (/profile/venner) samler godta/avslå; actor_name vises i kortet.
// actor_name is optional (null) — NotificationCard renders the catalog fallback
// at render time in the correct locale (§4 payload-fallback, i18n phase 2e).
const friendRequestSchema = z.object({
  actor_id: uuid,
  actor_name: z.string().min(1).nullable().optional(),
});

// friend_accepted: noen godtok venneforespørselen din. Sendes til avsender. (#369)
// actor_name is optional (null) — same render-time fallback as friend_request.
const friendAcceptedSchema = z.object({
  actor_id: uuid,
  actor_name: z.string().min(1).nullable().optional(),
});

// player_added: en arrangør la deg til i et spill uten at du meldte deg på
// selv. Mottaker oppfordres til å bekrefte deltakelse. Deeplinker til
// /games/[game_id] — å åpne spillet auto-bekrefter. (#463)
const playerAddedSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
  added_by_name: z.string().min(1),
});

// game_started: et planlagt spill flippet til aktivt (#502). Fyres til alle
// aktive spillere fra stien som vant status-flippen (cron-sweep, E1-fallback
// eller admin-knappen) — kun in-app, ingen mail (start-øyeblikket er
// tidskritisk på minutt-nivå; blir push-kandidat når #24 bygges). Samme
// slanke payload som game_finished, deeplinker til /games/[game_id].
const gameStartedSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
});

// auto_start_blocked: cron-sweepen fikk ikke startet spillet på tee-tid
// (#502). Fyres maks én gang per spill til oppretteren, med årsaken fra
// startScheduledGame (incomplete_sides, pending_players, …). `reason` er
// bevisst løst typet — kortet oversetter kjente verdier og har generisk
// fallback, så nye reasons ikke krever schema-endring.
const autoStartBlockedSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
  reason: z.string().min(1),
});

// achievement_unlocked: spilleren låste opp ≥1 notabelt øyeblikk i en runde
// (#947). Fyres ved spill-avslutning, kun til spilleren selv, og bundlet til
// ÉTT varsel som oppsummerer alle øyeblikkene (`selectNotableMoments`). `moments`
// er aldri tom — fire-helperen sender ikke uten minst ett øyeblikk. Birdie er
// aldri med (for vanlig). Deeplinker til /profile/historikk (badge-veggen).
const achievementUnlockedSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
  moments: z
    .array(
      z.object({
        kind: z.enum(['hole_in_one', 'eagle', 'turkey', 'snowman']),
        count: z.number().int().positive(),
      }),
    )
    .min(1),
});

// idea_built: innsenderen av en idé (#984) fikk idéen sin bygd. Fyres når admin
// markerer en `idea_submissions`-rad som bygd. Generisk «Vi bygde det du
// foreslo»-kort uten payload-avhengig tekst; `submission_id` lagres for
// sporbarhet (deeplinker ikke — beskjeden ER belønningen).
const ideaBuiltSchema = z.object({
  submission_id: uuid,
});

// payment_reminder: arrangøren purrer en spiller som mangler å betale
// startkontingenten (#1049). Fyres manuelt fra betaling-cockpiten
// (remindUnpaidPlayers) — in-app + mail-if-off-app. Deeplinker til
// /games/[game_id] der PaymentInfo viser beløp + betalingsmåte. Payload bærer
// beløp + lenke så kort/mail kan vise dem uten et ekstra oppslag; payment_link
// er nullable (kontingent uten oppgitt lenke er lov).
const paymentReminderSchema = z.object({
  game_id: uuid,
  game_name: z.string().min(1),
  entry_fee_kr: z.number().int().nonnegative(),
  payment_link: z.string().min(1).nullable().optional(),
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
  registration_expired: registrationExpiredSchema,
  team_member_withdrew: teamMemberWithdrewSchema,
  deliver_reminder: deliverReminderSchema,
  cup_finished: cupFinishedSchema,
  cup_started: cupStartedSchema,
  club_join_request: clubJoinRequestSchema,
  club_role_changed: clubRoleChangedSchema,
  friend_request: friendRequestSchema,
  friend_accepted: friendAcceptedSchema,
  player_added: playerAddedSchema,
  game_started: gameStartedSchema,
  auto_start_blocked: autoStartBlockedSchema,
  achievement_unlocked: achievementUnlockedSchema,
  idea_built: ideaBuiltSchema,
  payment_reminder: paymentReminderSchema,
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
