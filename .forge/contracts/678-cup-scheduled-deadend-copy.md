# Contract: #678 — Cup match in «planlagt» shows dead-end for player

## Problem
Cup match games are created with `status='scheduled'` and `scheduled_tee_off_at = NULL`.
When a player opens `/games/[id]` for their cup match, the game-home page renders the
`scorecardOpensAtTeeOff` heading ("Scorekortet åpner ved tee-off.") — which is misleading
because there is no tee-off time to wait for. The `ScheduledWaitingRoom` countdown only
renders when `teeOffDate` is truthy (line 684), so with a null tee-off time the player
sees only "TEE-OFF: Ikke satt" and a generic footer. No explanation of what will actually
cause the scorecard to open, and no indication that an admin action is required.

## Minimal fix (copy-only, no schema change)
When `teeOffDate` is null inside the `status === 'scheduled'` branch:
1. Replace the `scorecardOpensAtTeeOff` heading with a new cup-specific key
   `scorecardOpensWhenOrganizerStarts` ("Scorekortet åpner når arrangøren starter kampen.").
2. Keep the `teeOffNotSet` display as-is (shows "Ikke satt" under TEE-OFF label).

The heading is the main user-visible message; changing it from «opens at tee-off» to «opens
when the organiser starts the match» removes the dead-end and gives the player a clear reason
to wait.

## Implementation
In `app/[locale]/games/[id]/(home)/page.tsx`, the scheduled branch renders:
```tsx
<h1 ...>{t('scorecardOpensAtTeeOff')}</h1>
```
Change to:
```tsx
<h1 ...>{teeOffDate ? t('scorecardOpensAtTeeOff') : t('scorecardOpensWhenOrganizerStarts')}</h1>
```

At this point in the code `teeOffDate` is already computed (line 452-454), so no new variable
is needed.

## New i18n keys
In `game.home` namespace:

| Key | no.json | en.json |
|-----|---------|---------|
| `scorecardOpensWhenOrganizerStarts` | `"Scorekortet åpner når arrangøren starter kampen."` | `"Your scorecard opens when the organiser starts the match."` |

## Files touched
- `app/[locale]/games/[id]/(home)/page.tsx` — conditional heading render
- `messages/no.json` — new key in `game.home`
- `messages/en.json` — new key in `game.home`

## Out of scope
- Adding `scheduled_tee_off_at` to cup match generation (longer-term fix)
- Bulk-start button on admin cup page
- Countdown timer or auto-start for cup matches
