import { after, type NextRequest } from 'next/server';
import { addByEmail } from '@/lib/friends/friendActionsCore';
import { friendActionRoute, textField } from '@/lib/friends/friendRoute';

// Legg til venn på e-post (#2256, 0252). `requested` er det ene svaret for alle
// adresser: har adressen en konto, får personen en venneforespørsel, og har den
// ikke, får adressen en invitasjon. Varselet og e-posten går ut etter at svaret
// er gitt (`after`). De andre kodene står i `ADD_BY_EMAIL_STATUSES`.
// Porten og wire-formen: `lib/friends/friendRoute.ts`. Kropp: { email }.
export async function POST(request: NextRequest) {
  return friendActionRoute(request, 'api/friends/by-email', (client, userId, body) =>
    addByEmail(client, userId, textField(body, 'email'), after),
  );
}
