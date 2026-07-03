/**
 * Forces the embed's colour theme regardless of the visitor's OS preference
 * (#1024). The dark palette in globals.css is gated on
 * `:root:not([data-theme='light'])`, so setting the attribute is all it takes.
 * Default is light — predictable on club websites; `?theme=dark` opts an
 * info-screen into the dark palette.
 *
 * Rendered as an inline script early in the page body so it runs before the
 * content below it paints (minimises theme-flash on dark-OS visitors).
 */
export function EmbedThemeScript({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.documentElement.dataset.theme=${JSON.stringify(theme)};`,
      }}
    />
  );
}

/** Parse the `?theme=` search param — anything but 'dark' means light. */
export function parseEmbedTheme(raw: string | string[] | undefined): 'light' | 'dark' {
  return raw === 'dark' ? 'dark' : 'light';
}
