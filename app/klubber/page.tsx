import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { getMyClubs } from '@/lib/clubs/getMyClubs';

const ROLE_LABELS: Record<'owner' | 'admin' | 'member', string> = {
  owner: 'Eier',
  admin: 'Admin',
  member: 'Medlem',
};

/**
 * /klubber — the user's club list.
 *
 * Shows all clubs the logged-in user is a member of, with their role.
 * Links to /klubber/[id] for each club. Shows «Opprett klubb» when the
 * user has created fewer than 2 clubs; a muted note otherwise.
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export default async function KlubbListePage() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { clubs, createdCount } = await getMyClubs(supabase, user.id);

  const canCreate = createdCount < 2;

  return (
    <AppShell>
      <TopBar backHref="/admin" kicker="Klubbhuset" />
      <PageHeader title="Klubbene dine" />

      {clubs.length === 0 ? (
        <div className="space-y-5 text-center">
          <p className="text-sm text-muted">
            Du er ikke med i noen klubber ennå. Opprett en, eller be noen sende
            deg en invitasjonslenke.
          </p>
          {canCreate && (
            <LinkButton href="/klubber/ny" full>
              Opprett klubb
            </LinkButton>
          )}
        </div>
      ) : (
        <>
          <nav className="space-y-2">
            {clubs.map((club) => (
              <SmartLink
                key={club.id}
                href={`/klubber/${club.id}`}
                className="block"
              >
                <Card className="min-h-[44px] p-5 transition-colors hover:border-primary/30">
                  <div className="flex items-center justify-between gap-3">
                    <span className="block truncate font-serif text-lg font-medium tracking-tight text-text">
                      {club.name}
                    </span>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="rounded-full border border-border px-2.5 py-0.5 font-sans text-xs text-muted">
                        {ROLE_LABELS[club.role]}
                      </span>
                      <span aria-hidden className="text-muted">
                        →
                      </span>
                    </div>
                  </div>
                </Card>
              </SmartLink>
            ))}
          </nav>

          <div className="mt-6">
            {canCreate ? (
              <LinkButton href="/klubber/ny" full>
                Opprett klubb
              </LinkButton>
            ) : (
              <p className="text-center text-sm text-muted">
                Du har opprettet så mange klubber du kan for nå.
              </p>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
