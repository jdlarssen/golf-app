import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { getFriendData, type FriendUser } from '@/lib/friends/getFriendData';
import { sendFriendInvite } from '../../invite/actions';
import {
  sendFriendRequest,
  addFriendByEmail,
  respondFriendRequest,
  removeFriend,
} from './actions';
import {
  AddByEmailForm,
  ConfirmSubmit,
  CopyLinkButton,
  SubmitButton,
} from './VennerClient';

type SearchParams = Promise<{
  status?: string | string[];
  invite_email?: string | string[];
}>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const STATUS: Record<string, { tone: 'success' | 'error' | 'info'; text: string }> = {
  requested: { tone: 'success', text: 'Venneforespørsel sendt.' },
  accepted: { tone: 'success', text: 'Dere er venner nå!' },
  already_friends: { tone: 'info', text: 'Dere er allerede venner.' },
  already_pending: { tone: 'info', text: 'Forespørselen er allerede sendt.' },
  declined: { tone: 'info', text: 'Forespørselen er avslått.' },
  removed: { tone: 'info', text: 'Fjernet.' },
  self: { tone: 'error', text: 'Du kan ikke legge til deg selv.' },
  email_required: { tone: 'error', text: 'Skriv inn en e-postadresse.' },
  error: { tone: 'error', text: 'Noe gikk galt. Prøv igjen.' },
};

function personName(u: FriendUser): string {
  const base = u.name?.trim() || u.email;
  return u.nickname ? `${base} «${u.nickname}»` : base;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 font-serif text-base font-medium text-text">
      {children}
    </h2>
  );
}

function PersonLine({ name }: { name: string }) {
  return (
    <span className="min-w-0 flex-1 truncate font-sans text-[15px] text-text">
      {name}
    </span>
  );
}

export default async function VennerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const userId = await getProxyVerifiedUserId();
  if (!userId) redirect('/login?next=/profile/venner');

  const sp = await searchParams;
  const statusCode = first(sp.status);
  const statusBanner = statusCode ? STATUS[statusCode] : undefined;
  const inviteEmail = first(sp.invite_email);

  const supabase = await getServerClient();
  const [{ friends, incoming, outgoing, suggestions }, codeRes] = await Promise.all([
    getFriendData(userId),
    supabase.from('users').select('friend_code').eq('id', userId).maybeSingle<{
      friend_code: string | null;
    }>(),
  ]);
  const friendCode = codeRes.data?.friend_code ?? null;

  return (
    <AppShell>
      <TopBar backHref="/profile" backLabel="Tilbake til profil" kicker="Venner" />
      <PageHeader
        title="Venner"
        subtitle="Venner ser spillene dine og dukker opp når du fyller lag."
      />

      {statusBanner && (
        <div className="mb-4">
          <Banner tone={statusBanner.tone}>{statusBanner.text}</Banner>
        </div>
      )}

      {inviteEmail && (
        <div className="mb-4">
          <Card>
            <p className="mb-3 font-sans text-[15px] text-text">
              {inviteEmail} er ikke på Tørny ennå. Vil du invitere dem?
            </p>
            <form action={sendFriendInvite} className="flex items-center gap-2">
              <input type="hidden" name="email" value={inviteEmail} />
              <Button type="submit">Inviter {inviteEmail}</Button>
            </form>
          </Card>
        </div>
      )}

      {/* Innkommende forespørsler */}
      {incoming.length > 0 && (
        <>
          <SectionTitle>Vil bli venn med deg</SectionTitle>
          <Card>
            <ul className="divide-y divide-border">
              {incoming.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                  <PersonLine name={personName(r.user)} />
                  <form action={respondFriendRequest} className="flex shrink-0 items-center gap-2">
                    <input type="hidden" name="request_id" value={r.id} />
                    <input type="hidden" name="accept" value="0" />
                    <SubmitButton label="Avslå" variant="ghost" />
                  </form>
                  <form action={respondFriendRequest} className="shrink-0">
                    <input type="hidden" name="request_id" value={r.id} />
                    <input type="hidden" name="accept" value="1" />
                    <SubmitButton label="Godta" />
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {/* Vennene dine */}
      <SectionTitle>Vennene dine</SectionTitle>
      <Card>
        {friends.length === 0 ? (
          <p className="font-sans text-[14px] text-muted">
            Du har ingen venner på Tørny ennå. Legg til noen under.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {friends.map((f) => (
              <li key={f.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                <PersonLine name={personName(f)} />
                <ConfirmSubmit
                  action={removeFriend}
                  hiddenName="other_id"
                  hiddenValue={f.id}
                  idleLabel="Fjern"
                  confirmLabel="Fjern venn"
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Utgående forespørsler */}
      {outgoing.length > 0 && (
        <>
          <SectionTitle>Venter på svar</SectionTitle>
          <Card>
            <ul className="divide-y divide-border">
              {outgoing.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                  <PersonLine name={personName(r.user)} />
                  <form action={removeFriend} className="shrink-0">
                    <input type="hidden" name="other_id" value={r.user.id} />
                    <SubmitButton label="Trekk tilbake" variant="ghost" />
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {/* Forslag fra co-players */}
      {suggestions.length > 0 && (
        <>
          <SectionTitle>Folk du har spilt med</SectionTitle>
          <Card>
            <ul className="divide-y divide-border">
              {suggestions.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                  <PersonLine name={personName(s)} />
                  <form action={sendFriendRequest} className="shrink-0">
                    <input type="hidden" name="addressee_id" value={s.id} />
                    <SubmitButton label="Legg til" variant="secondary" />
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {/* Legg til på e-post */}
      <SectionTitle>Legg til på e-post</SectionTitle>
      <Card>
        <p className="mb-3 font-sans text-[14px] text-muted">
          Send en venneforespørsel til e-posten. Er de ikke på Tørny, kan du
          invitere dem.
        </p>
        <AddByEmailForm action={addFriendByEmail} />
      </Card>

      {/* Del lenke */}
      {friendCode && (
        <>
          <SectionTitle>Del en lenke</SectionTitle>
          <Card>
            <p className="mb-3 font-sans text-[14px] text-muted">
              Den som åpner lenken din, blir venn med deg med en gang.
            </p>
            <CopyLinkButton path={`/venner/legg-til/${friendCode}`} />
          </Card>
        </>
      )}
    </AppShell>
  );
}
