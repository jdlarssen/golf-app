import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Delte kaptein-oppslag for lag-flyten (#1343).
 *
 * Bor utenfor `teamActions.ts` fordi den fila er `'use server'` — alt som
 * eksporteres derfra blir en server-action. Både attach-action-en og
 * `/signup/[shortId]/team`-siden trenger de samme to reglene, og en regel
 * skal ha ett hjem (AGENTS.md trap 4).
 */

/** Minimum en rad må bære for at pickeren skal kunne velge den. */
type CaptainCandidate = { user_id: string };

export type CaptainPick<T extends CaptainCandidate> = {
  row: T;
  source: 'invited_by' | 'fallback';
};

/**
 * Velg hvilken kaptein-request en e-post-invitert medspiller hører til.
 *
 * `invitations.invited_by` peker på den som sendte invitasjonen. Er det en
 * kaptein i spillet, er svaret sikkert (`source: 'invited_by'`) — det finnes
 * maks én kaptein-rad per bruker per spill (unique (game_id, user_id), 0042).
 * Er inviteren arrangøren eller en kaptein som har trukket laget, vet vi ikke
 * hvilket lag invitéen hører til, og vi faller tilbake på dagens heuristikk:
 * nyeste lag (`source: 'fallback'`). Callere som viser lagnavn i UI skal kun
 * stole på `'invited_by'` — å navngi feil lag er verre enn å la være.
 *
 * Ren funksjon: `rows` forventes sortert nyest først (`order created_at desc`),
 * så fallback er `rows[0]`.
 */
export function pickCaptainRequest<T extends CaptainCandidate>(
  rows: T[],
  invitedBy: string | null | undefined,
): CaptainPick<T> | null {
  if (rows.length === 0) return null;
  const invited = invitedBy
    ? rows.find((r) => r.user_id === invitedBy)
    : undefined;
  if (invited) return { row: invited, source: 'invited_by' };
  return { row: rows[0], source: 'fallback' };
}

/** Minimum en invitasjons-rad må bære for at invitasjons-pickeren skal virke. */
type InvitationCandidate = { invited_by: string | null };

/**
 * Velg hvilken åpen invitasjon vi skal gå videre med for en e-post.
 *
 * Det finnes ingen unique på (email, game_id): både arrangøren og en kaptein
 * kan ha invitert samme e-post til samme spill. Tar vi bare den nyeste, kan
 * arrangørens invitasjon skygge for kapteinens — og da havner invitéen i
 * stopp-skjermen selv om laget er sikkert kjent. Derfor: en invitasjon sendt
 * av en kaptein i spillet vinner (sikkert treff), ellers nyeste rad (#1343).
 *
 * Ren funksjon: `invitations` forventes sortert nyest først
 * (`order created_at desc`), så fallback er `invitations[0]`.
 */
export function pickPendingInvitation<T extends InvitationCandidate>(
  invitations: T[],
  captainUserIds: ReadonlySet<string> | string[],
): T | null {
  if (invitations.length === 0) return null;
  const captains = Array.isArray(captainUserIds)
    ? new Set(captainUserIds)
    : captainUserIds;
  const fromCaptain = invitations.find(
    (i) => i.invited_by != null && captains.has(i.invited_by),
  );
  return fromCaptain ?? invitations[0];
}

/**
 * Visningsnavn for en kaptein: navn (eller e-post hvis navnet mangler), med
 * kallenavn i «» når det finnes.
 *
 * Returnerer null når bruker-raden mangler — NotificationCard fyller inn den
 * locale-korrekte fallbacken ved render, så payloads holdes locale-agnostiske
 * (#583).
 */
export async function getCaptainDisplayName(
  userId: string,
): Promise<string | null> {
  const admin = getAdminClient();
  const { data } = await admin
    .from('users')
    .select('name, nickname, email')
    .eq('id', userId)
    .maybeSingle<{
      name: string | null;
      nickname: string | null;
      email: string;
    }>();
  if (!data) return null;
  const base = data.name?.trim() || data.email;
  return data.nickname ? `${base} «${data.nickname}»` : base;
}
