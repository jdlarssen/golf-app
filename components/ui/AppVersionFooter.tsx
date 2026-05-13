export function AppVersionFooter() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const sha = process.env.NEXT_PUBLIC_APP_SHA;
  if (!version) return null;
  return (
    <p className="mt-10 text-center text-xs text-muted">
      <span className="tabular-nums" aria-label="App-versjon">
        v{version}
        {sha ? ` · ${sha}` : ''}
      </span>
      {' · '}
      <a
        href="/legal/privacy"
        className="underline underline-offset-2 hover:text-text transition-colors"
      >
        Personvern
      </a>
    </p>
  );
}
