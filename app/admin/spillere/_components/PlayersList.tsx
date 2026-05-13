import { SmartLink } from '@/components/ui/SmartLink';
import { getServerClient } from '@/lib/supabase/server';
import { Input } from '@/components/ui/Input';

type User = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
  hcp_index: number;
  is_admin: boolean;
  created_at: string;
};

export async function PlayersList({ searchQuery }: { searchQuery: string }) {
  const supabase = await getServerClient();
  // Only show fully-onboarded players. Pending invitees have NULL name and
  // profile_completed_at and would otherwise duplicate the entry shown in
  // the pending-invitations list. Picker handles the in-between state.
  const { data, error } = await supabase
    .from('users')
    .select('id, name, nickname, email, hcp_index, is_admin, created_at')
    .not('profile_completed_at', 'is', null)
    .order('created_at', { ascending: false })
    .returns<User[]>();

  if (error) throw error;

  const users = data ?? [];
  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? users.filter(
        (u) =>
          (u.name?.toLowerCase() ?? '').includes(q) ||
          (u.nickname?.toLowerCase() ?? '').includes(q) ||
          u.email.toLowerCase().includes(q),
      )
    : users;

  return (
    <>
      <form method="GET" action="/admin/spillere" className="mb-2">
        <Input
          id="q"
          name="q"
          type="search"
          label=""
          placeholder="Søk på navn, kallenavn eller e-post..."
          defaultValue={searchQuery}
          autoComplete="off"
        />
      </form>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-6 text-center text-sm text-muted">
          {q
            ? `Ingen treff på "${searchQuery}".`
            : 'Ingen registrerte spillere ennå.'}
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-xl border border-border bg-surface"
          style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
        >
          {filtered.map((u, i) => (
            <SmartLink
              key={u.id}
              href={`/admin/spillere/${u.id}`}
              className="reveal-up flex items-center justify-between gap-3 px-3.5 py-3 transition hover:bg-row-hover"
              style={{
                animationDelay: `${60 + i * 50}ms`,
                borderTop:
                  i === 0 ? 'none' : '1px solid var(--row-divider-warm)',
              }}
            >
              <div className="min-w-0">
                <p className="truncate font-serif text-[15px] font-medium tracking-[-0.005em] text-text">
                  {u.name ?? u.email}
                  {u.nickname && (
                    <span className="ml-1.5 font-sans text-[11.5px] text-muted">
                      ({u.nickname})
                    </span>
                  )}
                </p>
                <p className="mt-0.5 truncate font-sans text-[11.5px] text-muted">
                  {u.email}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-sans text-[12px] tabular-nums text-text">
                  {u.hcp_index.toFixed(1)}
                </p>
                {u.is_admin && (
                  <p
                    className="mt-0.5 font-sans text-[9.5px] font-semibold uppercase"
                    style={{ letterSpacing: '0.16em', color: '#7a5410' }}
                  >
                    Admin
                  </p>
                )}
              </div>
            </SmartLink>
          ))}
        </div>
      )}
    </>
  );
}
