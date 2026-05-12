# Handoff: Quick Win #6 — Admin sekretariat

## Overview
This handoff packages the **clubhouse-feel admin surfaces** for the Tørny golf tournament app. Original brief: *"Klubbhus-følelse på admin-flatene (de bør føles som å gå inn i sekretariatet på en god golfklubb)."* The redesign treats admin not as generic CRUD but as **The Secretariat** (Sekretariatet) — a quiet, ordered room with a ledger book on the desk, brass section bands, a club stamp on the welcome card, and "protokoll" vocabulary throughout.

Three coordinated surfaces:
1. **Sekretariatet (entry)** — warm welcome with section tiles + activity ledger
2. **Spill · liste** — ledger-style tournament list with status chips
3. **Spill · detalj** — single tournament admin with three banded ledger cards

## About the Design Files
HTML/React reference files. Not production code. Recreate in Next.js + Supabase using `next/font/google`, existing color tokens in `app/globals.css`, and `Card`/`Button` primitives.

## Fidelity
**High-fidelity.** Pixel-precise on a ~390px-wide canvas. Final colors, type, spacing, copy.

## Visual language (applies across all three screens)

- **Warmer background** for admin: `#F5F1E4` (vs `#F8F6F0` for player surfaces). Signals "this is a different room." Subtle but consistent.
- **Brass ribbon** (section dividers): horizontal layout with `(left-hairline-pair)(kicker-text)(right-hairline-pair)`. Each hairline-pair is two 1px lines at y=1 and y=5, stacked: top `#D3C9A6` (champagne), bottom `#E5E0D3` (warm beige). Container `height: 6px, position: relative`. Kicker is `--accent` Inter 10/600 uppercase tracking-0.20em.
- **Mini-ribbon** (used inside SectionCard headers): kicker on left, then a 1px gradient line `linear-gradient(90deg, #D3C9A6 0%, transparent 90%)` extending to the right.
- **Club stamp** decorative element: 54×54 circle, `1.5px solid rgba(184,148,70,0.35)`, rotated `-8deg`, contains `TØRNY` over `·1862·` in Fraunces 9/500 tracking-0.16em color `rgba(184,148,70,0.55)`. Used as a corner mark — never a primary element.
- **Protokoll vocabulary** in copy: "Sak {YEAR}-{NNN}" for tournament IDs, "Saksbehandler" for admin role, "Sist signert av…" for audit trail, "Resultatprotokoll" for the historical log, "Spill · protokoll" as the section name.

## Screens / Views

### A. Sekretariatet (admin home)

**Header:** kicker `SEKRETARIATET` muted, `‹` back left, no right action.

**1. Salutation card** — margin 4/14/0, padding 18/20, bg `linear-gradient(180deg, #FBF7E8 0%, #F5EFDE 100%)`, 1px border `#E5DDC2`, radius 16, position relative.
- Kicker `SAKSBEHANDLER` muted.
- Greeting: Fraunces 22/500/-0.015em — `God {morgen|formiddag|ettermiddag|kveld}, {firstName}.` (timeOfDay computed from `Date.now()`).
- Date line: Inter 12 muted tabular-nums — `{day}. {month} · uke {weekNum}`. Norwegian abbreviations, no leading zeros on day.
- Club stamp in top-right corner (14px from top, 14px from right) — see spec above.

**2. Section tile grid** — padding 14/14/8, `display: grid; grid-template-columns: 1fr 1fr; gap: 10`. Four tiles, stagger-fade-in `60 + i*70 ms`:
- Each tile is a button: column flex, padding 14/14/12, radius 14, min-height 108, text-align left.
- First tile (`Spill`) is **accent**: bg `--primary`, color `--bg-tint`, no border, shadow `0 4px 14px rgba(26,46,31,0.15)`. Icon container bg `rgba(201,169,97,0.20)` with icon stroke `--accent`.
- Other tiles: bg `--surface`, 1px border `--border`, shadow `0 1px 2px rgba(26,46,31,0.03)`. Icon container 36×36 radius 9 bg `#F5F1E4`, icon stroke `--primary`.
- Icon: 22×22 SVG, see `<MailIcon/>`, `<CourseIcon/>`, `<TrophyIcon/>`, `<StampIcon/>` in reference.
- Label: Fraunces 16/500/-0.005em.
- Meta: Inter 11 tabular-nums, color `rgba(240,237,229,0.75)` (accent) or `--text-muted`.
- The four tiles: `Spill` (accent) / `Invitasjoner` / `Baner` / `Resultatprotokoll`.

**3. Activity ledger** — kicker `Siste hendelser` muted at 16/18/6, then card margin 0/14, bg `--surface`, 1px border `--border`, radius 14.
- Each row: `display: grid; grid-template-columns: 42px 1fr; align-items: baseline; gap: 10; padding: 10/14`. Top border on all but first.
- Col 1: timestamp `HH:MM` — Fraunces 12/500 muted tabular-nums.
- Col 2: line 1 Inter 13 — `<b>{who}</b> {action}` (action lowercase, present-perfect). Line 2 Fraunces italic 11 muted — context reference (tournament name, course name, etc).
- Stagger-fade-in `320 + i*60 ms`.

**4. Pull-quote footer** — padding 16/24/22, Fraunces italic 11 muted centered. Copy: `«Orden i protokollen.»`

### B. Spill · liste

**Header:** kicker `SEKRETARIATET` muted, `‹` back left, `+ Nytt` pill right (5/10 padding, bg `rgba(229,224,211,0.5)`, 1px border, radius 9999, Inter 10/600 tracking-0.12em uppercase).
**Brass ribbon** below header: kicker `SPILL · PROTOKOLL`.

**Title block:** padding 2/18/0.
- Heading Fraunces 24/500/-0.015em — `Pågående og kommende`.
- Subtitle Inter 11.5 muted: `{count} spill · sortert kronologisk` (count tabular-nums).

**Ledger table:**
- Header row: margin 14/14/0, padding 8/14, bg `--primary`, color `--bg-tint`, top corners radius 12. Grid `1fr 84px 44px gap 10`. Two kickers in `--accent`: `SPILL` (left), `STATUS` (right, text-right). Third column empty (chevron alignment).
- Body: margin 0/14, bg `--surface`, 1px border `--border` with `border-top: none`, bottom corners radius 14, overflow hidden. Each row is a button:
  - Same grid as header but `1fr 84px 14px`.
  - Padding 14/14, border-top `--border` between rows.
  - Col 1: Fraunces 16/500 name + Inter 11.5 muted tabular-nums `{date} · {N}p · {format}`.
  - Col 2: status chip — see spec below.
  - Col 3: `›` chevron in `#9A8F7C` size 14.
- Stagger-fade-in `60 + i*60 ms`.

**Status chips (uppercase pills, Inter 9.5/600 tracking-0.16em, padding 3/7, radius 9999):**
- `Aktiv` — bg `rgba(74,124,89,0.16)`, fg `#2F5A3C`
- `Påmelding` — bg `rgba(216,155,58,0.18)`, fg `#7A5410`
- `Signert` — bg `rgba(92,83,71,0.10)`, fg `--text-muted`
- `Utkast` — bg `rgba(184,70,62,0.12)`, fg `#7A3935`

**Footer pull-quote:** `Tap et spill for å redigere protokollen.` (Fraunces italic 11 muted centered).

### C. Spill · detalj

**Header:** kicker `SPILL · PROTOKOLL` muted, `‹` back left, `⋯` more right (muted, fontSize 18).

**Title block** (padding 2/18/10):
- Row: status chip (`Aktiv` etc.) + Sak number Inter 11 muted tabular-nums `Sak {YYYY}-{NNN}`.
- Heading Fraunces 26/500/-0.015em — tournament name.
- Subtitle Inter 12 muted tabular-nums: `{course} · {format} · {date}`.

**Three SectionCards** stacked, each margin 6/14/0:
- Header: padding 10/4/6, row flex gap 10. Mini-ribbon — kicker on left (muted), gradient hairline `linear-gradient(90deg, #D3C9A6 0%, transparent 90%)` filling the rest.
- Body: bg `--surface`, 1px border `--border`, radius 12, shadow `0 1px 2px rgba(26,46,31,0.03)`.
- Each row: `display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 14; padding: 11/14; border-top: 1px solid #EDE6D2`.
  - Left col: label (Inter 12.5/500) + optional sub (Fraunces italic 11 muted).
  - Right col: value (Fraunces 15/500/-0.005em tabular-nums, right-aligned). Color `#2F5A3C` if `tone="full"`, else `--text`.

**Card 1 ribbon `PÅMELDING`:** rows `Påmeldte` / `Bekreftet` (sub: `N venter på svar`) / `Reserveliste` (sub: `første ut: {initial}.{surname}`).
**Card 2 ribbon `FORMAT`:** rows `Spillform` / `Antall lag` / `Handicap-justering` / `Cut-off`.
**Card 3 ribbon `BANEN`:** rows `Bane` / `Tee` / `Par · lengde` / `CR / SR`.

**Action footer:** padding 8/14/0, row flex gap 8.
- Left button (flex 1, secondary): `Rediger` — 12/14 padding, 1px border `--border`, radius 12, bg `--surface`, Inter 13/600.
- Right button (flex 1.4, primary): `Start runden` — same dimensions, bg `--primary`, color `--bg-tint`, no border.

**Footer caption:** padding 14/24/22, Fraunces italic 11 muted centered. Format: `Sist signert av {name} · {relative-time}` (e.g. `i dag kl. 11:03`, `i går kl. 14:42`, `for 3 dager siden`).

## State Management

```ts
type Tournament = {
  id: string;            // e.g. "lordags"
  name: string;          // "Lørdagsslaget"
  date: string;          // pre-formatted Norwegian
  status: "aktiv" | "påmelding" | "signert" | "utkast";
  players: number;
  format: string;
  saksnummer: string;    // "2026-019"
  // ... full detail fields for the detalj screen
};

const [view, setView] = useState<"home"|"liste"|"detalj">("home");
const [selectedId, setSelectedId] = useState<string | null>(null);
```

Activity ledger items come from a tournament-events stream (Supabase realtime is fine). Sort newest-first, cap at 10–15 on the home screen with a "Se alle" link if there are more.

## Design Tokens

See `colors_and_type.css`. Admin-specific:

```css
--admin-bg:           #F5F1E4;   /* warmer than --bg */
--admin-salutation-top:    #FBF7E8;
--admin-salutation-bottom: #F5EFDE;
--admin-salutation-border: #E5DDC2;

--brass-line-top:    #D3C9A6;   /* champagne hairline */
--brass-line-bottom: #E5E0D3;   /* warm beige */

--stamp-stroke:      rgba(184,148,70,0.35);
--stamp-fill:        rgba(184,148,70,0.55);

--row-divider:       #EDE6D2;   /* between ledger rows (slightly warmer than --border) */
```

Status-chip tokens reuse the score-tone palette from Quick Win #1.

**Dark mode:**
- `--admin-bg` → `#1A2620` (forest-charcoal, distinguishable from player `--bg` dark)
- salutation gradient → `linear-gradient(180deg, #243828 0%, #1F2F23 100%)`
- brass hairlines stay champagne but at 0.65 opacity
- club stamp brightens to `rgba(201,169,97,0.55)` stroke

## Acceptance criteria

- [ ] Admin background is `#F5F1E4` (warmer than player background)
- [ ] Brass ribbon uses two stacked 1px hairlines (champagne over beige), kicker between
- [ ] Club stamp renders rotated `-8deg`, with `TØRNY · 1862 ·` text inside a `rgba(184,148,70,0.35)` ring
- [ ] Section tile grid: 1st tile (`Spill`) is forest with champagne accent, others are white
- [ ] Activity ledger uses `42px 1fr` grid with Fraunces tabular-nums timestamps
- [ ] Spill list ledger has forest header strip with champagne column kickers
- [ ] Status chips: 9.5px Inter 600 tracking-0.16em uppercase, four tones
- [ ] Spill detalj: Sak number in tabular-nums (`Sak 2026-019` format), three banded SectionCards
- [ ] Row dividers inside SectionCards are `#EDE6D2` (warmer than `--border`)
- [ ] All numbers tabular-nums everywhere
- [ ] Mini-ribbon inside SectionCard header: 1px gradient `#D3C9A6 → transparent`
- [ ] Footer pull-quotes are Fraunces italic 11 muted, centered, present on all three screens
- [ ] Dark mode respected (admin bg shifts to forest-charcoal, brass hairlines stay champagne)

## Files

- `design-reference.html` — interactive prototype with three-way switcher
- `ios-frame.jsx` — iPhone device frame (prototype-only)
- `colors_and_type.css` — full Tørny token set
- `assets/brand-mark.svg` — wordmark (not used directly on these screens)
- `README.md` — this file

## Things explicitly out of scope

- Invitasjoner detail screen (referenced as a section tile but not built)
- Baner detail screen (referenced as a section tile but not built)
- Resultatprotokoll archive view (referenced as a section tile but not built)
- Real CRUD forms (e.g. "+ Nytt" wizard) — handoff is for the listings + detail views only
- Multi-tenant club branding (Tørny stamp is the brand; in a future white-label, this becomes a per-club variable)
