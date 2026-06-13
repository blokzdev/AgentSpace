// AgentSpace mobile — realtime chat MVP on the AgentSpace SpacetimeDB module
// (M1.1). Human↔human threads + messages + presence. Anonymous identity for now;
// SpacetimeAuth (OIDC) login lands in M1.2.
import { useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SpacetimeDBProvider, useSpacetimeDB } from 'spacetimedb/react';
import { Identity } from 'spacetimedb';
import { DbConnection, type ErrorContext } from './module_bindings';
import { SPACETIMEDB_DB_NAME, SPACETIMEDB_HOST } from './src/config';
import { colors } from './src/chat';
import { ThreadList } from './src/screens/ThreadList';
import { Thread } from './src/screens/Thread';

const connectionBuilder = DbConnection.builder()
  .withUri(SPACETIMEDB_HOST)
  .withDatabaseName(SPACETIMEDB_DB_NAME)
  .onConnect((_conn: DbConnection, identity: Identity) => {
    console.info('connected as', identity.toHexString());
  })
  .onConnectError((_ctx: ErrorContext, err: Error) => {
    console.warn('connect error:', err.message);
  });

function Root(): React.JSX.Element {
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
    <ThreadList onOpen={setThreadId} />
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
  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <View style={styles.fill}>
        <Root />
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
