import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Kicker } from '@/components/ui/Kicker';
import { completeProfile } from './actions';
import { OnboardingHcpField } from './OnboardingHcpField';

type SearchParams = Promise<{
  error?: string | string[];
  next?: string | string[];
}>;

/** Only accept same-origin relative paths as a post-onboarding destination. */
function safeNext(value: string | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}

const ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Du må fylle inn navn.',
  hcp_invalid: 'Handicap-index må være et tall mellom -10 og 54,0.',
  gender_required: 'Velg kjønn.',
  level_invalid: 'Ugyldig spillerklasse.',
  unknown: 'Noe gikk galt. Prøv igjen.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function CompleteProfile({
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
  // #356: carry the post-onboarding destination (e.g. a game-scoped invitee's
  // `/games/[id]`) through the profile step so the user lands there afterwards.
  const next = safeNext(first(params.next));

  // If the user has already completed their profile, send them on. The trigger
  // pre-creates a placeholder row with profile_completed_at = NULL, so the row
  // existing is not enough on its own.
  const { data: existing } = await supabase
    .from('users')
    .select('profile_completed_at')
    .eq('id', userId)
    .maybeSingle();

  if (existing?.profile_completed_at) {
    redirect(next);
  }

  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  return (
    <AppShell>
      <header className="mb-8">
        <Kicker tone="accent" className="mb-2">
          Velkommen til Tørny
        </Kicker>
        <h1 className="font-serif text-3xl font-medium tracking-tight text-text leading-tight">
          Fullfør profilen din
        </h1>
        <p className="font-sans text-sm leading-relaxed text-muted mt-2">
          Fortell oss litt om deg, så er du klar til å spille.
        </p>
      </header>

      <Card>
        {errorMessage && (
          <div className="mb-4">
            <Banner tone="error">{errorMessage}</Banner>
          </div>
        )}

        <form action={completeProfile} className="space-y-5">
          <input type="hidden" name="next" value={next} />
          <Input
            id="name"
            name="name"
            type="text"
            label="Navn"
            autoComplete="name"
            required
          />

          <Input
            id="nickname"
            name="nickname"
            type="text"
            label="Kallenavn"
            hint="Valgfritt — navnet du går under på banen"
            autoComplete="nickname"
          />

          <OnboardingHcpField />

          <fieldset>
            <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Kjønn
            </legend>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="gender" value="mens" required />
                <span className="font-serif text-base text-text">Herre</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="gender" value="ladies" required />
                <span className="font-serif text-base text-text">Dame</span>
              </label>
            </div>
            <p className="mt-1 text-xs text-muted">
              Brukes til å foreslå riktig tee og beregne course handicap riktig.
            </p>
          </fieldset>

          <fieldset>
            <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Spillerklasse
            </legend>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="level" value="junior" />
                <span className="font-serif text-base text-text">Junior</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="level" value="normal" defaultChecked />
                <span className="font-serif text-base text-text">Voksen</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="level" value="senior" />
                <span className="font-serif text-base text-text">Senior</span>
              </label>
            </div>
            <p className="mt-1 text-xs text-muted">
              Junior gir juniortee når banen har en. Senior er en informasjons-tag for nå.
            </p>
          </fieldset>

          <Button type="submit" className="w-full mt-2">
            Sett i gang
          </Button>
        </form>
      </Card>
    </AppShell>
  );
}
