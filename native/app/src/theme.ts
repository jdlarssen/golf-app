// Native N3 (#1825): fargene og de få stilene alle spillerskjermene deler.
//
// Samme palett som webben (forest/champagne/linen, `app/globals.css`), men
// ingen ambisjon om et designsystem — N3 er en spike med nøktern polish. Én fil
// i stedet for seks kopier av det samme `StyleSheet.create`-blokket.
import { StyleSheet } from 'react-native';

export const COLORS = {
  /** Deep forest — tekst, knapper, rammer. */
  forest: '#1B4332',
  /** Champagne gold — kun til framheving (aktivt hull, vinnermarkør). */
  gold: '#C9A961',
  /** Linen — bakgrunn. */
  linen: '#F8F6F0',
  card: '#FFFFFF',
  border: '#E3DFD3',
  muted: '#5C6B60',
  error: '#B00020',
} as const;

/** Minste tappbare flate (≥44px, Apple HIG). Brukt av alle steppere. */
export const TAP = 44;

export const ui = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.linen,
    padding: 20,
    gap: 8,
  },
  scroll: {
    flexGrow: 1,
    backgroundColor: COLORS.linen,
    padding: 20,
    gap: 8,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.linen,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.forest,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: COLORS.muted,
    marginTop: 16,
  },
  body: { fontSize: 16, color: COLORS.forest },
  muted: { fontSize: 14, color: COLORS.muted },
  value: { fontSize: 22, fontWeight: '700', color: COLORS.forest },
  /** Tall i tabeller og totaler — samme regel som på web. */
  num: { fontVariant: ['tabular-nums'] },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 8,
  },
  button: {
    backgroundColor: COLORS.forest,
    borderRadius: 10,
    minHeight: TAP,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: { color: COLORS.card, fontSize: 16, fontWeight: '600' },
  buttonSecondary: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.forest,
    minHeight: TAP,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonSecondaryText: { color: COLORS.forest, fontSize: 16, fontWeight: '600' },
  link: {
    minHeight: TAP,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkText: { color: COLORS.forest, fontSize: 15, textDecorationLine: 'underline' },
  banner: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginTop: 8,
  },
  error: { color: COLORS.error, fontSize: 15 },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: COLORS.forest },
});
