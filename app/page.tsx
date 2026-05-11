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

  const { data: profile } = await supabase
    .from('users')
    .select('name, is_admin')
    .eq('id', user.id)
    .single();

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
