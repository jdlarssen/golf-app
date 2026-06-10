import { ReactNode } from 'react';
import { getServerClient } from '@/lib/supabase/server';
import { getRoleContext } from '@/lib/admin/auth';

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
  const supabase = await getServerClient();
  await getRoleContext(supabase);
  return <>{children}</>;
}
