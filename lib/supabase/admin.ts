import { createClient } from '@supabase/supabase-js';

// Service-role Supabase client. MUST NEVER be imported from client components
// or anything that ends up in the client bundle. Used only from server
// actions to invoke auth.admin.* functions that require the service-role
// key (deleteUser, listUsers, etc.). Service-role bypasses RLS — handle
// with care.
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
