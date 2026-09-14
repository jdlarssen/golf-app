/**
 * The id of the «Avslutt likevel» submit form on both confirm pages. The
 * withdraw checkboxes live OUTSIDE that form (RemindMissing's own form sits in
 * between, and forms cannot nest), so they bind to it by id (#1932). One
 * constant, so the checkbox side and the form side cannot drift apart.
 */
export const END_ANYWAY_FORM_ID = 'end-anyway-form';

/**
 * The «these players have not submitted» box with per-player «Marker som
 * trukket» checkboxes (#386), shared by the admin `/avslutt-likevel` page and
 * the creator's `/games/[id]/avslutt` page: two surfaces, one markup (trap 4).
 *
 * #1932: the checkboxes used to sit outside the submit form and never reached
 * the server. Each one now carries `form={formId}`, so the browser includes it
 * in that form's FormData wherever it sits in the DOM.
 *
 * The call site owns text and names: `heading`/`withdrawLabel` arrive already
 * translated (each surface has its own message key), and `displayName` arrives
 * already formatted (each surface has its own name rule).
 *
 * `selfUserId` (#1932): the signed-in organiser's row renders without a
 * checkbox. The 0168 guard, clause (c), rejects a non-admin withdrawing
 * themselves, and one such row in the batch would fail the whole write. Same
 * rule as the app (`native/app/src/lib/endGamePlan.ts`:
 * `player.userId !== organiserUserId`).
 */
export function MissingPlayersWithdrawList({
  players,
  allowWd,
  formId,
  selfUserId,
  heading,
  withdrawLabel,
}: {
  players: { userId: string; displayName: string }[];
  /** Withdrawal is offered for in-scope modes only; otherwise no checkboxes. */
  allowWd: boolean;
  /** The `id` of the form the checkboxes submit with: `END_ANYWAY_FORM_ID`. */
  formId: string;
  /** The signed-in organiser: their own row renders without a checkbox, same rule as the app. */
  selfUserId?: string;
  heading: string;
  withdrawLabel: string;
}) {
  return (
    <div
      data-testid="missing-players-withdraw-list"
      className="rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-warning-text"
    >
      <p className="font-medium">{heading}</p>
      <ul className="mt-2 space-y-2">
        {players.map(({ userId, displayName }) =>
          allowWd && userId !== selfUserId ? (
            <li key={userId} className="flex items-center gap-3">
              <label className="flex min-h-[44px] flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  form={formId}
                  name={`withdraw_${userId}`}
                  value="on"
                  className="h-4 w-4 rounded accent-primary"
                />
                <span className="text-sm text-text">{displayName}</span>
                <span className="ml-auto text-xs text-muted">{withdrawLabel}</span>
              </label>
            </li>
          ) : (
            <li key={userId} className="text-sm text-text">
              {displayName}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
