// Spike #1818: the app consumes the web app's lib/scoring SOURCE directly
// (no copy, no published package). Metro only serves files inside the project
// root or watchFolders, so the repo's lib/ is added as a watch folder — that
// is the whole sharing mechanism. The `@/*` aliases inside the shared graph
// (e.g. @/lib/games/teamCaptain) resolve through this app's tsconfig paths,
// which Expo's Metro honors by default. The repo root itself is NOT watched:
// pulling in the Next app's node_modules would be slow and risky.
/* eslint-disable @typescript-eslint/no-require-imports -- Metro loads this file via CommonJS require */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../../lib')];

// Shared repo modules under ../../lib have bare imports of their own (e.g.
// lib/games/prizes.ts imports 'zod'). Metro resolves those from the REQUIRING
// file upward, which lands in the repo root's node_modules — outside the
// project and outside watchFolders, so Metro refuses to serve it. Pointing the
// resolver at this app's node_modules makes shared files resolve their deps
// against the app's own dependency tree instead. Any bare import reachable from
// the shared graph must therefore be a declared dependency of THIS package.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
