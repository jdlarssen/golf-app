'use client';

import { useEffect, useState, type CSSProperties, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { setWolfChoice } from '@/lib/wolf/setWolfChoice';
import type { WolfChoice } from '@/lib/scoring/modes/types';

export interface WolfChoiceModalOtherPlayer {
  userId: string;
  name: string;
}

export interface WolfChoiceModalProps {
  isOpen: boolean;
  gameId: string;
  holeNumber: number;
  wolfUserId: string;
  /** De andre spillerne i flighten (alle bortsett fra Wolf — n-1 stk). */
  otherPlayers: WolfChoiceModalOtherPlayer[];
  onClose: () => void;
  /**
   * Trigges etter at server-action har lagret valget. Lar parent mutere lokal
   * state umiddelbart (uten å vente på realtime-broadcast).
   */
  onChoiceSaved: (choice: WolfChoice, partnerUserId: string | null) => void;
}

const WOLF_ERROR_KEYS = new Set([
  'not_authenticated',
  'invalid_choice',
  'partner_required',
  'partner_must_be_null',
  'partner_cannot_be_wolf',
  'invalid_hole',
  'rls_denied',
]);

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.55)',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 16,
};

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: 480,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 18,
  padding: 18,
  boxShadow: '0 -12px 32px rgba(0, 0, 0, 0.18)',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  maxHeight: 'calc(100dvh - 32px)',
  overflowY: 'auto',
};

const headerStyle: CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 22,
  fontWeight: 500,
  color: 'var(--text)',
  margin: 0,
  textAlign: 'center',
};

const subHeaderStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  color: 'var(--text-muted)',
  textAlign: 'center',
  margin: 0,
  marginBottom: 4,
};

const buttonBaseStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  alignItems: 'flex-start',
  width: '100%',
  minHeight: 56,
  padding: '12px 16px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
  fontSize: 16,
  fontWeight: 600,
  textAlign: 'left',
  cursor: 'pointer',
};

const buttonAccentStyle: CSSProperties = {
  ...buttonBaseStyle,
  borderColor: 'var(--accent)',
  background: 'var(--primary-soft)',
};

const subtitleStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  fontWeight: 400,
  color: 'var(--text-muted)',
};

const errorStyle: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  color: 'var(--danger)',
  textAlign: 'center',
  margin: 0,
};

const dividerStyle: CSSProperties = {
  height: 1,
  background: 'var(--border)',
  margin: '6px 0',
};

const closeRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  paddingTop: 4,
};

const closeButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  padding: '8px 14px',
  minHeight: 44,
  cursor: 'pointer',
};

export function WolfChoiceModal(props: WolfChoiceModalProps): JSX.Element | null {
  const t = useTranslations('holes.wolf');
  const {
    isOpen,
    gameId,
    holeNumber,
    wolfUserId,
    otherPlayers,
    onClose,
    onChoiceSaved,
  } = props;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape lukker (men kun hvis vi ikke er midt i en server-call).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  // #465: n = antall spillere. Lone-gevinst = n, blind = n+2 (vises i copy).
  const n = otherPlayers.length + 1;

  async function submitChoice(
    choice: WolfChoice,
    partnerUserId: string | null,
  ) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await setWolfChoice({
        gameId,
        holeNumber,
        wolfUserId,
        choice,
        partnerUserId,
      });
      if (result.ok) {
        onChoiceSaved(choice, partnerUserId);
        onClose();
      } else {
        const key = WOLF_ERROR_KEYS.has(result.error) ? result.error : 'unknown';
        setError(t(`errors.${key}` as Parameters<typeof t>[0]));
      }
    } catch (e) {
      console.error('[WolfChoiceModal] setWolfChoice threw', e);
      setError(t('errors.unknown'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wolf-modal-title"
      data-testid="wolf-choice-modal"
      style={backdropStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div style={cardStyle}>
        <h2 id="wolf-modal-title" style={headerStyle}>
          {t('modalTitle')}
        </h2>
        <p style={subHeaderStyle}>
          {t('modalSubtitle')}
        </p>

        {otherPlayers.map((p) => (
          <button
            key={p.userId}
            type="button"
            data-testid={`wolf-partner-button-${p.userId}`}
            style={buttonBaseStyle}
            disabled={submitting}
            onClick={() => void submitChoice('partner', p.userId)}
          >
            <span>{t('partnerButton', { name: p.name })}</span>
            <span style={subtitleStyle}>{t('partnerButtonSubtitle')}</span>
          </button>
        ))}

        <div style={dividerStyle} />

        <button
          type="button"
          data-testid="wolf-lone-button"
          style={buttonAccentStyle}
          disabled={submitting}
          onClick={() => void submitChoice('lone', null)}
        >
          <span>{t('loneWolfButton')}</span>
          <span style={subtitleStyle}>{t('loneWolfSubtitle', { n })}</span>
        </button>

        <button
          type="button"
          data-testid="wolf-blind-button"
          style={buttonAccentStyle}
          disabled={submitting}
          onClick={() => void submitChoice('blind', null)}
        >
          <span>{t('blindWolfButton')}</span>
          <span style={subtitleStyle}>
            {t('blindWolfSubtitle', { n: n + 2 })}
          </span>
        </button>

        {error && (
          <p role="alert" data-testid="wolf-modal-error" style={errorStyle}>
            {error}
          </p>
        )}

        <div style={closeRowStyle}>
          <button
            type="button"
            data-testid="wolf-modal-close"
            style={closeButtonStyle}
            disabled={submitting}
            onClick={onClose}
          >
            {t('closeButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
