import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { expectAffected } from '@/lib/supabase/affectedRows';
import {
  sendInviteNotification,
  type InviteNotificationParams,
} from '@/lib/mail/inviteNotification';

/**
 * The sender name in a game invitation: the inviter's name, otherwise the role.
 * One home for the e-mail core, `sendHeldGameInvites` and «Send på nytt» (#2445).
 */
export function inviteMailSenderName(name: string | null, isAdmin: boolean): string {
  return name?.trim() || (isAdmin ? 'Admin' : 'En arrangør');
}

/**
 * What happened to an open invitation (#2445).
 *
 * - `sent`: the deadline was pushed out and the mail went out.
 * - `extended`: the deadline was pushed out, no mail asked for (a held
 *   invitation on a draft).
 * - `extend_failed`: the write failed or matched 0 rows. No mail went out.
 * - `mail_failed`: the deadline was pushed out, the mail threw.
 */
export type ExtendAndMailResult = 'sent' | 'extended' | 'extend_failed' | 'mail_failed';

/**
 * Push an open invitation's deadline out, then mail it. The one home for
 * «extend, then send» (#2445): the e-mail core's open-invitation branch, the
 * held invitations a publish sends (`sendHeldGameInvites`) and the admin's
 * «Send på nytt» (`resendInvitation`) all come through here, and none of them
 * writes the deadline or mails an existing row itself.
 *
 * The order is the rule (#1381/#1613): the deadline is extended BEFORE the
 * mail, and without a valid deadline no mail goes out. An expired-but-
 * unaccepted row would otherwise get a mail the login gate refuses
 * (`email_is_invited` requires `expires_at > now()`, migration 0100).
 *
 * The caller picks the client (the service client in the core and in
 * `sendHeldGameInvites`, the admin's own client in `resendInvitation`), the
 * deadline (game or app TTL) and what each outcome means. The helper never
 * swallows an outcome and never logs the address.
 */
export async function extendAndMailInvitation(args: {
  client: SupabaseClient<Database>;
  invitationId: string;
  expiresAt: string;
  /** `null` = extend only: the invitation is held and mailed later. */
  mail: Omit<InviteNotificationParams, 'expiresAt'> | null;
  /** The `expectAffected` label, e.g. 'inviteEmailToGameCore.extendExpiry'. */
  label: string;
}): Promise<ExtendAndMailResult> {
  const { client, invitationId, expiresAt, mail, label } = args;

  try {
    expectAffected(
      await client
        .from('invitations')
        .update({ expires_at: expiresAt })
        .eq('id', invitationId)
        .is('accepted_at', null)
        .select('id'),
      label,
    );
  } catch (error) {
    // Plain Error on a DB refusal, NoRowsAffectedError when the row was
    // accepted or deleted between the caller's read and this write
    // (AGENTS.md trap 2). Either way: no mail without a valid deadline.
    console.error('[extendAndMailInvitation] expiry extend failed', {
      invitationId,
      label,
      error,
    });
    return 'extend_failed';
  }

  if (mail === null) return 'extended';

  try {
    await sendInviteNotification({ ...mail, expiresAt });
  } catch (error) {
    console.error('[extendAndMailInvitation] mail failed', { invitationId, label, error });
    return 'mail_failed';
  }
  return 'sent';
}
