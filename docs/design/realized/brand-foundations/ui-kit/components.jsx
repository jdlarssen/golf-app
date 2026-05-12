/* global React */
const { useState, useEffect } = React;

/* ── BrandMark ─────────────────────────────────────────────────────────────── */
/* Wordmark-only: "Tørny" (with ø) + champagne prikk whose TOP edge sits on the
   x-height line (top of lowercase letters). Tagline: "Golfturneringsappen". */
function BrandMark({ size = "md", showTagline = true }) {
  const fs = size === "lg" ? 56 : size === "sm" ? 22 : 36;
  const dot = Math.round(fs * 0.14);
  const tagSize = size === "lg" ? 12 : size === "sm" ? 9 : 10.5;
  return (
    <div className="leading-none" style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: size === "lg" ? 10 : 6 }}>
      <span style={{ display: "inline-flex", alignItems: "baseline", fontFamily: "var(--font-serif)", lineHeight: 1, color: "var(--text)" }}>
        <span style={{ fontWeight: 500, fontSize: fs, letterSpacing: "-0.005em" }}>Tørny</span>
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: dot,
            height: dot,
            borderRadius: "50%",
            background: "var(--accent)",
            marginLeft: Math.round(fs * 0.10),
            /* lift dot so its TOP edge lands on the x-height line
               (baseline + 1ex), starting from baseline-aligned bottom edge */
            transform: `translateY(calc(-1ex - ${dot}px))`,
          }}
        />
      </span>
      {showTagline ? (
        <span style={{ fontFamily: "var(--font-sans)", fontSize: tagSize, fontWeight: 400, color: "var(--text-muted)", letterSpacing: "0.005em", lineHeight: 1.2 }}>
          Fyr opp golfturneringen på et{" "}
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>par</span>{" "}
          minutter
        </span>
      ) : null}
    </div>
  );
}

/* ── Buttons ───────────────────────────────────────────────────────────────── */
function Button({ kind = "primary", full = false, disabled, children, onClick, type = "button" }) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`tk-btn tk-btn--${kind} ${full ? "tk-btn--full" : ""}`}>
      {children}
    </button>
  );
}

/* ── Card ──────────────────────────────────────────────────────────────────── */
function Card({ children, variant = "default", onClick, style }) {
  return (
    <div className={`tk-card tk-card--${variant}`} onClick={onClick} style={style} role={onClick ? "button" : undefined}>
      {children}
    </div>
  );
}

/* ── Input ─────────────────────────────────────────────────────────────────── */
function Input({ label, hint, error, tabular, ...rest }) {
  return (
    <label className="flex flex-col gap-1.5">
      {label ? <span className="tk-label">{label}</span> : null}
      <input {...rest} className={`tk-input ${tabular ? "tabular-nums" : ""} ${error ? "tk-input--err" : ""}`} />
      {error ? <span className="tk-helper" style={{ color: "var(--danger)" }}>{error}</span> : hint ? <span className="tk-helper">{hint}</span> : null}
    </label>
  );
}

/* ── Pill ──────────────────────────────────────────────────────────────────── */
function Pill({ tone = "default", children }) {
  return <span className={`pill tone-${tone}`}>{children}</span>;
}

/* ── Banner ────────────────────────────────────────────────────────────────── */
function Banner({ tone = "info", children, onDismiss }) {
  return (
    <div className={`tk-banner tk-banner--${tone}`}>
      <span>{children}</span>
      {onDismiss ? <button className="tk-banner__x" onClick={onDismiss} aria-label="Lukk">×</button> : null}
    </div>
  );
}

/* ── SectionLabel ──────────────────────────────────────────────────────────── */
function SectionLabel({ tone = "muted", children, right }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={`section-label ${tone === "accent" ? "accent" : ""}`}>{children}</span>
      <div className="tk-hairline" style={{ flex: 1, background: tone === "accent" ? "rgba(201,169,97,0.30)" : "var(--border)" }}></div>
      {right ? <span className="tk-helper">{right}</span> : null}
    </div>
  );
}

/* ── Icon (Lucide via web font, currentColor stroke) ───────────────────────── */
function Icon({ name, size = 18, stroke = 1.5, style }) {
  // Render an <i> with data-lucide; lucide.createIcons() replaces it.
  return <i data-lucide={name} style={{ width: size, height: size, display: "inline-flex", ...(style || {}) }} data-stroke={stroke}></i>;
}

/* ── SyncDot ───────────────────────────────────────────────────────────────── */
function SyncDot({ state = "synced" }) {
  const c = state === "synced" ? "var(--success)" : state === "pending" ? "var(--warning)" : "transparent";
  const title = state === "synced" ? "Synkronisert" : state === "pending" ? "Synkroniserer…" : "Ikke lagret";
  return <span title={title} style={{ display: "inline-block", width: 10, height: 10, borderRadius: 9999, background: c, border: state === "idle" ? "1px solid var(--border)" : "none" }} />;
}

/* ── Stepper (− value +) ───────────────────────────────────────────────────── */
function Stepper({ value, onChange, min = 1, max = 14 }) {
  const dec = () => onChange(Math.max(min, (value ?? min) - 1));
  const inc = () => onChange(Math.min(max, (value ?? min - 1) + 1));
  return (
    <div className="tk-stepper">
      <button className="tk-stepper__btn" onClick={dec} aria-label="Mindre">−</button>
      <input className="tk-stepper__input tabular-nums" value={value ?? ""} onChange={(e) => {
        const n = parseInt(e.target.value, 10);
        if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
        else onChange(null);
      }} />
      <button className="tk-stepper__btn" onClick={inc} aria-label="Mer">+</button>
    </div>
  );
}

/* ── Medallion ─────────────────────────────────────────────────────────────── */
function Medallion({ place }) {
  const src = place === 1 ? "../assets/medallion-gold.svg" : place === 2 ? "../assets/medallion-silver.svg" : place === 3 ? "../assets/medallion-bronze.svg" : null;
  if (!src) return <span style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 22, color: "var(--text-muted)", width: 44, textAlign: "center" }}>{place}.</span>;
  return <img src={src} width={44} height={44} alt={`${place}. plass`} />;
}

/* ── AppShell ──────────────────────────────────────────────────────────────── */
function AppShell({ title, back, action, children, hideHeader = false }) {
  return (
    <div className="tk-shell">
      {!hideHeader ? (
        <header className="tk-shell__header">
          <div className="tk-shell__headerInner">
            {back ? (
              <button className="tk-iconbtn" onClick={back.onClick} aria-label="Tilbake">
                <Icon name="arrow-left" size={20} />
              </button>
            ) : <BrandMark size="sm" showTagline={false} />}
            <h1 className="tk-shell__title">{title}</h1>
            {action ? <button className="tk-iconbtn" onClick={action.onClick} aria-label={action.label}><Icon name={action.icon} size={20} /></button> : <span style={{ width: 36 }} />}
          </div>
        </header>
      ) : null}
      <main className="tk-shell__main">{children}</main>
    </div>
  );
}

Object.assign(window, { BrandMark, Button, Card, Input, Pill, Banner, SectionLabel, Icon, SyncDot, Stepper, Medallion, AppShell });
