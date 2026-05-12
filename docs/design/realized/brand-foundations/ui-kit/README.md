# Tørny UI Kit

Hi-fi recreation of the Tørny PWA. Mobile-first, mounts inside a phone bezel on desktop and goes full-bleed on actual phones. All screens are interactive — click through login → home → game → hole-screen → review → submit → leaderboard → admin.

**Components**
- `AppShell.jsx` — wraps every screen, owns the linen background and 448px container.
- `BrandMark.jsx` — T-tile + wordmark + Turnering microtext.
- `Button.jsx`, `Card.jsx`, `Input.jsx`, `Pill.jsx`, `Banner.jsx`, `SectionLabel.jsx`, `Icon.jsx`, `SyncDot.jsx`, `Stepper.jsx`, `Medallion.jsx`.
- Screens: `LoginScreen.jsx`, `HomeScreen.jsx`, `HoleScreen.jsx`, `ScorecardScreen.jsx`, `SubmitScreen.jsx`, `LeaderboardScreen.jsx`, `HoleDrilldownScreen.jsx`, `AdminScreen.jsx`, `ProfileScreen.jsx`.

These are *cosmetic recreations*, not production code — no Supabase, no auth. Tap around as if it's real.
