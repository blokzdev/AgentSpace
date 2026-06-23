// AgentSpace mobile — realtime chat MVP on the AgentSpace SpacetimeDB module.
// SpacetimeAuth (OIDC) login (M1.2): the id token from the login flow is passed to
// the connection via .withToken(); the SpacetimeDBProvider only mounts once signed in.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SpacetimeDBProvider, useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { Identity } from 'spacetimedb';
import { DbConnection, reducers, tables, type ErrorContext } from './module_bindings';
import { SPACETIMEDB_DB_NAME, SPACETIMEDB_HOST } from './src/config';
import { useSpacetimeAuth } from './src/auth';
import * as SecureStore from 'expo-secure-store';
import { colors } from './src/chat';
import { Login } from './src/screens/Login';
import { ThreadList } from './src/screens/ThreadList';
import { Thread } from './src/screens/Thread';
import { ThreadMembers } from './src/screens/ThreadMembers';
import { UserPicker } from './src/screens/UserPicker';
import { AgentPicker } from './src/screens/AgentPicker';
import { AgentList } from './src/screens/AgentList';
import { AgentEditor } from './src/screens/AgentEditor';
import { ApiKeys } from './src/screens/ApiKeys';

// A local `spacetime start` server doesn't run SpacetimeAuth, so the app connects
// ANONYMOUSLY there (no OIDC) — the server assigns an anonymous Identity, persisted
// so it stays stable across reloads. Maincloud keeps the full SpacetimeAuth login.
// The loopback connection (ws://10.0.2.2:3000) is stable, so this is the reliable
// path for local development + on-device verification.
const LOCAL_DEV = /(10\.0\.2\.2|127\.0\.0\.1|localhost)/.test(SPACETIMEDB_HOST);
const LOCAL_TOKEN_KEY = 'agentspace.localdev.token';

function buildConnection(token: string | undefined): ReturnType<typeof DbConnection.builder> {
  return DbConnection.builder()
    .withUri(SPACETIMEDB_HOST)
    .withDatabaseName(SPACETIMEDB_DB_NAME)
    .withToken(token)
    .onConnect((_conn: DbConnection, identity: Identity, tok: string) => {
      if (LOCAL_DEV && tok) void SecureStore.setItemAsync(LOCAL_TOKEN_KEY, tok);
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
  | { name: 'addAgent'; threadId: bigint }
  | { name: 'newChat' }
  | { name: 'agents' }
  | { name: 'agentEditor'; agentId: bigint | null }
  | { name: 'apiKeys' };

// Persist the local-dev anonymous token so the identity (and its agents/threads)
// survives a reload. Lives inside the provider so it can read the live token.
function LocalDevTokenSync(): null {
  const { token } = useSpacetimeDB();
  useEffect(() => {
    if (LOCAL_DEV && token) void SecureStore.setItemAsync(LOCAL_TOKEN_KEY, token);
  }, [token]);
  return null;
}

function Root({ onSignOut }: { onSignOut: () => void }): React.JSX.Element {
  const { isActive, identity } = useSpacetimeDB();
  const [threads] = useTable(tables.my_threads);
  const [members] = useTable(tables.my_thread_members);
  const [threadAgents] = useTable(tables.my_thread_agents);
  const createDm = useReducer(reducers.createDm);
  const addMember = useReducer(reducers.addMember);
  const addAgentToThread = useReducer(reducers.addAgentToThread);
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
          onAddAgent={() => setScreen({ name: 'addAgent', threadId: screen.threadId })}
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
    case 'addAgent': {
      const tid = screen.threadId;
      const excludeAgentIds = threadAgents
        .filter((ta) => ta.threadId === tid)
        .map((ta) => ta.agentId.toString());
      return (
        <AgentPicker
          excludeAgentIds={excludeAgentIds}
          onPick={(agentId) => {
            void addAgentToThread({ threadId: tid, agentId });
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
      return (
        <AgentEditor
          agentId={screen.agentId}
          onBack={() => setScreen({ name: 'agents' })}
          onApiKeys={() => setScreen({ name: 'apiKeys' })}
        />
      );
    case 'apiKeys':
      return <ApiKeys onBack={() => setScreen({ name: 'threads' })} />;
    default:
      return (
        <ThreadList
          onOpen={(threadId) => setScreen({ name: 'thread', threadId })}
          onNewChat={() => setScreen({ name: 'newChat' })}
          onNewGroup={startGroup}
          onAgents={() => setScreen({ name: 'agents' })}
          onApiKeys={() => setScreen({ name: 'apiKeys' })}
          onSignOut={onSignOut}
        />
      );
  }
}

export default function App(): React.JSX.Element {
  const auth = useSpacetimeAuth();
  const [localToken, setLocalToken] = useState<string | undefined>(undefined);
  const [localReady, setLocalReady] = useState(!LOCAL_DEV);
  useEffect(() => {
    if (!LOCAL_DEV) return;
    void SecureStore.getItemAsync(LOCAL_TOKEN_KEY).then((t) => {
      setLocalToken(t ?? undefined);
      setLocalReady(true);
    });
  }, []);

  const connectionBuilder = useMemo(
    () =>
      LOCAL_DEV
        ? localReady
          ? buildConnection(localToken)
          : null
        : auth.idToken
          ? buildConnection(auth.idToken)
          : null,
    [auth.idToken, localReady, localToken],
  );

  let content: React.JSX.Element;
  if (LOCAL_DEV) {
    content = connectionBuilder ? (
      <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
        <LocalDevTokenSync />
        <View style={styles.fill}>
          <Root onSignOut={auth.logout} />
          <StatusBar style="light" />
        </View>
      </SpacetimeDBProvider>
    ) : (
      <View style={styles.fill}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.dim}>Connecting (local dev)…</Text>
        </SafeAreaView>
        <StatusBar style="light" />
      </View>
    );
  } else if (auth.status === 'loading') {
    content = (
      <View style={styles.fill}>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.dim}>Restoring session…</Text>
        </SafeAreaView>
        <StatusBar style="light" />
      </View>
    );
  } else if (auth.status === 'signedOut' || connectionBuilder === null) {
    content = (
      <View style={styles.fill}>
        <Login onSignIn={auth.login} busy={auth.busy} error={auth.error} />
        <StatusBar style="light" />
      </View>
    );
  } else {
    content = (
      <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
        <View style={styles.fill}>
          <Root onSignOut={auth.logout} />
          <StatusBar style="light" />
        </View>
      </SpacetimeDBProvider>
    );
  }

  return <SafeAreaProvider>{content}</SafeAreaProvider>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 12 },
  dim: { color: colors.dim, fontSize: 14 },
});
