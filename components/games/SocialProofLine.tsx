import { useTranslations } from 'next-intl';
import type { GameSocialProof } from '@/lib/games/socialProof';

/**
 * Sosialt-bevis-linja i join-funnelen (#1193). Ren presentasjon: den tar et
 * ferdig-formet {@link GameSocialProof}-signal (venne-navn er alt kappet og
 * personvern-formatert serverside) og velger form:
 *
 *   - gjensidige venner påmeldt → «Jonas og 2 andre du kjenner er med»
 *   - ellers, noen påmeldt      → «3 har blitt med»
 *   - ingen påmeldt (ekskl. deg) → ingenting
 *
 * Komponenten mottar ALDRI en rå venneliste — kun navn og tall som allerede har
 * passert felt-whitelisten i `getGameSocialProof`.
 */
export function SocialProofLine({
  joinedCount,
  knownFriendNames,
  knownFriendOverflow,
  className,
}: GameSocialProof & { className?: string }) {
  const t = useTranslations('socialProof');

  let text: string | null = null;
  const isFriendSignal = knownFriendNames.length > 0;

  if (isFriendSignal) {
    if (knownFriendOverflow > 0) {
      text = t('friendsOverflow', {
        name: knownFriendNames[0],
        count: knownFriendOverflow,
      });
    } else if (knownFriendNames.length >= 2) {
      text = t('friendsTwo', {
        name1: knownFriendNames[0],
        name2: knownFriendNames[1],
      });
    } else {
      text = t('friendsOne', { name: knownFriendNames[0] });
    }
  } else if (joinedCount > 0) {
    text = t('count', { count: joinedCount });
  }

  if (text == null) return null;

  return (
    <p
      data-testid="social-proof-line"
      className={[
        'font-sans text-sm tabular-nums',
        isFriendSignal ? 'text-text' : 'text-muted',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {text}
    </p>
  );
}
