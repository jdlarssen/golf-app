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

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('name, is_admin')
    .eq('id', user.id)
    .single();

  // PGRST116 = "Cannot coerce the result to a single JSON object" → no row
  // for this auth user yet. Send them to the profile-completion flow.
  if (profileError && profileError.code === 'PGRST116') {
    redirect('/complete-profile');
  }

  // Any other error: surface it. We don't want to silently render "spiller"
  // and mask a real DB / RLS problem.
  if (profileError) {
    throw profileError;
  }

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-2">
        Hei, {profile?.name ?? 'spiller'} 👋
      </h1>
      {profile?.is_admin && (
        <p className="text-sm text-gray-600">Du er admin.</p>
      )}
      <p className="mt-6 text-gray-500">Mer kommer her snart.</p>

      <form action="/logout" method="post" className="mt-12">
        <button type="submit" className="text-sm text-red-600 underline">
          Logg ut
        </button>
      </form>
    </main>
  );
}
