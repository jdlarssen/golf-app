import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

export function getBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Opt into the WebAuthn/passkey Beta API (issue #63). Only the browser
    // client runs the ceremony (navigator.credentials), so the server and
    // middleware clients don't need this flag. @supabase/ssr v0.10.3 forwards
    // auth.* options straight into createClient.
    { auth: { experimental: { passkey: true } } },
  );
}
