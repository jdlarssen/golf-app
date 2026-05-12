/* global React, ReactDOM, lucide,
   LoginScreen, HomeScreen, HoleScreen, ScorecardScreen, SubmitScreen,
   LeaderboardScreen, HoleDrilldownScreen, AdminScreen, ProfileScreen */
const { useState: useStateA, useEffect: useEffectA } = React;

const SCREENS = ["login", "home", "hole", "scorecard", "submit", "leaderboard", "drilldown", "admin", "profile"];

function App() {
  const [screen, setScreen] = useStateA("home");
  // re-render lucide icons whenever screen changes
  useEffectA(() => {
    if (window.lucide) {
      requestAnimationFrame(() => window.lucide.createIcons({ attrs: { "stroke-width": 1.5 } }));
    }
  }, [screen]);

  const go = (name) => () => setScreen(name);

  let view = null;
  if (screen === "login")        view = <LoginScreen onLogin={go("home")} />;
  else if (screen === "home")    view = <HomeScreen onOpenGame={go("hole")} onAdmin={go("admin")} onProfile={go("profile")} />;
  else if (screen === "hole")    view = <HoleScreen onBack={go("home")} onScorecard={go("scorecard")} />;
  else if (screen === "scorecard") view = <ScorecardScreen onBack={go("hole")} onSubmit={go("submit")} />;
  else if (screen === "submit")  view = <SubmitScreen onBack={go("scorecard")} onConfirm={go("leaderboard")} />;
  else if (screen === "leaderboard") view = <LeaderboardScreen onBack={go("home")} onDrilldown={go("drilldown")} />;
  else if (screen === "drilldown") view = <HoleDrilldownScreen onBack={go("leaderboard")} />;
  else if (screen === "admin")   view = <AdminScreen onBack={go("home")} onInvite={go("admin")} onCourses={go("admin")} onGames={go("admin")} />;
  else if (screen === "profile") view = <ProfileScreen onBack={go("home")} />;

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "min(40px, 4vw) 0", minHeight: "100vh", background: "linear-gradient(180deg, #efe9d8 0%, #e6dec8 100%)" }}>
      <div>
        <div className="bezel">
          <div className="bezel__notch"></div>
          <div className="bezel__screen" key={screen}>{view}</div>
        </div>

        {/* Screen picker — outside the bezel, dev-only chrome */}
        <div style={{ width: 400, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
          {SCREENS.map((s) => (
            <button key={s} onClick={() => setScreen(s)} style={{
              padding: "6px 12px", borderRadius: 9999,
              border: "1px solid " + (screen === s ? "var(--primary)" : "var(--border)"),
              background: screen === s ? "var(--primary)" : "transparent",
              color: screen === s ? "#fff" : "var(--text-muted)",
              fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500,
              cursor: "pointer", textTransform: "capitalize",
            }}>{s}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
