// RN ↔ SpacetimeDB connectivity probe (M0.2b). Proves connect + subscribe +
// reducer round-trip against the example chat module. Pass/fail steps live in
// VERIFICATION.md (V-1). Swapped for the AgentSpace module in M0.3+.
import { useState } from 'react';
import {
  ActivityIndicator,
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SpacetimeDBProvider, useSpacetimeDB, useTable, useReducer } from 'spacetimedb/react';
import { Identity } from 'spacetimedb';
import { DbConnection, tables, reducers, type ErrorContext } from './module_bindings';
import { SPACETIMEDB_DB_NAME, SPACETIMEDB_HOST } from './src/config';

const connectionBuilder = DbConnection.builder()
  .withUri(SPACETIMEDB_HOST)
  .withDatabaseName(SPACETIMEDB_DB_NAME)
  .onConnect((_conn: DbConnection, identity: Identity) => {
    console.info('Connected to SpacetimeDB as', identity.toHexString());
  })
  .onDisconnect(() => console.info('Disconnected from SpacetimeDB'))
  .onConnectError((_ctx: ErrorContext, err: Error) => {
    console.warn('SpacetimeDB connect error:', err.message);
  });

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function Probe() {
  const { identity, isActive } = useSpacetimeDB();
  const [users] = useTable(tables.user);
  const [messages] = useTable(tables.message);
  const sendMessage = useReducer(reducers.sendMessage);
  const [sent, setSent] = useState(0);

  const onSend = (): void => {
    sendMessage({ text: `probe ping ${Date.now()}` })
      .then(() => setSent((n) => n + 1))
      .catch((e: unknown) => console.warn('reducer call failed:', e));
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>AgentSpace · RN ↔ SpacetimeDB probe</Text>
        <Row label="Host" value={SPACETIMEDB_HOST} />
        <Row label="Database" value={SPACETIMEDB_DB_NAME} />
        <Row label="Status" value={isActive ? 'connected' : 'connecting…'} />
        <Row
          label="Identity"
          value={identity ? `${identity.toHexString().slice(0, 16)}…` : '—'}
        />
        <Row label="Users (subscribed)" value={String(users.length)} />
        <Row label="Messages (subscribed)" value={String(messages.length)} />
        <Row label="Reducer calls sent" value={String(sent)} />
        <View style={styles.button}>
          <Button
            title="Send test message (reducer)"
            onPress={onSend}
            disabled={!isActive}
          />
        </View>
        {!isActive && <ActivityIndicator style={styles.spinner} />}
        <Text style={styles.hint}>Pass/fail criteria + run steps: VERIFICATION.md (V-1)</Text>
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <Probe />
    </SpacetimeDBProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f14' },
  content: { padding: 20, gap: 8 },
  title: { color: '#e6edf3', fontSize: 18, fontWeight: '600', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomColor: '#1c2530',
    borderBottomWidth: 1,
  },
  label: { color: '#8b98a5', fontSize: 14 },
  value: { color: '#e6edf3', fontSize: 14, fontWeight: '500' },
  button: { marginTop: 16 },
  spinner: { marginTop: 16 },
  hint: { color: '#5b6773', fontSize: 12, marginTop: 24 },
});
