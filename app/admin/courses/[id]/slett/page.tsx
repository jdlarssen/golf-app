import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrTrustedCreator } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Button } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { deleteCourse } from '../edit/actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

const ERROR_MESSAGES: Record<string, string> = {
  delete_failed: 'Slettingen feilet. Prøv igjen, eller sjekk Vercel-loggene.',
  not_owned: 'Du kan bare slette baner du har laget selv.',
  in_use: 'Banen er i bruk i minst ett spill og kan ikke slettes.',
};

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
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

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

      <BrassRibbon kicker="Bekreft sletting" />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Slett «{course.name}»?
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
            Banen er i bruk i {gameCount} spill og kan ikke slettes. Slett
            spillene som bruker den først.
          </Banner>
        </div>
      ) : (
        <>
          <div
            className="mt-5 rounded-xl border bg-surface px-4 py-3.5"
            style={{ borderColor: 'rgba(180, 60, 60, 0.18)' }}
          >
            <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              Slettes permanent
            </p>
            <ul className="space-y-1 font-sans text-[13px] text-text">
              <li>Banen «{course.name}»</li>
              {holeCount > 0 && <li>{holeCount} hull</li>}
              {teeCount > 0 && (
                <li>
                  {teeCount} {teeCount === 1 ? 'tee-boks' : 'tee-bokser'}
                </li>
              )}
            </ul>
            <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
              Handlingen kan ikke angres.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            <form action={deleteAction}>
              <Button
                type="submit"
                className="w-full"
                style={{
                  background: 'var(--danger-deep)',
                  borderColor: 'var(--danger-deep)',
                }}
              >
                Slett banen for alltid
              </Button>
            </form>
            <SmartLink
              href={`/admin/courses/${id}/edit`}
              className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
            >
              Avbryt
            </SmartLink>
          </div>
        </>
      )}
    </AdminShell>
  );
}
