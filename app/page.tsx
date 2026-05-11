import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { PageHeader } from '@/components/ui/PageHeader';

type SearchParams = Promise<{ profile?: string | string[] }>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
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

  const params = await searchParams;
  const profileUpdated = first(params.profile) === 'updated';

  return (
    <AppShell>
      <PageHeader title={`Hei, ${profile?.name ?? 'spiller'} 👋`} />

      {profileUpdated && (
        <div className="mb-4">
          <Banner tone="success">✓ Profilen din er oppdatert.</Banner>
        </div>
      )}

      <nav className="space-y-3">
        <Link href="/profile" className="block">
          <Card className="min-h-[44px] flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            <span className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              Min profil
            </span>
            <span aria-hidden className="text-zinc-400">
              →
            </span>
          </Card>
        </Link>

        {profile?.is_admin && (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-2 mt-4">
              Admin
            </p>
            <Link href="/admin/invitations" className="block">
              <Card className="min-h-[44px] flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                <span className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                  Invitasjoner
                </span>
                <span aria-hidden className="text-zinc-400">
                  →
                </span>
              </Card>
            </Link>
            <Link href="/admin/courses" className="block">
              <Card className="min-h-[44px] flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                <span className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                  Baner
                </span>
                <span aria-hidden className="text-zinc-400">
                  →
                </span>
              </Card>
            </Link>
          </div>
        )}

        <form action="/logout" method="post" className="pt-4">
          <button
            type="submit"
            className="w-full min-h-[44px] text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg px-4 py-2.5 transition-colors"
          >
            Logg ut
          </button>
        </form>
      </nav>

      <p className="mt-8 text-sm text-zinc-500">Mer kommer her snart.</p>
    </AppShell>
  );
}
