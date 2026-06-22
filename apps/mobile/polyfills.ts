// Polyfills required for the SpacetimeDB TS client under React Native / Hermes.
// MUST be imported before any `spacetimedb` import (see index.ts and the spike
// findings in .audit/spike-rn-stdb-2026-06-13.md):
//   - react-native-get-random-values → provides crypto.getRandomValues
//   - text-encoding-polyfill          → provides TextEncoder / TextDecoder
import 'react-native-get-random-values';
import 'text-encoding-polyfill';

// Hermes (RN 0.76) does not implement `Promise.withResolvers` (ES2024), which the
// SpacetimeDB client SDK uses internally for reducer calls. Without this, every
// reducer write (save key, create agent, send message) throws on-device. Polyfill it.
type Resolvers<T> = { promise: Promise<T>; resolve: (v: T | PromiseLike<T>) => void; reject: (r?: unknown) => void };
const P = Promise as unknown as { withResolvers?: <T>() => Resolvers<T> };
if (typeof P.withResolvers !== 'function') {
  P.withResolvers = function withResolvers<T>(): Resolvers<T> {
    let resolve!: (v: T | PromiseLike<T>) => void;
    let reject!: (r?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
