import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { sendInvitation } from '../actions';

export function InviteForm() {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-center font-sans text-[13px] font-medium text-primary hover:underline">
        + Inviter ny spiller
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
            label="E-postadresse"
            placeholder="spiller@example.com"
            autoComplete="email"
            required
          />
          <SubmitButton className="w-full" pendingLabel="Inviterer …">
            Send invitasjon
          </SubmitButton>
        </form>
      </div>
    </details>
  );
}
