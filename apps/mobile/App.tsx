// AgentSpace mobile — realtime chat MVP on the AgentSpace SpacetimeDB module.
// SpacetimeAuth (OIDC) login (M1.2): the id token from the login flow is passed to
// the connection via .withToken(); the SpacetimeDBProvider only mounts once signed in.
import { useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SpacetimeDBProvider, useSpacetimeDB } from 'spacetimedb/react';
import { Identity } from 'spacetimedb';
import { DbConnection, type ErrorContext } from './module_bindings';
import { SPACETIMEDB_DB_NAME, SPACETIMEDB_HOST } from './src/config';
import { useSpacetimeAuth } from './src/auth';
import { colors } from './src/chat';
import { Login } from './src/screens/Login';
import { ThreadList } from './src/screens/ThreadList';
import { Thread } from './src/screens/Thread';

function buildConnection(idToken: string): ReturnType<typeof DbConnection.builder> {
  return DbConnection.builder()
    .withUri(SPACETIMEDB_HOST)
    .withDatabaseName(SPACETIMEDB_DB_NAME)
    .withToken(idToken)
    .onConnect((_conn: DbConnection, identity: Identity) => {
      console.info('connected as', identity.toHexString());
    })
    .onConnectError((_ctx: ErrorContext, err: Error) => {
      console.warn('connect error:', err.message);
    });
}

function Root({ onSignOut }: { onSignOut: () => void }): React.JSX.Element {
  const { isActive } = useSpacetimeDB();
  const [threadId, setThreadId] = useState<bigint | null>(null);

  if (!isActive) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.dim}>Connecting to AgentSpace…</Text>
      </SafeAreaView>
    );
  }

  return threadId === null ? (
    <ThreadList onOpen={setThreadId} onSignOut={onSignOut} />
  ) : (
    <Thread
      threadId={threadId}
      onBack={() => {
        setThreadId(null);
      }}
    />
  );
}

export default function App(): React.JSX.Element {
  const auth = useSpacetimeAuth();
  const connectionBuilder = useMemo(
    () => (auth.idToken ? buildConnection(auth.idToken) : null),
    [auth.idToken],
  );

  if (auth.status === 'loading') {
    return (
      <View style={styles.fill}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.dim}>Restoring session…</Text>
        </SafeAreaView>
        <StatusBar style="light" />
      </View>
    );
  }

  if (auth.status === 'signedOut' || connectionBuilder === null) {
    return (
      <View style={styles.fill}>
        <Login onSignIn={auth.login} busy={auth.busy} error={auth.error} />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <View style={styles.fill}>
        <Root onSignOut={auth.logout} />
        <StatusBar style="light" />
      </View>
    </SpacetimeDBProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 12 },
  dim: { color: colors.dim, fontSize: 14 },
});
