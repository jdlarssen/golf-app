/* global React, COURSE, LEADERBOARD, AppShell, Card, Pill, Button, Banner, SectionLabel, Icon, Medallion, Input */
const { useState: useState3, useEffect: useEffect3, useMemo: useMemo3 } = React;

/* ─────────────────────────────────────────────────────────────────────────────
   Confetti (CSS-only one-shot)
   ────────────────────────────────────────────────────────────────────────── */
function Confetti({ run }) {
  if (!run) return null;
  const colors = ["var(--accent)", "var(--primary)", "#E6C988", "#85B589"];
  const bits = Array.from({ length: 28 }).map((_, i) => {
    const left = (i / 28) * 100;
    const delay = (i % 7) * 60;
    const c = colors[i % colors.length];
    const rot = (i * 37) % 180;
    return <span key={i} style={{ left: `${left}%`, background: c, animationDelay: `${delay}ms`, transform: `rotate(${rot}deg)` }} />;
  });
  return <div className="confetti">{bits}</div>;
}

/* ─────────────────────────────────────────────────────────────────────────────
   LeaderboardScreen
   ────────────────────────────────────────────────────────────────────────── */
function LeaderboardScreen({ onBack, onDrilldown }) {
  const [seen, setSeen] = useState3(false);
  useEffect3(() => { const t = setTimeout(() => setSeen(true), 60); return () => clearTimeout(t); }, []);
  return (
    <AppShell title="Leaderboard" back={{ onClick: onBack }}>
      <div className="tk-pageH" style={{ paddingTop: 0, position: "relative" }}>
        <h1>Leaderboard</h1>
        <div className="sub">Stiklestad Open · Best ball netto · alle 18 spilt</div>
        <Confetti run={seen} />
      </div>

      {/* Hero — 1. plass */}
      <div style={{ position: "relative", marginBottom: 14 }}>
        <Card variant="leader" style={{ padding: 22 }}>
          <div className="flex items-start" style={{ gap: 14 }}>
            <img src="../assets/medallion-gold.svg" width={56} alt="1. plass" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="section-label accent">1. plass</div>
              <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 22, color: "var(--text)", lineHeight: 1.1 }}>{LEADERBOARD[0].team}</div>
              <div className="tk-helper" style={{ marginTop: 4 }}>{LEADERBOARD[0].members}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="section-label">Total</div>
              <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 44, lineHeight: 1, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{LEADERBOARD[0].total}</div>
              <div className="tk-helper" style={{ marginTop: 2 }}>−4 til par</div>
            </div>
          </div>
        </Card>
      </div>

      <SectionLabel right="Trykk for hull-for-hull">Resten av feltet</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {LEADERBOARD.slice(1).map((row, i) => (
          <Card key={row.team} className="lb-row" variant={row.isMe ? "me" : "default"} onClick={onDrilldown} style={{ padding: 16 }}>
            <div className="flex items-center" style={{ gap: 14 }}>
              {row.place <= 3 ? <Medallion place={row.place} /> : <span style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 22, color: "var(--text-muted)", width: 44, textAlign: "center" }}>{row.place}.</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--text)" }}>{row.team}</div>
                <div className="tk-helper" style={{ marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.members}</div>
              </div>
              <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 28, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{row.total}</div>
              <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>→</span>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   HoleDrilldownScreen
   ────────────────────────────────────────────────────────────────────────── */
function HoleDrilldownScreen({ onBack }) {
  // pretend scores for Lag 2 across 18 holes
  const lag2 = [4, 3, 5, 4, 4, 3, 4, 4, 4, 5, 3, 5, 3, 4, 3, 5, 5, 4];
  const winners = [true, true, false, true, false, false, true, false, false, false, true, true, true, false, true, false, true, true];
  return (
    <AppShell title="Hull for hull" back={{ onClick: onBack }}>
      <div className="tk-pageH" style={{ paddingTop: 0 }}>
        <h1>Lag 2 · hull for hull</h1>
        <div className="sub">Champagne-merket = hullet vant lag 2 netto</div>
      </div>

      <Card variant="flush">
        <table className="tk-table tabular-nums">
          <thead><tr><th>Hull</th><th className="num">Par</th><th className="num">Lag 2</th><th></th></tr></thead>
          <tbody>
            {COURSE.holes.map((h, i) => (
              <tr key={h.num} style={winners[i] ? { background: "rgba(201,169,97,0.06)" } : null}>
                <td>{h.num}</td>
                <td className="num">{h.par}</td>
                <td className="num" style={{ color: lag2[i] < h.par ? "var(--success)" : lag2[i] > h.par ? "var(--text-muted)" : "var(--text)", fontWeight: lag2[i] !== h.par ? 600 : 500 }}>{lag2[i]}</td>
                <td className="num" style={{ width: 32 }}>{winners[i] ? <span style={{ color: "var(--accent)", fontSize: 14 }}>★</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </AppShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   AdminScreen — klubbhus-følelse
   ────────────────────────────────────────────────────────────────────────── */
function AdminScreen({ onBack, onInvite, onCourses, onGames }) {
  return (
    <AppShell title="Sekretariatet" back={{ onClick: onBack }}>
      <div className="tk-pageH" style={{ paddingTop: 0 }}>
        <h1>Sekretariatet</h1>
        <div className="sub">Du har admin-rettigheter for Stiklestad GK.</div>
      </div>

      <SectionLabel tone="accent">Klubben</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
        <Card onClick={onGames}>
          <div className="flex items-center" style={{ gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(201,169,97,0.12)", border: "1px solid rgba(201,169,97,0.30)", display: "grid", placeItems: "center", color: "var(--accent)" }}>
              <Icon name="trophy" size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--text)" }}>Spill</div>
              <div className="tk-helper">3 aktive · 12 avsluttet</div>
            </div>
            <span style={{ color: "var(--text-muted)" }}>→</span>
          </div>
        </Card>

        <Card onClick={onCourses}>
          <div className="flex items-center" style={{ gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--primary-soft)", display: "grid", placeItems: "center", color: "var(--primary)" }}>
              <Icon name="map-pin" size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--text)" }}>Baner</div>
              <div className="tk-helper">2 baner registrert</div>
            </div>
            <span style={{ color: "var(--text-muted)" }}>→</span>
          </div>
        </Card>

        <Card onClick={onInvite}>
          <div className="flex items-center" style={{ gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--primary-soft)", display: "grid", placeItems: "center", color: "var(--primary)" }}>
              <Icon name="mail" size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 17, color: "var(--text)" }}>Invitasjoner</div>
              <div className="tk-helper">8 sendt · 3 venter</div>
            </div>
            <span style={{ color: "var(--text-muted)" }}>→</span>
          </div>
        </Card>
      </div>

      <SectionLabel>Konto</SectionLabel>
      <Card>
        <div className="flex items-center justify-between">
          <span className="tk-label">Logg ut av sekretariatet</span>
          <Button kind="danger" onClick={onBack}>Logg ut</Button>
        </div>
      </Card>
    </AppShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ProfileScreen
   ────────────────────────────────────────────────────────────────────────── */
function ProfileScreen({ onBack }) {
  const [name, setName] = useState3("Sindre Bjørnstad");
  const [nick, setNick] = useState3("Slice");
  const [hcp, setHcp] = useState3("12.4");
  return (
    <AppShell title="Min profil" back={{ onClick: onBack }}>
      <div className="tk-pageH" style={{ paddingTop: 0 }}>
        <h1>Min profil</h1>
        <div className="sub">Endringer publiseres til alle dine flights.</div>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <div className="flex items-center" style={{ gap: 14, marginBottom: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: 9999, background: "var(--primary)", color: "#fff", display: "grid", placeItems: "center", fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 28 }}>S</div>
          <div><div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 19, color: "var(--text)" }}>Sindre «Slice»</div><div className="tk-helper">Stiklestad GK · medlem siden 2024</div></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input label="Navn" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Nickname" value={nick} onChange={(e) => setNick(e.target.value)} hint="Vises i flight-listen, f.eks. «Slice»" />
          <Input label="Handicap-index" value={hcp} onChange={(e) => setHcp(e.target.value)} tabular hint="Tallet du har i Golfbox akkurat nå" />
        </div>
      </Card>

      <Button kind="primary" full>Lagre endringer</Button>
    </AppShell>
  );
}

Object.assign(window, { LeaderboardScreen, HoleDrilldownScreen, AdminScreen, ProfileScreen });
