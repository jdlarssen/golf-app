import { ReactNode } from 'react';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrTrustedCreator } from '@/lib/admin/auth';

// Layout-level gate (Fase 4): admin OR trusted creator. Admin-only sub-routes
// self-gate via requireAdmin(supabase) in their pages + actions (chunk 1).
// Trusted creators get to /admin (filtered tile-grid) + the /admin/courses
// subtree only.
//
// We can no longer use the proxy-header shortcut + a single is_admin column
// read, because role-resolution now also needs the email to consult
// TRUSTED_CREATOR_EMAILS. requireAdminOrTrustedCreator() does the full lookup
// against auth.getUser() + public.users.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await getServerClient();
  await requireAdminOrTrustedCreator(supabase);
  return <>{children}</>;
}
