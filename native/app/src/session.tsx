// Native N3 (#1825): hvem som er logget inn på DENNE enheten, tilgjengelig for
// hver skjerm uten at bruker-id-en må tres gjennom navigasjons-parametre.
//
// Skjermene får bare `userId`/`email` herfra — alt annet (tokens, refresh)
// eier `src/supabase.ts`. Sesjonen selv holdes av `App.tsx`, som er den ene
// som lytter på `onAuthStateChange`.
import { createContext, useContext, type ReactNode } from 'react';

export interface SessionInfo {
  userId: string;
  email: string | null;
}

const SessionContext = createContext<SessionInfo | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionInfo;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

/**
 * Sesjonen for skjermene innenfor login-porten.
 *
 * Kaster utenfor porten med vilje: hele stacken rendres kun når `App.tsx` har
 * en sesjon, så en `null` her betyr at noen har flyttet en skjerm ut av
 * porten — det skal si fra høyt, ikke gi en tom skjerm.
 */
export function useSession(): SessionInfo {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession må brukes innenfor SessionProvider');
  }
  return value;
}
