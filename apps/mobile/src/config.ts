// Connection target for the probe. Override via EXPO_PUBLIC_* env at build time.
// Default host `ws://10.0.2.2:3000` is the Android emulator alias for the host
// machine's localhost (where `spacetime start` runs). See VERIFICATION.md (V-1).
export const SPACETIMEDB_HOST: string =
  process.env.EXPO_PUBLIC_SPACETIMEDB_HOST ?? 'ws://10.0.2.2:3000';

export const SPACETIMEDB_DB_NAME: string =
  process.env.EXPO_PUBLIC_SPACETIMEDB_DB_NAME ?? 'agentspace-probe';
