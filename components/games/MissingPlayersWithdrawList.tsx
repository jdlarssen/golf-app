/**
 * The id of the «Avslutt likevel» submit form on both confirm pages. The
 * withdraw checkboxes live OUTSIDE that form (RemindMissing's own form sits in
 * between, and forms cannot nest), so they bind to it by id (#1932). One
 * constant, so the checkbox side and the form side cannot drift apart.
 */
export const END_ANYWAY_FORM_ID = 'end-anyway-form';

/**
 * «Disse mangler kort»-blokka med «Marker som trukket»-haker (#386), delt av
 * admins `/avslutt-likevel` og oppretterens `/games/[id]/avslutt` — to flater,
 * én markup (trap 4).
 *
 * #1932: hakene lå utenfor innsendingsskjemaet og nådde aldri serveren. Hver
 * hake bærer nå `form={formId}`, så nettleseren tar den med i skjemaets
 * FormData uansett hvor i DOM-en den står.
 *
 * Kallstedet eier tekst og navn: `heading`/`withdrawLabel` kommer ferdig
 * oversatt (de to flatene har hver sin nøkkel), og `displayName` ferdig
 * formatert (hver flate har sin egen navneregel).
 *
 * `selfUserId` (D8): raden til den som avslutter vises uten hake. En ikke-admin
 * arrangør kan ikke trekke seg selv (databasevakten i 0168, ledd c), og én
 * slik rad i utvalget ville feilet hele det samlede skrivet. Samme regel som
 * appen (`endGamePlan.ts`: `player.userId !== organiserUserId`).
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
  /** WD tilbys kun for in-scope-modi; ellers vises lista uten haker. */
  allowWd: boolean;
  /** `id`-en til skjemaet hakene skal sendes med — bruk `END_ANYWAY_FORM_ID`. */
  formId: string;
  /** Den innloggede arrangøren, hvis hen ikke kan trekke seg selv. */
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
