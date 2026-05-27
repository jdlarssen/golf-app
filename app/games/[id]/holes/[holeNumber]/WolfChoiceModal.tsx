'use client';

import { useEffect, useState, type CSSProperties, type JSX } from 'react';
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
  /** De 3 andre spillerne i flighten (alle bortsett fra Wolf). */
  otherPlayers: WolfChoiceModalOtherPlayer[];
  onClose: () => void;
  /**
   * Trigges etter at server-action har lagret valget. Lar parent mutere lokal
   * state umiddelbart (uten å vente på realtime-broadcast).
   */
  onChoiceSaved: (choice: WolfChoice, partnerUserId: string | null) => void;
}

const ERROR_LABELS: Record<string, string> = {
  not_authenticated: 'Du må være logget inn for å velge.',
  invalid_choice: 'Ugyldig valg.',
  partner_required: 'Du må velge en partner.',
  partner_must_be_null: 'Partner skal ikke være satt for Lone/Blind Wolf.',
  partner_cannot_be_wolf: 'Du kan ikke velge deg selv som partner.',
  invalid_hole: 'Ugyldig hull-nummer.',
  rls_denied: 'Du må være Wolf på dette hullet for å velge.',
};

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
        setError(ERROR_LABELS[result.error] ?? 'Noe gikk galt. Prøv igjen.');
      }
    } catch (e) {
      console.error('[WolfChoiceModal] setWolfChoice threw', e);
      setError('Noe gikk galt. Prøv igjen.');
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
          Du er Wolf
        </h2>
        <p style={subHeaderStyle}>
          Velg partner — eller gå alene mot de andre tre.
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
            <span>Partner: {p.name}</span>
            <span style={subtitleStyle}>2v2 — vinneren får 2 hver</span>
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
          <span>Lone Wolf</span>
          <span style={subtitleStyle}>2x innsats — vinner får 4</span>
        </button>

        <button
          type="button"
          data-testid="wolf-blind-button"
          style={buttonAccentStyle}
          disabled={submitting}
          onClick={() => void submitChoice('blind', null)}
        >
          <span>Blind Wolf</span>
          <span style={subtitleStyle}>
            3x innsats — vinner får 6. Velg før noen slår tee shot.
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
            Lukk
          </button>
        </div>
      </div>
    </div>
  );
}
