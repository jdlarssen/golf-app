/* global React, BrandMark, Button, Card, Input, Pill, Banner, SectionLabel, Icon, SyncDot, Stepper, Medallion, AppShell */
const { useState, useEffect, useMemo } = React;

/* ─────────────────────────────────────────────────────────────────────────────
   Fake data
   ────────────────────────────────────────────────────────────────────────── */
const COURSE = {
  name: "Stiklestad GK",
  holes: [
    { num: 1, par: 4, si: 9 },  { num: 2, par: 3, si: 17 }, { num: 3, par: 5, si: 1 },
    { num: 4, par: 4, si: 11 }, { num: 5, par: 4, si: 5 },  { num: 6, par: 3, si: 13 },
    { num: 7, par: 5, si: 3 },  { num: 8, par: 4, si: 7 },  { num: 9, par: 4, si: 15 },
    { num: 10, par: 4, si: 10 },{ num: 11, par: 3, si: 18 },{ num: 12, par: 5, si: 2 },
    { num: 13, par: 4, si: 12 },{ num: 14, par: 4, si: 6 }, { num: 15, par: 3, si: 14 },
    { num: 16, par: 5, si: 4 }, { num: 17, par: 4, si: 8 }, { num: 18, par: 4, si: 16 },
  ],
};
const FLIGHT = [
  { id: "me", name: "Sindre", nick: "Slice", hcp: 12.4, extra: 1, isMe: true },
  { id: "k",  name: "Kari",   nick: "Putter", hcp: 8.2,  extra: 0 },
  { id: "o",  name: "Ole",    nick: null,     hcp: 21.6, extra: 2 },
  { id: "h",  name: "Henrik", nick: null,     hcp: 4.1,  extra: 0 },
];
const LEADERBOARD = [
  { team: "Lag 2", members: "Sindre · Kari · Ole · Henrik", total: 68, thru: 18, place: 1, isMe: true },
  { team: "Lag 1", members: "Marius · Lise · Astrid · Per",  total: 71, thru: 18, place: 2 },
  { team: "Lag 4", members: "Bjørn · Ida · Knut · Eva",      total: 74, thru: 18, place: 3 },
  { team: "Lag 3", members: "Trond · Synne · Jan · Tone",    total: 79, thru: 18, place: 4 },
];

/* ─────────────────────────────────────────────────────────────────────────────
   LoginScreen
   ────────────────────────────────────────────────────────────────────────── */
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [sent, setSent]   = useState(false);
  return (
    <AppShell hideHeader>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", paddingTop: 48 }}>
        <div className="flex flex-col items-center gap-2 mb-12">
          <div style={{ transform: "scale(1.4)", transformOrigin: "top center", marginBottom: 18 }}>
            <BrandMark size="lg" />
          </div>
        </div>
        <Card>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 500, color: "var(--text)", margin: 0 }}>Logg inn</h2>
          <p className="tk-helper" style={{ marginTop: 4, marginBottom: 20 }}>Vi sender deg en lenke på mail. Ingen passord, ingen mas.</p>
          {sent ? (
            <Banner tone="success" onDismiss={() => setSent(false)}>
              <span>✓ Sjekk e-posten din. Klikk lenken vi sendte til <b>{email || "deg"}</b> for å logge inn.</span>
            </Banner>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: sent ? 14 : 0 }}>
            <Input label="E-postadresse" type="email" placeholder="navn@klubben.no" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button kind="primary" full onClick={() => { if (email) { setSent(true); setTimeout(onLogin, 900); } }} disabled={!email}>
              Send meg lenke
            </Button>
          </div>
        </Card>
        <p className="tk-helper" style={{ textAlign: "center", marginTop: 18 }}>Ingen konto? Be admin om en invitasjon.</p>
      </div>
    </AppShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   HomeScreen
   ────────────────────────────────────────────────────────────────────────── */
function HomeScreen({ onOpenGame, onAdmin, onProfile }) {
  return (
    <AppShell hideHeader>
      <div style={{ paddingTop: 12 }}>
        <div className="flex items-center justify-between mb-6">
          <BrandMark size="sm" showTagline={false} />
          <button className="tk-iconbtn" onClick={onProfile} aria-label="Profil"><Icon name="user" size={20} /></button>
        </div>
        <div className="tk-pageH">
          <h1>Hei, Sindre</h1>
          <div className="sub">Du har 1 aktivt spill og 2 spilte runder.</div>
        </div>

        <SectionLabel>Aktive spill</SectionLabel>
        <Card variant="default" onClick={onOpenGame} style={{ marginBottom: 12 }}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 18, color: "var(--text)" }}>Stiklestad Open</div>
              <div className="tk-helper" style={{ marginTop: 2 }}>Stiklestad GK · Lag 2 · Flight 1</div>
            </div>
            <Pill tone="active">Pågående</Pill>
          </div>
          <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
            <span className="tk-helper">Best ball netto · 4 lag</span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--primary)", fontWeight: 500 }}>Hull 7 / 18 →</span>
          </div>
        </Card>

        <SectionLabel>Avsluttet</SectionLabel>
        <Card style={{ marginBottom: 12 }}>
          <div className="flex items-start justify-between">
            <div>
              <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--text)" }}>Vårcup 2026</div>
              <div className="tk-helper" style={{ marginTop: 2 }}>Levanger GK · 12. mai</div>
            </div>
            <div className="flex items-center gap-2"><img src="../assets/medallion-bronze.svg" width={28} alt="3. plass" /><Pill tone="finished">Avsluttet</Pill></div>
          </div>
        </Card>

        <SectionLabel tone="accent">Admin</SectionLabel>
        <Card onClick={onAdmin}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(201,169,97,0.12)", border: "1px solid rgba(201,169,97,0.30)", display: "grid", placeItems: "center", color: "var(--accent)" }}>
                <Icon name="key-round" size={18} />
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 16, color: "var(--text)" }}>Sekretariatet</div>
                <div className="tk-helper">Baner · invitasjoner · spill</div>
              </div>
            </div>
            <span style={{ color: "var(--text-muted)" }}>→</span>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

Object.assign(window, { COURSE, FLIGHT, LEADERBOARD, LoginScreen, HomeScreen });
