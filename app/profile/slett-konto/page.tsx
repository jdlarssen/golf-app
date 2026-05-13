import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { deleteOwnAccount } from './actions';

type SearchParams = Promise<{ error?: string | string[] }>;

const ERROR_MESSAGES: Record<string, string> = {
  active_games:
    'Du er med i et spill som enten pågår eller ikke har startet ennå. Kontoen kan ikke slettes mens du er påmeldt et aktivt spill. Ta kontakt med administrator.',
  delete_failed:
    'Noe gikk galt ved sletting. Prøv igjen, eller ta kontakt med administrator.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function SlettKontoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect('/login');
  }

  const supabase = await getServerClient();
  const params = await searchParams;
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  // Check if the user is in any active/scheduled game
  const { data: activeGames } = await supabase
    .from('game_players')
    .select('game_id, games!inner(status, name)')
    .eq('user_id', userId)
    .in('games.status', ['active', 'scheduled']);

  const isBlocked = (activeGames ?? []).length > 0;

  // Get the user's name for display
  const { data: userProfile } = await supabase
    .from('users')
    .select('name, email')
    .eq('id', userId)
    .maybeSingle();

  const displayName = userProfile?.name?.trim() || userProfile?.email || 'kontoen din';

  return (
    <AppShell>
      <TopBar
        backHref="/profile"
        backLabel="Tilbake til profil"
        kicker="Slett konto"
      />

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      {isBlocked ? (
        <div className="space-y-4">
          <Banner tone="error">
            Du er med i et spill som enten pågår eller snart starter. Kontoen
            kan ikke slettes mens du er påmeldt et aktivt spill. Ta kontakt
            med administrator for hjelp.
          </Banner>
          <SmartLink
            href="/profile"
            className="block rounded-full border border-border bg-surface px-4 py-3 text-center font-sans text-[13px] font-medium text-text"
          >
            Tilbake til profil
          </SmartLink>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-surface px-4 py-4 space-y-3">
            <h2 className="font-serif text-base font-medium text-text">
              Dette vil bli slettet
            </h2>
            <ul className="space-y-1.5 text-sm text-text">
              <li className="flex gap-2">
                <span className="text-muted mt-0.5">•</span>
                <span>Brukerprofilen din (navn, kallenavn, handicap)</span>
              </li>
              <li className="flex gap-2">
                <span className="text-muted mt-0.5">•</span>
                <span>E-postadressen din frigis og kan ikke brukes til å logge inn igjen</span>
              </li>
              <li className="flex gap-2">
                <span className="text-muted mt-0.5">•</span>
                <span>Din tilknytning til turneringer og invitasjoner</span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-surface px-4 py-4 space-y-3">
            <h2 className="font-serif text-base font-medium text-text">
              Dette beholdes
            </h2>
            <ul className="space-y-1.5 text-sm text-text">
              <li className="flex gap-2">
                <span className="text-muted mt-0.5">•</span>
                <span>
                  Scoringsdata du har registrert — det tilhører turneringen og
                  kan ikke fjernes uten at hele turneringen slettes
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-[#a04040]/30 bg-[#fff5f5] dark:bg-[#2a1515] px-4 py-4 space-y-3">
            <p className="font-sans text-sm text-text leading-relaxed">
              Du er i ferd med å slette{' '}
              <strong>{displayName}</strong> permanent.{' '}
              Handlingen kan ikke angres.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <form action={deleteOwnAccount}>
              <Button
                type="submit"
                className="w-full"
                style={{ background: '#a04040', borderColor: '#a04040' }}
              >
                Slett kontoen min for alltid
              </Button>
            </form>
            <SmartLink
              href="/profile"
              className="rounded-full border border-border bg-surface px-4 py-3 text-center font-sans text-[13px] font-medium text-text"
            >
              Avbryt
            </SmartLink>
          </div>
        </div>
      )}
    </AppShell>
  );
}
