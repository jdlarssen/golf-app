import { getTranslations } from 'next-intl/server';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { getServerClient } from '@/lib/supabase/server';
import { sendInvitation } from '../actions';

export async function InviteForm() {
  const t = await getTranslations('admin.players');

  // Open the form automatically when there are no pending invitations — the
  // empty-state copy says «Inviter en spiller nedenfor» and the form should
  // be visible without an extra tap. When the list has entries the form stays
  // collapsed so the UI focus stays on the pending rows.
  const supabase = await getServerClient();
  const { count } = await supabase
    .from('invitations')
    .select('id', { count: 'exact', head: true })
    .is('accepted_at', null);
  const pendingCount = count ?? 0;

  return (
    <details className="group" open={pendingCount === 0 || undefined}>
      <summary
        data-testid="invite-toggle"
        className="cursor-pointer list-none text-center font-sans text-[13px] font-medium text-primary hover:underline"
      >
        {t('inviteToggle')}
      </summary>
      <div
        className="mt-3 rounded-xl border border-border bg-surface p-4"
        style={{ boxShadow: '0 1px 2px rgba(26, 46, 31, 0.03)' }}
      >
        <form action={sendInvitation} className="space-y-3">
          {/*
            Honeypot: hidden from real users (display:none + aria-hidden +
            tabIndex=-1), not autofillable (autoComplete=off). Server-side
            silent-rejects when this field comes back populated — see
            actions.ts:sendInvitation. Same field name (`website`) as the
            /login form for consistency.
          */}
          <div aria-hidden="true" style={{ display: 'none' }}>
            <label htmlFor="invite-website">Website</label>
            <input
              id="invite-website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              defaultValue=""
            />
          </div>
          <Input
            id="email"
            name="email"
            type="email"
            label={t('emailLabel')}
            placeholder="spiller@example.com"
            autoComplete="email"
            required
          />
          <SubmitButton className="w-full" pendingLabel={t('invitingBusy')}>
            {t('inviteSubmit')}
          </SubmitButton>
        </form>
      </div>
    </details>
  );
}
