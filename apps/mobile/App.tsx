// AgentSpace mobile — realtime chat MVP on the AgentSpace SpacetimeDB module.
// SpacetimeAuth (OIDC) login (M1.2): the id token from the login flow is passed to
// the connection via .withToken(); the SpacetimeDBProvider only mounts once signed in.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SpacetimeDBProvider, useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { Identity } from 'spacetimedb';
import { DbConnection, reducers, tables, type ErrorContext } from './module_bindings';
import { SPACETIMEDB_DB_NAME, SPACETIMEDB_HOST } from './src/config';
import { useSpacetimeAuth } from './src/auth';
import { colors } from './src/chat';
import { Login } from './src/screens/Login';
import { ThreadList } from './src/screens/ThreadList';
import { Thread } from './src/screens/Thread';
import { ThreadMembers } from './src/screens/ThreadMembers';
import { UserPicker } from './src/screens/UserPicker';
import { AgentList } from './src/screens/AgentList';
import { AgentEditor } from './src/screens/AgentEditor';

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

type Screen =
  | { name: 'threads' }
  | { name: 'thread'; threadId: bigint }
  | { name: 'members'; threadId: bigint }
  | { name: 'addMember'; threadId: bigint }
  | { name: 'newChat' }
  | { name: 'agents' }
  | { name: 'agentEditor'; agentId: bigint | null };

function Root({ onSignOut }: { onSignOut: () => void }): React.JSX.Element {
  const { isActive, identity } = useSpacetimeDB();
  const [threads] = useTable(tables.my_threads);
  const [members] = useTable(tables.my_thread_members);
  const createDm = useReducer(reducers.createDm);
  const addMember = useReducer(reducers.addMember);
  const createGroup = useReducer(reducers.createGroup);
  const [screen, setScreen] = useState<Screen>({ name: 'threads' });
  const [pendingDm, setPendingDm] = useState<string | null>(null); // other identity hex
  const [pendingGroupAfter, setPendingGroupAfter] = useState<bigint | null>(null); // max group id at create time

  // Find the human DM I share with `otherHex`, if any (for open-or-create).
  const findDm = (otherHex: string): bigint | undefined => {
    for (const t of threads) {
      if (t.kind !== 'dm' || t.agentId !== 0n) continue;
      const them = members.some((m) => m.threadId === t.id && m.member.toHexString() === otherHex);
      const me = members.some((m) => m.threadId === t.id && identity && m.member.isEqual(identity));
      if (them && me) return t.id;
    }
    return undefined;
  };

  // Once a freshly-created DM appears, jump into it.
  useEffect(() => {
    if (pendingDm === null) return;
    const id = findDm(pendingDm);
    if (id !== undefined) {
      setPendingDm(null);
      setScreen({ name: 'thread', threadId: id });
    }
  }, [threads, members, pendingDm]);

  const startDm = (other: Identity): void => {
    const hex = other.toHexString();
    const existing = findDm(hex);
    if (existing !== undefined) {
      setScreen({ name: 'thread', threadId: existing });
      return;
    }
    void createDm({ other });
    setPendingDm(hex);
  };

  const maxGroupId = (): bigint =>
    threads.reduce((max, t) => (t.kind === 'group' && t.agentId === 0n && t.id > max ? t.id : max), 0n);

  const startGroup = (): void => {
    setPendingGroupAfter(maxGroupId());
    void createGroup({ title: 'New group' });
  };

  // Jump into a freshly-created group's member screen (to name + add people).
  useEffect(() => {
    if (pendingGroupAfter === null) return;
    const fresh = threads.find((t) => t.kind === 'group' && t.agentId === 0n && t.id > pendingGroupAfter);
    if (fresh) {
      setPendingGroupAfter(null);
      setScreen({ name: 'members', threadId: fresh.id });
    }
  }, [threads, pendingGroupAfter]);

  if (!isActive) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.dim}>Connecting to AgentSpace…</Text>
      </SafeAreaView>
    );
  }

  switch (screen.name) {
    case 'thread':
      return (
        <Thread
          threadId={screen.threadId}
          onBack={() => setScreen({ name: 'threads' })}
          onMembers={() => setScreen({ name: 'members', threadId: screen.threadId })}
        />
      );
    case 'members':
      return (
        <ThreadMembers
          threadId={screen.threadId}
          onAddMember={() => setScreen({ name: 'addMember', threadId: screen.threadId })}
          onBack={() => setScreen({ name: 'thread', threadId: screen.threadId })}
          onLeft={() => setScreen({ name: 'threads' })}
        />
      );
    case 'addMember': {
      const tid = screen.threadId;
      const excludeIds = members.filter((m) => m.threadId === tid).map((m) => m.member.toHexString());
      return (
        <UserPicker
          title="Add member"
          excludeIds={excludeIds}
          onPick={(member) => {
            void addMember({ threadId: tid, member, role: 'human' });
            setScreen({ name: 'members', threadId: tid });
          }}
          onBack={() => setScreen({ name: 'members', threadId: tid })}
        />
      );
    }
    case 'newChat':
      return (
        <UserPicker
          title="New chat"
          excludeIds={[]}
          onPick={(other) => startDm(other)}
          onBack={() => setScreen({ name: 'threads' })}
        />
      );
    case 'agents':
      return (
        <AgentList
          onBack={() => setScreen({ name: 'threads' })}
          onNew={() => setScreen({ name: 'agentEditor', agentId: null })}
          onEdit={(agentId) => setScreen({ name: 'agentEditor', agentId })}
          onOpenThread={(threadId) => setScreen({ name: 'thread', threadId })}
        />
      );
    case 'agentEditor':
      return <AgentEditor agentId={screen.agentId} onBack={() => setScreen({ name: 'agents' })} />;
    default:
      return (
        <ThreadList
          onOpen={(threadId) => setScreen({ name: 'thread', threadId })}
          onNewChat={() => setScreen({ name: 'newChat' })}
          onNewGroup={startGroup}
          onAgents={() => setScreen({ name: 'agents' })}
          onSignOut={onSignOut}
        />
      );
  }
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
