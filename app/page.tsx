import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Look up the user's public.users row for name/admin status.
  const profileResult = await supabase
    .from('users')
    .select('name, is_admin')
    .eq('id', user.id)
    .single();

  const profile = profileResult.data;

  // Diagnostic: call is_admin() RPC. Runs as SECURITY DEFINER so it bypasses
  // RLS. Returns true iff auth.uid() resolves to a row with is_admin=true.
  // If false but profile is also null, JWT is missing from PostgREST request.
  const rpcResult = await supabase.rpc('is_admin');

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-2">
        Hei, {profile?.name ?? 'spiller'} 👋
      </h1>
      {profile?.is_admin && (
        <p className="text-sm text-gray-600">Du er admin.</p>
      )}
      <p className="mt-6 text-gray-500">Mer kommer her snart.</p>

      <details className="mt-8 text-xs bg-gray-900 text-gray-200 p-3 rounded font-mono">
        <summary className="cursor-pointer text-gray-400">Debug info (midlertidig)</summary>
        <pre className="mt-2 whitespace-pre-wrap break-all">
{JSON.stringify(
  {
    userId: user.id,
    userEmail: user.email,
    profileData: profileResult.data,
    profileError: profileResult.error
      ? {
          code: profileResult.error.code,
          message: profileResult.error.message,
          details: profileResult.error.details,
          hint: profileResult.error.hint,
        }
      : null,
    isAdminRpc: rpcResult.data,
    isAdminRpcError: rpcResult.error
      ? {
          code: rpcResult.error.code,
          message: rpcResult.error.message,
        }
      : null,
  },
  null,
  2,
)}
        </pre>
      </details>

      <form action="/logout" method="post" className="mt-12">
        <button type="submit" className="text-sm text-red-600 underline">
          Logg ut
        </button>
      </form>
    </main>
  );
}
