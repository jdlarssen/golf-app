/**
 * The new-game wizard's local drafts, seen from outside the wizard (#2459).
 *
 * The drafts live in `localStorage` under `torny:wizard-draft:<userId>:<path>`
 * (`app/[locale]/admin/games/new/wizardStatePersistence.ts` owns reading and
 * writing). A draft holds other people's ids and e-mail addresses, so the
 * device-hygiene paths in `lib/sync/localDataCleanup.ts` must be able to wipe
 * it. They import this small module, not the wizard's persistence code, so the
 * global sync boot does not pull the wizard into every page.
 */

/** The prefix every wizard-draft key shares. */
export const WIZARD_DRAFT_KEY_PREFIX = 'torny:wizard-draft:';

/** Remove every wizard-draft key, for every user. Never throws. */
export function clearAllWizardDrafts(): void {
  try {
    if (typeof window === 'undefined') return;
    const store = window.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k !== null && k.startsWith(WIZARD_DRAFT_KEY_PREFIX)) keys.push(k);
    }
    for (const k of keys) store.removeItem(k);
  } catch {
    // Blocked storage: there is nothing stored to wipe.
  }
}
