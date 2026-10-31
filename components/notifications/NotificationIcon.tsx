import type { ComponentType } from 'react';
import {
  FlaggIcon,
  KalenderIcon,
  KlubbhusIcon,
  KonvoluttIcon,
  PokalIcon,
  ProfilIcon,
  ReplayIcon,
  ScorekortIcon,
} from '@/components/icons/Icons';
import type { NotificationIconName } from '@/lib/notifications/icons';

const ICONS: Record<NotificationIconName, ComponentType<{ size?: number | string }>> = {
  konvolutt: KonvoluttIcon,
  scorekort: ScorekortIcon,
  pokal: PokalIcon,
  flagg: FlaggIcon,
  kalender: KalenderIcon,
  profil: ProfilIcon,
  klubbhus: KlubbhusIcon,
  replay: ReplayIcon,
};

/** The drawn icon for an inbox row's disc. Decorative (the icons are `aria-hidden`). */
export function NotificationIcon({ name, size = 16 }: { name: NotificationIconName; size?: number }) {
  const Icon = ICONS[name];
  return <Icon size={size} />;
}
