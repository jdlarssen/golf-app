import { Suspense, cache } from 'react';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MiniRibbon } from '@/components/ui/MiniRibbon';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatShortDateNbWithYear, formatMonthLongNb } from '@/lib/format/date';
import { previousMonthPeriod } from '@/lib/productUpdates/digest';
import { publishProductUpdateAction, sendDigestNowAction } from './actions';

type SearchParams = Promise<{
  published?: string | string[];
  recipients?: string | string[];
  digest?: string | string[];
  updates?: string | string[];
  error?: string | string[];
}>;

const ERROR_MESSAGES: Record<string, string> = {
  title_required: 'Du må fylle inn en tittel.',
  body_required: 'Du må fylle inn brødtekst.',
  link_must_be_internal: 'Lenke må peke til en intern rute (starte med «/»).',
  cta_without_link: 'Knappe-tekst krever at du også fyller inn en lenke.',
  publish_failed: 'Klarte ikke å publisere. Sjekk Vercel-loggene.',
  digest_failed: 'Klarte ikke å sende månedsbrev. Sjekk Vercel-loggene.',
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const requireAdminContext = cache(async () => {
  const userId = await getProxyVerifiedUserId();
  if (!userId) redirect('/login');

  const supabase = await getServerClient();
  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single();

  if (!profile?.is_admin) redirect('/');

  return { userId, supabase };
});

export default async function LanseringerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId } = await requireAdminContext();
  const params = await searchParams;

  const publishedFlag = first(params.published);
  const publishedCount = first(params.recipients);
  const digestStatus = first(params.digest);
  const digestUpdates = first(params.updates);
  const errorCode = first(params.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const successMessage = publishedFlag
    ? `Lanseringen er ute hos ${publishedCount ?? '0'} brukere.`
    : digestStatus === 'sent'
      ? `Månedsbrevet gikk ut til ${publishedCount ?? '0'} mottakere med ${digestUpdates ?? '0'} oppdateringer.`
      : digestStatus === 'already_sent'
        ? 'Månedsbrevet er allerede sendt for forrige periode.'
        : digestStatus === 'no_updates'
          ? 'Ingen lanseringer å sende ut for forrige måned. Hopper over.'
          : undefined;

  return (
    <AdminShell>
      <TopBar backHref="/admin" kicker="Sekretariatet" userId={userId} />

      <div className="px-1">
        <h1 className="mb-0.5 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Lanseringer
        </h1>
        <p className="font-sans text-[11.5px] text-muted">
          Publiser nyheter til brukerne dine — som drypp i appen og månedlig
          oppsummering på mail.
        </p>
      </div>

      {(successMessage || errorMessage) && (
        <div className="mt-4 space-y-2">
          {successMessage && <Banner tone="success">{successMessage}</Banner>}
          {errorMessage && <Banner tone="error">{errorMessage}</Banner>}
        </div>
      )}

      <section className="mt-5">
        <MiniRibbon>Publiser ny lansering</MiniRibbon>
        <Card>
          <form action={publishProductUpdateAction} className="space-y-4">
            <Input
              id="title"
              name="title"
              type="text"
              label="Tittel"
              hint="Kort og konkret. Eks: «Texas scramble er ute!»"
              required
              maxLength={120}
            />
            <div>
              <label
                htmlFor="body"
                className="block text-sm font-medium text-text mb-1.5"
              >
                Brødtekst
              </label>
              <textarea
                id="body"
                name="body"
                required
                rows={3}
                maxLength={400}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                placeholder="Hva er nytt? 1–3 setninger. Forklar på vanlig norsk."
              />
              <p className="mt-1.5 text-xs text-muted">
                Maks 400 tegn. Hold tonen som du ville skrevet til en
                klubbkompis.
              </p>
            </div>
            <Input
              id="link"
              name="link"
              type="text"
              label="Lenke (valgfri)"
              hint="Intern rute, må starte med «/». F.eks. /admin/games/new"
              pattern="^/.*"
              maxLength={200}
            />
            <Input
              id="cta_label"
              name="cta_label"
              type="text"
              label="Knappe-tekst (valgfri)"
              hint="Vises kun når lenke er fylt inn. F.eks. «Prøv det», «Se mer»."
              maxLength={40}
            />
            <div className="pt-1">
              <Button type="submit">Publiser</Button>
            </div>
          </form>
        </Card>
      </section>

      <section className="mt-6">
        <MiniRibbon>Månedsbrev</MiniRibbon>
        <Suspense fallback={<DigestSkeleton />}>
          <DigestCard />
        </Suspense>
      </section>

      <section className="mt-6">
        <MiniRibbon>Tidligere lanseringer</MiniRibbon>
        <Suspense fallback={<ListSkeleton />}>
          <PreviousUpdatesList />
        </Suspense>
      </section>
    </AdminShell>
  );
}

async function DigestCard() {
  const admin = getAdminClient();
  const { periodStart, periodEnd, periodLabel } = previousMonthPeriod();

  const { data: existing } = await admin
    .from('product_update_digests')
    .select('sent_at, recipient_count')
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle<{ sent_at: string; recipient_count: number }>();

  return (
    <Card>
      <p className="font-serif text-base font-medium text-text">
        Månedsbrev for {periodLabel}
      </p>
      {existing ? (
        <p className="mt-1 font-sans text-sm text-muted">
          Sendt {formatShortDateNbWithYear(existing.sent_at)} til{' '}
          {existing.recipient_count} mottakere.
        </p>
      ) : (
        <p className="mt-1 font-sans text-sm text-muted">
          Ikke sendt ennå. Cron sender automatisk 1. i hver måned, men du kan
          sende manuelt nå hvis du vil.
        </p>
      )}
      {!existing && (
        <form action={sendDigestNowAction} className="mt-4">
          <Button type="submit">Send månedsbrev nå</Button>
        </form>
      )}
    </Card>
  );
}

function DigestSkeleton() {
  return (
    <Card>
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="mt-2 h-3.5 w-1/2" />
    </Card>
  );
}

async function PreviousUpdatesList() {
  const admin = getAdminClient();

  const { data: updates } = await admin
    .from('product_updates')
    .select('id, title, body, link, cta_label, created_at')
    .order('created_at', { ascending: false })
    .limit(20)
    .returns<
      {
        id: string;
        title: string;
        body: string;
        link: string | null;
        cta_label: string | null;
        created_at: string;
      }[]
    >();

  if (!updates || updates.length === 0) {
    return (
      <Card>
        <p className="font-sans text-sm text-muted">
          Ingen lanseringer publisert ennå. Bruk skjemaet over for å publisere
          den første.
        </p>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-2 list-none p-0">
      {updates.map((u) => (
        <li key={u.id}>
          <Card>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-serif text-base font-medium text-text">
                {u.title}
              </h3>
              <time
                dateTime={u.created_at}
                className="shrink-0 font-sans text-[11px] tabular-nums text-muted"
              >
                {formatShortDateNbWithYear(u.created_at)}
              </time>
            </div>
            <p className="mt-1.5 font-sans text-sm text-muted">{u.body}</p>
            {u.link && (
              <p className="mt-2 font-sans text-[11px] text-muted">
                Lenke: <code className="text-text">{u.link}</code>
                {u.cta_label ? ` · «${u.cta_label}»` : ''}
              </p>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-20 rounded-2xl" />
      <Skeleton className="h-20 rounded-2xl" delay={60} />
    </div>
  );
}
