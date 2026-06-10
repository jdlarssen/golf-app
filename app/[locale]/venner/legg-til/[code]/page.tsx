import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getFriendIds } from '@/lib/friends/getFriendIds';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { connectFriend } from './actions';

type Params = Promise<{ code: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

type Owner = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string;
};

function ownerName(o: Owner): string {
  const base = o.name?.trim() || o.email;
  return o.nickname ? `${base} «${o.nickname}»` : base;
}

/**
 * /venner/legg-til/[code] — «legg til meg»-lenkens landingsside (#369).
 *
 * Tilstander:
 *   - Ikke innlogget → redirect til /login?next=...
 *   - Ukjent kode → 404
 *   - Egen lenke → «Dette er din egen lenke»
 *   - Allerede venner → bekreftelse + lenke til vennelista
 *   - Ellers → «Bli venn med [navn]» + koble-knapp
 */
export default async function LeggTilPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { code } = await params;
  const { error } = await searchParams;
  const hasError = (Array.isArray(error) ? error[0] : error) === '1';

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/venner/legg-til/${code}`);

  const admin = getAdminClient();
  const { data: owner } = await admin
    .from('users')
    .select('id, name, nickname, email')
    .eq('friend_code', code)
    .maybeSingle<Owner>();

  if (!owner) notFound();

  const isSelf = owner.id === user.id;
  const friendIds = isSelf ? [] : await getFriendIds(user.id);
  const alreadyFriends = friendIds.includes(owner.id);

  return (
    <AppShell>
      <TopBar backHref="/profile/venner" backLabel="Til venner" kicker="Legg til venn" />
      <PageHeader title={ownerName(owner)} />

      {hasError && (
        <div className="mb-4">
          <Banner tone="error">Noe gikk galt. Prøv igjen.</Banner>
        </div>
      )}

      <Card>
        {isSelf ? (
          <p className="font-sans text-[15px] text-text">
            Dette er din egen lenke. Del den med noen du vil bli venn med.
          </p>
        ) : alreadyFriends ? (
          <>
            <p className="mb-4 font-sans text-[15px] text-text">
              Dere er allerede venner.
            </p>
            <SmartLink
              href="/profile/venner"
              className="flex min-h-[44px] items-center justify-center rounded-full bg-primary px-4 py-3 text-center font-sans text-[15px] font-semibold text-bg"
            >
              Til vennene dine
            </SmartLink>
          </>
        ) : (
          <>
            <p className="mb-4 font-sans text-[15px] text-text">
              Bli venn med {ownerName(owner)}? Da ser dere hverandres spill og
              kan velge hverandre når dere fyller lag.
            </p>
            <form action={connectFriend}>
              <input type="hidden" name="code" value={code} />
              <SubmitButton className="w-full" pendingLabel="Blir venner …">
                Bli venner
              </SubmitButton>
            </form>
          </>
        )}
      </Card>
    </AppShell>
  );
}
