import { first } from '@/lib/url/searchParams';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
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
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: '/login', locale });
  }

  const t = await getTranslations({ locale, namespace: 'courseForm' });

  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  const status = first(sp.status);
  const errorCode = first(sp.error);

  // Resolve error message from catalog; unknown codes render no banner.
  const errorKey = errorCode
    ? (`errors.${errorCode}` as Parameters<typeof t>[0])
    : undefined;
  const errorMessage =
    errorKey && t.has(errorKey) ? t(errorKey) : undefined;

  // Suksess-visning: bekreftelse + veier videre. Ingen skjema (rent kort).
  if (status === 'created') {
    const createdName = first(sp.name);
    return (
      <AppShell>
        <TopBar backHref={next ?? '/'} kicker={t('door.kicker')} />
        <div className="mt-5">
          <Card>
            <div className="space-y-5 text-center">
              <h1 className="font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
                {t('door.successHeading')}
              </h1>
              <p className="font-sans text-sm leading-relaxed text-muted">
                {createdName
                  ? t('door.successBodyNamed', { name: createdName })
                  : t('door.successBodyAnon')}
              </p>
              <div className="space-y-3 pt-1">
                {next ? (
                  <LinkButton href={next} full>
                    {t('door.backToGame')}
                  </LinkButton>
                ) : (
                  <LinkButton href="/" full>
                    {t('door.toFrontPage')}
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
                    {t('door.createAnother')}
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
      <TopBar backHref={next ?? '/'} kicker={t('door.kicker')} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('door.heading')}
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          {t('door.subtitle')}
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
            submitLabel={t('door.submitLabel')}
            redirectBase={redirectBase}
            successRedirect={successRedirect}
          />
        </Card>
      </div>
    </AppShell>
  );
}
