import { useTranslations } from 'next-intl';
import { socialProofForm, type GameSocialProof } from '@/lib/games/socialProof';

/**
 * Sosialt-bevis-linja i join-funnelen (#1193). Ren presentasjon: den tar et
 * ferdig-formet {@link GameSocialProof}-signal (venne-navn er alt kappet og
 * personvern-formatert serverside) og viser formen `socialProofForm` velger
 * (#2258 — samme valg som terminlista-raden):
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

  const form = socialProofForm({ joinedCount, knownFriendNames, knownFriendOverflow });
  if (form == null) return null;

  const text =
    form.kind === 'friendsOverflow'
      ? t('friendsOverflow', { name: form.name, count: form.count })
      : form.kind === 'friendsTwo'
        ? t('friendsTwo', { name1: form.name1, name2: form.name2 })
        : form.kind === 'friendsOne'
          ? t('friendsOne', { name: form.name })
          : t('count', { count: form.count });
  const isFriendSignal = form.kind !== 'count';

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
