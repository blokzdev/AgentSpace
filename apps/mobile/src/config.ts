// Connection target. Override via EXPO_PUBLIC_* at build time. Default host
// `ws://10.0.2.2:3000` is the Android emulator's alias for host localhost where
// `spacetime start` runs; db `agentspace` is our module. See VERIFICATION.md V-4.
export const SPACETIMEDB_HOST: string =
  process.env.EXPO_PUBLIC_SPACETIMEDB_HOST ?? 'ws://10.0.2.2:3000';

export const SPACETIMEDB_DB_NAME: string =
  process.env.EXPO_PUBLIC_SPACETIMEDB_DB_NAME ?? 'agentspace';

// SpacetimeAuth (OIDC) login — M1.2. Issuer is the hosted SpacetimeAuth provider;
// the client_id comes from the SpacetimeAuth dashboard (SETUP.md S-1) and has no
// default, so the build is inert until the founder wires it in. The id token from
// this flow is passed to DbConnection.withToken(), which only validates against a
// server that trusts the issuer (Maincloud `agentspace-hpm58`, not a local server).
export const SPACETIMEAUTH_ISSUER: string =
  process.env.EXPO_PUBLIC_SPACETIMEAUTH_ISSUER ?? 'https://auth.spacetimedb.com/oidc';

export const SPACETIMEAUTH_CLIENT_ID: string =
  process.env.EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID ?? '';

export const SPACETIMEAUTH_SCOPES: readonly string[] = ['openid', 'profile', 'email'];

export const SPACETIMEAUTH_CONFIGURED: boolean = SPACETIMEAUTH_CLIENT_ID.length > 0;
