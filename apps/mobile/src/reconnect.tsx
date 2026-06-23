// Connection gate (M2.5 / BL-022). The SpacetimeDB SDK has no auto-reconnect, and
// on-device a dropped Maincloud socket left the app stuck on "Connecting…". This
// wrapper supervises the provider: it watches the live connection, and on a drop it
// **unmounts** the provider for a backoff interval (the only way to force the SDK's
// ref-counted ConnectionManager to evict + disconnect the dead socket — a same-tick
// remount reuses it), refreshes the id token, then remounts with a fresh builder.
// The phase machine itself is the pure `reconnectReducer` in @agentspace/shared.
import * as React from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SpacetimeDBProvider, useSpacetimeDB } from 'spacetimedb/react';
import { INITIAL_RECONNECT, nextBackoff, reconnectReducer } from '@agentspace/shared';
import { DbConnection } from '../module_bindings';
import { colors } from './chat';
import type { RefreshResult } from './auth';

// The reconnecting unmount must outlast the manager's deferred cleanup (a
// `setTimeout(0)`); a too-short jittered backoff would race it, so floor the gap.
const MIN_RECONNECT_GAP_MS = 250;

export interface ConnectionGateProps {
  /** Build a connection from the given token (undefined = anonymous / local dev). */
  makeBuilder: (token: string | undefined) => ReturnType<typeof DbConnection.builder>;
  /** The token to connect with right now (id token, or a local anonymous token). */
  token: string | undefined;
  /** Refresh the token after a drop; returns the token to use next + an outcome. */
  refresh: () => Promise<RefreshResult>;
  children: React.ReactNode;
}

export function ConnectionGate({ makeBuilder, token, refresh, children }: ConnectionGateProps): React.JSX.Element {
  const [state, dispatch] = React.useReducer(reconnectReducer, INITIAL_RECONNECT);
  const [activeToken, setActiveToken] = React.useState(token);

  const onConnected = React.useCallback(() => dispatch('connected'), []);
  const onDropped = React.useCallback(() => dispatch('dropped'), []);

  // Pick up an externally-changed token (a fresh login / mount restore).
  React.useEffect(() => {
    setActiveToken(token);
  }, [token]);

  // While reconnecting the provider is unmounted; after a backoff, refresh the token
  // and remount (or fall back to Login on a definitive auth error).
  React.useEffect(() => {
    if (state.phase !== 'reconnecting') return;
    let cancelled = false;
    const delay = Math.max(nextBackoff(state.attempt), MIN_RECONNECT_GAP_MS);
    const timer = setTimeout(() => {
      void (async () => {
        const res = await refresh();
        if (cancelled) return;
        if (res.outcome === 'reauth') {
          dispatch('refreshFailed');
          return;
        }
        if (res.token !== undefined) setActiveToken(res.token);
        dispatch('backoffElapsed');
      })();
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state.phase, state.attempt, refresh]);

  // Returning to the foreground often follows a silent background socket death —
  // retry immediately with a reset backoff.
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') dispatch('appForegrounded');
    });
    return () => sub.remove();
  }, []);

  const builder = React.useMemo(() => makeBuilder(activeToken), [makeBuilder, activeToken, state.nonce]);

  if (state.phase === 'reconnecting' || state.phase === 'authLost') {
    return <ReconnectOverlay label={state.phase === 'authLost' ? 'Signing out…' : 'Reconnecting…'} />;
  }

  // phase 'connecting' | 'up' → mount the provider with a fresh builder per nonce.
  return (
    <SpacetimeDBProvider key={state.nonce} connectionBuilder={builder}>
      <ConnectionWatch onConnected={onConnected} onDropped={onDropped} />
      {children}
    </SpacetimeDBProvider>
  );
}

/** Lives inside the provider; reports active↔inactive transitions up to the gate. */
function ConnectionWatch({
  onConnected,
  onDropped,
}: {
  onConnected: () => void;
  onDropped: () => void;
}): null {
  const { isActive, connectionError } = useSpacetimeDB();
  // Per-mount latch: a fresh ConnectionWatch mounts with each provider, so the refs
  // reset naturally on every reconnect.
  const everActive = React.useRef(false);
  const signaledDrop = React.useRef(false);

  React.useEffect(() => {
    if (isActive) {
      if (!everActive.current) {
        everActive.current = true;
        onConnected();
      }
      return;
    }
    // Inactive: a real drop (was active) or a failed (re)connect (error, never active).
    if (!signaledDrop.current && (everActive.current || connectionError)) {
      signaledDrop.current = true;
      onDropped();
    }
  }, [isActive, connectionError, onConnected, onDropped]);

  return null;
}

function ReconnectOverlay({ label }: { label: string }): React.JSX.Element {
  return (
    <SafeAreaView style={styles.center}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.dim}>{label}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 12 },
  dim: { color: colors.dim, fontSize: 14 },
});
