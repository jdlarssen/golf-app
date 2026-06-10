import { redirect } from 'next/navigation';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { CourseForm } from '@/app/[locale]/admin/courses/CourseForm';
import { createCourse } from '@/app/[locale]/admin/courses/new/actions';
import { getServerClient } from '@/lib/supabase/server';

// #366: åpen bane-opprettelse for ALLE innloggede brukere. Speiler
// /opprett-spill-mønsteret (#198) — gjenbruker CourseForm + createCourse, men
// kjører i AppShell (ikke Sekretariatet) og gates kun på «innlogget», ikke
// admin/trusted. RLS (migrasjon 0070) håndhever created_by = auth.uid().
//
// Den frittstående inngangen til denne ruta er midlertidig på hjem-siden;
// permanent hjem blir Klubbhuset (#392). Ruta kan òg nås via «Finner du ikke
// banen?»-lenken i spill-velgeren (?next= tar deg tilbake dit).

type SearchParams = Promise<{
  error?: string | string[];
  status?: string | string[];
  name?: string | string[];
  next?: string | string[];
}>;

// Bruker-vennlige feilmeldinger — bevisst uten admin-jargon (en vanlig bruker
// har ikke tilgang til Supabase-loggene).
const COURSE_ERROR_MESSAGES: Record<string, string> = {
  name_required: 'Banen må ha et navn.',
  bad_par: 'Par må være et helt tall mellom 3 og 6 på hvert hull.',
  bad_si: 'Stroke-indeks må være et helt tall mellom 1 og 18 på hvert hull.',
  si_duplicate: 'Stroke-indeks 1–18 må brukes nøyaktig én gang hver.',
  tee_required: 'Minst én tee må legges til.',
  tee_partial_rating:
    'Hver tee må ha både slope og CR (eller ingen av dem) per kjønn. Du kan ikke lagre halve sett.',
  tee_no_rating:
    'Hver tee må ha minst ett komplett rating-sett (slope + CR) per kjønn.',
  db_course: 'Noe gikk galt under lagring. Prøv igjen.',
  db_holes: 'Noe gikk galt under lagring. Prøv igjen.',
  db_tees: 'Noe gikk galt under lagring. Prøv igjen.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

// Bare interne stier slipper gjennom — speiler open-redirect-guarden i
// createCourse-action.
function safeNext(value: string | undefined): string | undefined {
  if (
    value &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
  ) {
    return value;
  }
  return undefined;
}

export default async function OpprettBanePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Gate: kun innlogget (ingen admin/trusted-krav). Server-action self-gater òg.
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  const status = first(sp.status);
  const errorCode = first(sp.error);
  const errorMessage = errorCode ? COURSE_ERROR_MESSAGES[errorCode] : undefined;

  // Suksess-visning: bekreftelse + veier videre. Ingen skjema (rent kort).
  if (status === 'created') {
    const createdName = first(sp.name);
    return (
      <AppShell>
        <TopBar backHref={next ?? '/'} kicker="Ny bane" />
        <div className="mt-5">
          <Card>
            <div className="space-y-5 text-center">
              <h1 className="font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
                Banen er lagret
              </h1>
              <p className="font-sans text-sm leading-relaxed text-muted">
                {createdName ? `«${createdName}» ` : 'Banen '}
                er lagt til i biblioteket, og kan nå velges når noen setter opp
                en runde.
              </p>
              <div className="space-y-3 pt-1">
                {next ? (
                  <LinkButton href={next} full>
                    Tilbake til spillet
                  </LinkButton>
                ) : (
                  <LinkButton href="/" full>
                    Til forsiden
                  </LinkButton>
                )}
                <div>
                  <SmartLink
                    href={
                      next
                        ? `/opprett-bane?next=${encodeURIComponent(next)}`
                        : '/opprett-bane'
                    }
                    className="inline-flex min-h-[44px] items-center justify-center text-sm text-muted underline underline-offset-4 transition-colors hover:text-text"
                  >
                    Opprett en bane til
                  </SmartLink>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  // Bevar ?next= gjennom feil/suksess slik at bruker kan returnere til spillet.
  const redirectBase = next
    ? `/opprett-bane?next=${encodeURIComponent(next)}`
    : '/opprett-bane';
  const successRedirect = next
    ? `/opprett-bane?status=created&next=${encodeURIComponent(next)}`
    : '/opprett-bane?status=created';

  return (
    <AppShell>
      <TopBar backHref={next ?? '/'} kicker="Ny bane" />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Legg til en bane
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          Hull, par, stroke-indeks og tee-bokser. Banen blir tilgjengelig for
          alle.
        </p>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div className="mt-5">
        <Card>
          <CourseForm
            action={createCourse}
            submitLabel="Lagre bane"
            redirectBase={redirectBase}
            successRedirect={successRedirect}
          />
        </Card>
      </div>
    </AppShell>
  );
}
