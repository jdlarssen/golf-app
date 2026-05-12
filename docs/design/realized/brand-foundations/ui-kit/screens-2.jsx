/* global React, COURSE, FLIGHT, LEADERBOARD, AppShell, Card, Pill, Button, Banner, SectionLabel, Icon, SyncDot, Stepper, Medallion, Input */
const { useState: useState2, useEffect: useEffect2, useMemo: useMemo2 } = React;

/* ─────────────────────────────────────────────────────────────────────────────
   HoleScreen — flight + score-input pr spiller
   ────────────────────────────────────────────────────────────────────────── */
function HoleScreen({ holeIdx = 6, onBack, onScorecard }) {
  const hole = COURSE.holes[holeIdx];
  const [scores, setScores] = useState2(() => Object.fromEntries(FLIGHT.map((p) => [p.id, p.id === "me" ? 5 : p.id === "k" ? 4 : null])));
  const [sync, setSync] = useState2(() => Object.fromEntries(FLIGHT.map((p) => [p.id, p.id === "me" ? "synced" : p.id === "k" ? "pending" : "idle"])));
  const next = () => { /* would advance to next hole */ };

  return (
    <AppShell title={`Hull ${hole.num}`} back={{ onClick: onBack }} action={{ icon: "list", label: "Scorekort", onClick: onScorecard }}>
      <Card variant="flush" style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", padding: 18, gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--primary)", display: "grid", placeItems: "center" }}>
            <img src="../assets/flag-pin.svg" width={28} alt="Hull" style={{ filter: "brightness(0) invert(1) sepia(0.1)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="section-label">Stiklestad GK</div>
            <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 22, color: "var(--text)", lineHeight: 1.1 }}>Hull {hole.num}</div>
          </div>
          <div className="flex gap-5" style={{ textAlign: "right" }}>
            <div><div className="section-label">Par</div><div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 24, color: "var(--text)" }}>{hole.par}</div></div>
            <div><div className="section-label">SI</div><div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 24, color: "var(--text-muted)" }}>{hole.si}</div></div>
          </div>
        </div>
      </Card>

      <SectionLabel right={`${Object.values(scores).filter(Boolean).length}/4 ført`}>Flight 1</SectionLabel>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {FLIGHT.map((p) => {
          const extra = p.extra; // strokes på dette hullet
          return (
            <Card key={p.id} variant={p.isMe ? "me" : "default"} style={{ padding: 16 }}>
              <div className="flex items-center" style={{ gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 9999, background: p.isMe ? "var(--primary)" : "var(--border)", color: p.isMe ? "#fff" : "var(--text)", display: "grid", placeItems: "center", fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 16 }}>
                  {p.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
                    {p.name}{p.nick ? <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontWeight: 400 }}> «{p.nick}»</span> : null}
                    {extra > 0 ? <span className="pill tone-accent" style={{ marginLeft: 8 }}>+{extra} slag</span> : null}
                  </div>
                  <div className="tk-helper" style={{ marginTop: 1 }}>HCP {p.hcp.toFixed(1)}</div>
                </div>
                <Stepper value={scores[p.id]} onChange={(v) => {
                  setScores((s) => ({ ...s, [p.id]: v }));
                  setSync((s) => ({ ...s, [p.id]: "pending" }));
                  setTimeout(() => setSync((s) => ({ ...s, [p.id]: "synced" })), 600);
                }} />
                <SyncDot state={sync[p.id]} />
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex" style={{ gap: 10, marginTop: 18 }}>
        <Button kind="secondary" onClick={onBack}>← Hull {hole.num - 1}</Button>
        <Button kind="primary" full onClick={next}>Hull {hole.num + 1} →</Button>
      </div>
    </AppShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ScoreDelta — viser hvor mange slag over/under par hullet er
   ────────────────────────────────────────────────────────────────────────── */
function ScoreDelta({ diff, bold = false }) {
  // E = even par, +N = over, −N = under (norsk minustegn)
  let label, color, bg;
  if (diff === 0)      { label = "E";        color = "var(--text-muted)"; bg = "transparent"; }
  else if (diff < 0)   { label = "−" + Math.abs(diff); color = "var(--success)"; bg = "rgba(74,124,89,0.10)"; }
  else                 { label = "+" + diff; color = "var(--text-muted)"; bg = "rgba(229,224,211,0.45)"; }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 30, padding: "1px 7px",
      borderRadius: 9999,
      background: bg,
      color,
      fontFamily: "var(--font-sans)",
      fontWeight: bold ? 600 : 500,
      fontSize: 11,
      letterSpacing: "0.02em",
      fontVariantNumeric: "tabular-nums",
    }}>{label}</span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   ScorecardScreen — mitt 18-rad scorekort
   ────────────────────────────────────────────────────────────────────────── */
function ScorecardScreen({ onBack, onSubmit }) {
  const myScores = [4, 3, 5, 4, 6, 3, 5, 4, 4, 5, 3, 5, 4, 4, 3, 5, 5, 4];
  // Tildelte slag per hull, fordelt etter Stableford Index (SI) — her: 8 slag totalt (HCP 12.4 → spillehandicap 8)
  // Lavest SI får første slaget; hvis spilleslag > 18, deler ut runde 2 også.
  const STROKES = 8;
  const extras = COURSE.holes.map((h) => (h.si <= STROKES ? 1 : 0) + (h.si <= STROKES - 18 ? 1 : 0));
  const [mode, setMode] = React.useState("netto");
  const total = myScores.reduce((a, b) => a + b, 0);
  const par = COURSE.holes.reduce((a, h) => a + h.par, 0);
  const nettoScores = myScores.map((s, i) => s - extras[i]);
  const shown = mode === "netto" ? nettoScores : myScores;
  const shownTotal = shown.reduce((a, b) => a + b, 0);
  return (
    <AppShell title="Mitt scorekort" back={{ onClick: onBack }}>
      <div className="tk-pageH" style={{ paddingTop: 0 }}>
        <h1>Mitt scorekort</h1>
        <div className="sub">Stiklestad Open · {STROKES} tildelte slag (HCP 12.4)</div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <div style={{ display: "inline-flex", background: "var(--primary-soft)", padding: 4, borderRadius: 9999 }}>
          {["netto", "brutto"].map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: "8px 22px", borderRadius: 9999, border: "none", cursor: "pointer",
              background: mode === m ? "var(--surface)" : "transparent",
              boxShadow: mode === m ? "0 1px 2px rgba(26,46,31,.06)" : "none",
              color: mode === m ? "var(--text)" : "var(--text-muted)",
              fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, letterSpacing: "-0.01em",
              textTransform: "capitalize",
            }}>{m}</button>
          ))}
        </div>
      </div>

      <Card variant="flush">
        <table className="tk-table tabular-nums">
          <thead><tr><th>Hull</th><th className="num">Par</th><th className="num">SI</th><th className="num">Brutto</th><th className="num">{mode === "netto" ? "Netto" : "+/−"}</th></tr></thead>
          <tbody>
            {COURSE.holes.slice(0, 9).map((h, i) => (
              <tr key={h.num}>
                <td>{h.num}</td>
                <td className="num">{h.par}</td>
                <td className="num" style={{ color: "var(--text-muted)" }}>{h.si}{extras[i] ? <span style={{ color: "var(--accent)", marginLeft: 4 }}>{"●".repeat(extras[i])}</span> : null}</td>
                <td className="num" style={{ color: mode === "netto" ? "var(--text-muted)" : "var(--text)" }}>{myScores[i]}</td>
                <td className="num">{mode === "netto" ? <NettoCell raw={myScores[i]} netto={nettoScores[i]} par={h.par} /> : <ScoreDelta diff={myScores[i] - h.par} />}</td>
              </tr>
            ))}
            <SumRow label="Ut" holes={COURSE.holes.slice(0, 9)} scores={shown.slice(0, 9)} mode={mode} />
            {COURSE.holes.slice(9).map((h, i) => (
              <tr key={h.num}>
                <td>{h.num}</td>
                <td className="num">{h.par}</td>
                <td className="num" style={{ color: "var(--text-muted)" }}>{h.si}{extras[i + 9] ? <span style={{ color: "var(--accent)", marginLeft: 4 }}>{"●".repeat(extras[i + 9])}</span> : null}</td>
                <td className="num" style={{ color: mode === "netto" ? "var(--text-muted)" : "var(--text)" }}>{myScores[i + 9]}</td>
                <td className="num">{mode === "netto" ? <NettoCell raw={myScores[i + 9]} netto={nettoScores[i + 9]} par={h.par} /> : <ScoreDelta diff={myScores[i + 9] - h.par} />}</td>
              </tr>
            ))}
            <SumRow label="Inn" holes={COURSE.holes.slice(9)} scores={shown.slice(9)} mode={mode} />
            <tr className="total" style={{ background: "var(--primary-soft)" }}>
              <td>Total</td>
              <td className="num">{par}</td>
              <td></td>
              <td className="num" style={{ fontSize: 18, color: mode === "netto" ? "var(--text-muted)" : "var(--text)" }}>{total}</td>
              <td className="num" style={{ fontSize: 18 }}>
                {mode === "netto" ? <span style={{ color: "var(--primary)" }}>{shownTotal}</span> : <ScoreDelta diff={total - par} bold />}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      <div className="tk-helper" style={{ marginTop: 10, textAlign: "center" }}>
        <span style={{ color: "var(--accent)" }}>●</span> = tildelt slag på hullet
      </div>

      <div style={{ marginTop: 18 }}>
        <Button kind="primary" full onClick={onSubmit}>Levér scorekort</Button>
      </div>
    </AppShell>
  );
}

function NettoCell({ raw, netto, par }) {
  const diff = netto - par;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
      <span style={{ fontFamily: "var(--font-serif)", fontWeight: 500, color: "var(--text)" }}>{netto}</span>
      <ScoreDelta diff={diff} />
    </span>
  );
}

function SumRow({ label, holes, scores, mode }) {
  const sumPar = holes.reduce((a, h) => a + h.par, 0);
  const sumScore = scores.reduce((a, b) => a + b, 0);
  return (
    <tr className="total">
      <td>{label}</td>
      <td className="num">{sumPar}</td>
      <td></td>
      <td className="num" style={{ color: mode === "netto" ? "var(--text-muted)" : "var(--text)" }}>{mode === "netto" ? sumScore + holes.reduce((a, h, i) => a + 0, 0) : sumScore}</td>
      <td className="num">{mode === "netto" ? <span style={{ color: "var(--primary)", fontWeight: 600 }}>{sumScore}</span> : <ScoreDelta diff={sumScore - sumPar} bold />}</td>
    </tr>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   SubmitScreen — gjennomgang før innsending
   ────────────────────────────────────────────────────────────────────────── */
function SubmitScreen({ onBack, onConfirm }) {
  const [missing] = useState2(2);
  const [confirmed, setConfirmed] = useState2(false);
  return (
    <AppShell title="Lever scorekort" back={{ onClick: onBack }}>
      <div className="tk-pageH" style={{ paddingTop: 0 }}>
        <h1>Lever scorekortet</h1>
        <div className="sub">Sjekk at alt stemmer. En i flighten må godkjenne før det publiseres på leaderboard.</div>
      </div>

      {missing > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <Banner tone="warning">⚠️ <b>{missing} hull mangler.</b> Hvis du leverer nå, går disse som ikke spilt.</Banner>
        </div>
      ) : null}

      <Card style={{ marginBottom: 12 }}>
        <div className="section-label" style={{ marginBottom: 8 }}>Oppsummering</div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}><span className="tk-label">Spill</span><span className="tk-helper">Stiklestad Open</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}><span className="tk-label">Format</span><span className="tk-helper">Best ball netto</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}><span className="tk-label">Total slag</span><span style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 18, fontVariantNumeric: "tabular-nums" }}>78</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}><span className="tk-label">Stableford netto</span><span style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 18, fontVariantNumeric: "tabular-nums", color: "var(--primary)" }}>34</span></div>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <div className="section-label" style={{ marginBottom: 8 }}>Godkjennes av</div>
        <div className="flex items-center" style={{ gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 9999, background: "var(--border)", display: "grid", placeItems: "center", fontFamily: "var(--font-serif)", fontWeight: 500 }}>K</div>
          <div style={{ flex: 1 }}><div className="tk-label">Kari «Putter»</div><div className="tk-helper">Markør for flight 1</div></div>
          <Icon name="check" size={20} style={{ color: "var(--text-muted)" }} />
        </div>
      </Card>

      {confirmed ? (
        <Banner tone="success">✓ Scorekort levert — venter på godkjenning fra Kari.</Banner>
      ) : (
        <Button kind="primary" full onClick={() => { setConfirmed(true); setTimeout(onConfirm, 900); }}>Lever scorekort</Button>
      )}
    </AppShell>
  );
}

Object.assign(window, { HoleScreen, ScorecardScreen, SubmitScreen });
