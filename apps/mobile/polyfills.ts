// Polyfills required for the SpacetimeDB TS client under React Native / Hermes.
// MUST be imported before any `spacetimedb` import (see index.ts and the spike
// findings in .audit/spike-rn-stdb-2026-06-13.md):
//   - react-native-get-random-values → provides crypto.getRandomValues
//   - text-encoding-polyfill          → provides TextEncoder / TextDecoder
import 'react-native-get-random-values';
import 'text-encoding-polyfill';
