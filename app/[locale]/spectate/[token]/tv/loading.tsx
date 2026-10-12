/**
 * The big screen's first frame (#2275): only the page colour. Without it the
 * `[locale]` fallback would flash the light Home skeleton on the TV before the
 * scene arrives.
 */
export default function SpectateTvLoading() {
  return <div className="h-dvh w-full cursor-none bg-tv-bg" />;
}
