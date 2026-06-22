// SpacetimeAuth (OIDC) login for the mobile app — M1.2.
// Authorization-code + PKCE against the hosted SpacetimeAuth provider via
// expo-auth-session. The refresh token is the durable credential (persisted in
// SecureStore); the short-lived id token is what we hand to
// DbConnection.withToken() so SpacetimeDB derives a real, stable per-user Identity.
import { useCallback, useEffect, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import {
  SPACETIMEAUTH_CLIENT_ID,
  SPACETIMEAUTH_ISSUER,
  SPACETIMEAUTH_SCOPES,
} from './config';

// Required so the auth popup can hand the result back to the app.
WebBrowser.maybeCompleteAuthSession();

const REFRESH_KEY = 'agentspace.spacetimeauth.refresh';
const ID_TOKEN_KEY = 'agentspace.spacetimeauth.idtoken';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthClaims {
  sub?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
}

export interface SpacetimeAuth {
  status: AuthStatus;
  idToken: string | null;
  claims: AuthClaims | null;
  busy: boolean;
  error: string | null;
  login: () => void;
  logout: () => void;
}

// Decode the JWT payload for display only (never trusted for authz — the server
// validates the token). Avoids a DOM-lib dependency by reaching for a global atob.
function decodeClaims(idToken: string): AuthClaims | null {
  try {
    const seg = idToken.split('.')[1];
    if (!seg) return null;
    const decode = (globalThis as { atob?: (s: string) => string }).atob;
    if (!decode) return null;
    const json = decode(seg.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as AuthClaims;
  } catch {
    return null;
  }
}

async function persist(tokens: { idToken?: string; refreshToken?: string }): Promise<void> {
  if (tokens.refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
  if (tokens.idToken) await SecureStore.setItemAsync(ID_TOKEN_KEY, tokens.idToken);
}

async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(ID_TOKEN_KEY);
}

export function useSpacetimeAuth(): SpacetimeAuth {
  const discovery = AuthSession.useAutoDiscovery(SPACETIMEAUTH_ISSUER);
  // SpacetimeAuth requires native clients on a Custom URI scheme to use a
  // reverse-DNS scheme (a plain `agentspace://` is rejected with
  // `invalid_redirect_uri`). Use the app's package id. MUST stay in sync with
  // `apps/mobile/app.json` `expo.scheme` and the redirect URI registered on the
  // SpacetimeAuth client (SETUP.md S-2): `com.agentspace.probe://redirect`.
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'com.agentspace.probe', path: 'redirect' });

  const [status, setStatus] = useState<AuthStatus>('loading');
  const [idToken, setIdToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: SPACETIMEAUTH_CLIENT_ID,
      scopes: [...SPACETIMEAUTH_SCOPES],
      redirectUri,
      usePKCE: true,
      responseType: AuthSession.ResponseType.Code,
    },
    discovery,
  );

  // Restore a prior session: refresh the stored refresh token into a fresh id token.
  useEffect(() => {
    if (!discovery) return;
    let cancelled = false;
    void (async () => {
      try {
        const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
        if (!refreshToken) {
          if (!cancelled) setStatus('signedOut');
          return;
        }
        const refreshed = await AuthSession.refreshAsync(
          { clientId: SPACETIMEAUTH_CLIENT_ID, refreshToken },
          discovery,
        );
        if (cancelled) return;
        await persist({ idToken: refreshed.idToken, refreshToken: refreshed.refreshToken });
        const fresh = refreshed.idToken ?? (await SecureStore.getItemAsync(ID_TOKEN_KEY)) ?? null;
        if (cancelled) return;
        setIdToken(fresh);
        setStatus(fresh ? 'signedIn' : 'signedOut');
      } catch {
        // Refresh failed (revoked/expired) → require a fresh interactive login.
        if (!cancelled) {
          await clearTokens();
          setStatus('signedOut');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [discovery]);

  // Handle the redirect result of an interactive login.
  useEffect(() => {
    if (!response || !discovery || !request) return;
    if (response.type !== 'success') {
      setBusy(false);
      if (response.type === 'error') {
        setError(response.error?.message ?? 'Sign-in failed.');
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const exchanged = await AuthSession.exchangeCodeAsync(
          {
            clientId: SPACETIMEAUTH_CLIENT_ID,
            code: response.params.code,
            redirectUri,
            extraParams: request.codeVerifier
              ? { code_verifier: request.codeVerifier }
              : undefined,
          },
          discovery,
        );
        if (cancelled) return;
        await persist({ idToken: exchanged.idToken, refreshToken: exchanged.refreshToken });
        setIdToken(exchanged.idToken ?? null);
        setError(null);
        setStatus(exchanged.idToken ? 'signedIn' : 'signedOut');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Token exchange failed.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [response, discovery, request, redirectUri]);

  const login = useCallback(() => {
    setError(null);
    setBusy(true);
    void promptAsync();
  }, [promptAsync]);

  const logout = useCallback(() => {
    void (async () => {
      await clearTokens();
      setIdToken(null);
      setStatus('signedOut');
    })();
  }, []);

  return {
    status,
    idToken,
    claims: idToken ? decodeClaims(idToken) : null,
    busy: busy || !request,
    error,
    login,
    logout,
  };
}
