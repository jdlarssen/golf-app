// native/app/src/components/ProfileGate.tsx
// #2216: porten mellom sesjonen og stacken for spillere uten fullført profil.
//
// Samme form som `OwnerGate`: den sjekker én ting før barna (stacken)
// rendres. Er `profile_completed_at` tom, vises «Fullfør profilen» i stedet,
// samme regel som nettsidens `/`. Steget kommer altså når profilen ikke er
// fullført, ikke bare rett etter at kontoen ble laget.
//
// **Slipper gjennom ved tvil.** Appen er offline-først, og en runde skal aldri
// stoppe på en profilsjekk. Avgjørelsen bor i `data/profileGate.ts`: en profil
// enheten har sett fullført, leses ikke igjen; uten nett, når lesingen feiler,
// og når den henger lenger enn taket, rendres barna. Steget kommer da neste
// gang appen starter med nett.
//
// **Venter på stegene etter innloggingen.** Rett etter en kode-innlogging er
// `finishLogin` i gang (`data/loginCode.ts`). Porten leser først når den er
// ferdig, med et tak på ventetiden: da står spillet en invitert ble lagt inn i
// både på kortet i «Fullfør profilen» og på Hjem.
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { afterLoginSettled } from '../data/loginCode';
import type { OwnProfile } from '../data/profile';
import { profileStepFor, rememberProfileComplete } from '../data/profileGate';
import { CompleteProfile } from '../screens/CompleteProfile';
import { useTheme } from '../theme';

type GateState = { kind: 'checking' } | { kind: 'open' } | { kind: 'step'; profile: OwnProfile };

export function ProfileGate({ userId, children }: { userId: string; children: ReactNode }) {
  const { colors, ui } = useTheme();
  const [state, setState] = useState<GateState>({ kind: 'checking' });

  useEffect(() => {
    let cancelled = false;
    const settle = (next: GateState) => {
      if (!cancelled) setState(next);
    };
    void (async () => {
      await afterLoginSettled();
      const profile = await profileStepFor(userId);
      settle(profile ? { kind: 'step', profile } : { kind: 'open' });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (state.kind === 'checking') {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (state.kind === 'step') {
    return (
      <CompleteProfile
        userId={userId}
        profile={state.profile}
        onDone={() => {
          void rememberProfileComplete(userId);
          setState({ kind: 'open' });
        }}
      />
    );
  }
  return <>{children}</>;
}
