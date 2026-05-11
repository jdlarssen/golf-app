import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          // Server Components in Next.js 16 forbid cookie writes. Middleware
          // (proxy.ts) handles session refresh, so swallowing here is safe.
          try {
            for (const { name, value, options } of toSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Read-only context — ignore.
          }
        },
      },
    },
  );
}
