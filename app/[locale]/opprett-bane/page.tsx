import { first } from '@/lib/url/searchParams';
import { safeInternalPath } from '@/lib/url/safeInternalPath';
import { klubbhusBackHref, withKlubbhusOrigin } from '@/lib/url/klubbhusOrigin';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { CourseForm } from '@/app/[locale]/admin/courses/CourseForm';
import { courseFormErrorMessages } from '@/lib/courses/courseFormState';
import { createCourse } from '@/app/[locale]/admin/courses/new/actions';
import { getServerClient } from '@/lib/supabase/server';
import { withCourseParam } from '@/lib/courses/similarCoursesPanel';

// #366: åpen bane-opprettelse for ALLE innloggede brukere. Speiler
// /opprett-spill-mønsteret (#198) — gjenbruker CourseForm + createCourse, men
// kjører i AppShell (ikke Sekretariatet) og gates kun på «innlogget», ikke
// admin/trusted. RLS (migrasjon 0070) håndhever created_by = auth.uid().
//
// Den frittstående inngangen til denne ruta er midlertidig på hjem-siden;
// permanent hjem blir Klubbhuset (#392). Ruta kan òg nås via «Finner du ikke
// banen?»-lenken i spill-velgeren (?next= tar deg tilbake dit). Fra
// Klubbhuset kommer ?kilde=klubbhuset: tilbake og kvitteringen går da dit
// (#2487). ?next= vinner alltid.
//
// #2485: «Finnes banen alt?» under navnet. «Bruk denne» går tilbake til
// veiviseren (?next=) med banen valgt, eller åpner veiviseren med den. En bane
// du lagrer herfra, velges også når du går tilbake til spillet (?bane=).

type SearchParams = Promise<{
  status?: string | string[];
  name?: string | string[];
  next?: string | string[];
  kilde?: string | string[];
  bane?: string | string[];
}>;

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

  const [t, tNav] = await Promise.all([
    getTranslations({ locale, namespace: 'courseForm' }),
    getTranslations({ locale, namespace: 'nav' }),
  ]);

  const sp = await searchParams;
  // Bare interne stier slipper gjennom (samme regel som createCourse).
  const next = safeInternalPath(first(sp.next)) ?? undefined;
  const status = first(sp.status);

  // Åpnet fra Klubbhuset (#2487): tilbake går dit, og merket følger med
  // gjennom skjemaet (feil-retur, kvittering, «Opprett en bane til»).
  const klubbhusBack = klubbhusBackHref(sp.kilde, '/');
  const fromKlubbhus = klubbhusBack === '/admin';
  const backHref = next ?? klubbhusBack;
  const keepOrigin = (href: string) =>
    fromKlubbhus ? withKlubbhusOrigin(href) : href;
  const createAnotherHref = keepOrigin(
    next ? `/opprett-bane?next=${encodeURIComponent(next)}` : '/opprett-bane',
  );

  // A refused save comes back to the form as a code (audit 2026-11-20); the
  // copy for each is read here. A code with no text shows the generic one.
  const errorMessages = courseFormErrorMessages((code) => {
    const key = `errors.${code}` as Parameters<typeof t>[0];
    return t.has(key) ? t(key) : undefined;
  }, t('errors.db_course'));

  // Suksess-visning: bekreftelse + veier videre. Ingen skjema (rent kort).
  if (status === 'created') {
    const createdName = first(sp.name);
    // #2485: back in the wizard the new course is chosen. The wizard checks
    // the id itself (loadBaneCourseId), so a hand-edited one picks nothing.
    const createdId = first(sp.bane);
    const backToGame = next && createdId ? withCourseParam(next, createdId) : next;
    return (
      <AppShell>
        <TopBar backHref={backToGame ?? backHref} kicker={t('door.kicker')} />
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
                {backToGame ? (
                  <LinkButton href={backToGame} full>
                    {t('door.backToGame')}
                  </LinkButton>
                ) : fromKlubbhus ? (
                  <LinkButton href="/admin" full>
                    {tNav('backToClubhouse')}
                  </LinkButton>
                ) : (
                  <LinkButton href="/" full>
                    {t('door.toFrontPage')}
                  </LinkButton>
                )}
                <div>
                  <SmartLink
                    href={createAnotherHref}
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

  // Bevar ?next= gjennom suksess slik at bruker kan returnere til spillet.
  const successRedirect = keepOrigin(
    next
      ? `/opprett-bane?status=created&next=${encodeURIComponent(next)}`
      : '/opprett-bane?status=created',
  );

  return (
    <AppShell>
      <TopBar backHref={backHref} kicker={t('door.kicker')} />

      <div>
        <h1 className="font-serif text-[28px] font-medium leading-[normal]">
          {t('door.heading')}
        </h1>
        <p className="mt-0.5 font-sans text-[13px] leading-[normal] text-muted">
          {t('door.subtitle')}
        </p>
      </div>

      <div className="mt-3.5">
        <CourseForm
          action={createCourse}
          errorMessages={errorMessages}
          submitLabel={t('door.submitLabel')}
          successRedirect={successRedirect}
          similarCourses={{ kind: 'wizard', next }}
        />
      </div>
    </AppShell>
  );
}
