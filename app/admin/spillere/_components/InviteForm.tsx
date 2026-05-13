import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
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
          <Input
            id="email"
            name="email"
            type="email"
            label="E-postadresse"
            placeholder="spiller@example.com"
            autoComplete="email"
            required
          />
          <Button type="submit" className="w-full">
            Send invitasjon
          </Button>
        </form>
      </div>
    </details>
  );
}
