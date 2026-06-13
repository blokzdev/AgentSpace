// Connection target. Override via EXPO_PUBLIC_* at build time. Default host
// `ws://10.0.2.2:3000` is the Android emulator's alias for host localhost where
// `spacetime start` runs; db `agentspace` is our module. See VERIFICATION.md V-4.
export const SPACETIMEDB_HOST: string =
  process.env.EXPO_PUBLIC_SPACETIMEDB_HOST ?? 'ws://10.0.2.2:3000';

export const SPACETIMEDB_DB_NAME: string =
  process.env.EXPO_PUBLIC_SPACETIMEDB_DB_NAME ?? 'agentspace';
