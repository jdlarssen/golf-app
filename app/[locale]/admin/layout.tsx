import { ReactNode } from 'react';
import { IntlScope } from '@/components/i18n/IntlScope';
import { getRole } from './_dashboardContext';

// Klubbhuset (#392): `/admin` is the universal «Klubbhuset» room. The layout
// gate is now AUTH-ONLY — every logged-in user may enter, and the page renders
// a role-appropriate subset of tiles. `getRoleContext` redirects to `/login`
// when there is no session but does NOT role-gate.
//
// Access to admin DATA stays locked because the gating moved one level in:
//  - `app/admin/page.tsx` branches its tiles/ledger on role (regular players
//    get only Spill + Baner, no admin counts or activity ledger).
//  - Every admin-only sub-route keeps its own `requireAdmin*` gate (audited
//    #392), so a non-admin who deep-links to e.g. `/admin/spillere` is bounced.
//  - The roster/email-bearing `/admin/games/new` self-gates with a role check
//    and sends non-admins to their own `/opprett-spill` flow.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  // `getRole` is `getRoleContext` cached for the request: the /admin page and
  // the route skeleton (loading.tsx, which picks its page colour by role,
  // #2493) reuse this one lookup instead of making their own.
  await getRole();
  // #2227: Klubbhuset and its sub-routes use all five heavy namespaces.
  return (
    <IntlScope namespaces={['admin', 'wizard', 'formatGuide', 'cup', 'liga']}>
      {children}
    </IntlScope>
  );
}
