// Empty stub so `import 'server-only'` resolves cleanly under vitest. The
// real `server-only` package is a Next.js marker that fails the bundle if
// it lands in client code — it has no runtime exports, so an empty module
// matches what production code expects.
export {};
