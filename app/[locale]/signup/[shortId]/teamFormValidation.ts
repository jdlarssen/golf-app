/**
 * Pure client-side validators for the team registration form (#362). They
 * return error CODES (keys into `signup.errors.*`) + interpolation values,
 * and the form translates them. The team-name bounds come from
 * `lib/games/registration.ts`, which the server reads too (#2222). The
 * e-mail seats' validators went with the e-mail path (#2840).
 */

// The name rule lives in `lib/games/teamName.ts` since #2840, so the app's
// team form reads the same one; re-exported here for the web form.
export { validateTeamName, type TeamNameValidationError } from '@/lib/games/teamName';
