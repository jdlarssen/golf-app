import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrTrustedCreator } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { deleteCourse } from '../edit/actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

type CourseRow = { id: string; name: string };

/**
 * Dedikert bekreftelses-side for bane-sletting (#363). Erstatter den gamle
 * inline-`window.confirm`-knappen — destruktive admin-handlinger får alltid
 * en egen `/slett`-rute, som spill og spillere. Sletting cascader hull +
 * tee-bokser via FK; er banen i bruk i et spill, blokkerer vi her (og
 * `deleteCourse` har samme guard server-side som defense-in-depth).
 */
export default async function SlettBanePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const errorCode = first(sp.error);

  const t = await getTranslations('admin.courses.delete');

  const errorMessage = errorCode
    ? t(`errors.${errorCode}` as Parameters<typeof t>[0])
    : undefined;

  const supabase = await getServerClient();
  await requireAdminOrTrustedCreator(supabase);

  const { data: course } = await supabase
    .from('courses')
    .select('id, name')
    .eq('id', id)
    .maybeSingle<CourseRow>();

  if (!course) notFound();

  // Tell barn-rader (for «Slettes permanent»-lista) + spill som bruker banen
  // (for in-use-blokkeringen).
  const [holesRes, teesRes, gamesRes] = await Promise.all([
    supabase
      .from('course_holes')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', id),
    supabase
      .from('tee_boxes')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', id),
    supabase
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', id),
  ]);

  const holeCount = holesRes.count ?? 0;
  const teeCount = teesRes.count ?? 0;
  const gameCount = gamesRes.count ?? 0;
  const inUse = gameCount > 0;

  const deleteAction = deleteCourse.bind(null, id);

  return (
    <AdminShell>
      <TopBar
        backHref={`/admin/courses/${id}/edit`}
        kicker="Klubbhuset"
      />

      <BrassRibbon kicker={t('brassRibbon')} />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          {t('heading', { name: course.name })}
        </h1>
      </div>

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      {inUse ? (
        <div className="mt-4">
          <Banner tone="warning">
            {t('inUseBanner', { count: gameCount })}
          </Banner>
        </div>
      ) : (
        <>
          <div
            className="mt-5 rounded-xl border bg-surface px-4 py-3.5"
            style={{ borderColor: 'rgba(180, 60, 60, 0.18)' }}
          >
            <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {t('permanentLabel')}
            </p>
            <ul className="space-y-1 font-sans text-[13px] text-text">
              <li>Banen «{course.name}»</li>
              {holeCount > 0 && <li>{t('hullCount', { count: holeCount })}</li>}
              {teeCount > 0 && (
                <li>{t('teeCount', { count: teeCount })}</li>
              )}
            </ul>
            <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
              {t('cannotUndo')}
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            <form action={deleteAction}>
              <SubmitButton
                className="w-full"
                style={{
                  background: 'var(--danger-deep)',
                  borderColor: 'var(--danger-deep)',
                }}
                pendingLabel={t('deletingBusy')}
              >
                {t('submitButton')}
              </SubmitButton>
            </form>
            <SmartLink
              href={`/admin/courses/${id}/edit`}
              className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
            >
              {t('cancel')}
            </SmartLink>
          </div>
        </>
      )}
    </AdminShell>
  );
}
