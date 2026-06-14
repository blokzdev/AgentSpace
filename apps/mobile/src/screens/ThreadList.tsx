import { useState } from 'react';
import {
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../module_bindings';
import { colors, shortId } from '../chat';

export function ThreadList({
  onOpen,
  onAgents,
  onSignOut,
}: {
  onOpen: (id: bigint) => void;
  onAgents: () => void;
  onSignOut: () => void;
}): React.JSX.Element {
  const { identity } = useSpacetimeDB();
  const [threads] = useTable(tables.my_threads);
  const [users] = useTable(tables.user);
  const [agents] = useTable(tables.my_agents);
  const setDisplayName = useReducer(reducers.setDisplayName);
  const createGroup = useReducer(reducers.createGroup);

  const titleOf = (t: { title?: string; kind: string; id: bigint; agentId: bigint }): string => {
    if (t.agentId !== 0n) {
      const a = agents.find((x) => x.id === t.agentId);
      if (a) return `🤖 ${a.name}`;
    }
    return t.title ?? `${t.kind} #${t.id.toString()}`;
  };

  const [name, setName] = useState('');
  const [title, setTitle] = useState('');

  const me = identity ? users.find((u) => u.identity.isEqual(identity)) : undefined;
  const myName = me?.displayName ?? (identity ? shortId(identity) : '—');

  const sorted = [...threads].sort((a, b) =>
    a.createdAt.microsSinceUnixEpoch < b.createdAt.microsSinceUnixEpoch ? 1 : -1,
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>AgentSpace</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={onAgents} hitSlop={8}>
              <Text style={styles.agentsLink}>🤖 Agents</Text>
            </Pressable>
            <Pressable onPress={onSignOut} hitSlop={8}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.you}>You: {myName}</Text>
        {identity ? <Text selectable style={styles.id}>{identity.toHexString()}</Text> : null}
      </View>

      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="Set display name"
          placeholderTextColor={colors.faint}
          value={name}
          onChangeText={setName}
        />
        <Pressable
          style={styles.btn}
          onPress={() => {
            if (name.trim().length === 0) return;
            void setDisplayName({ name: name.trim() });
            setName('');
          }}
        >
          <Text style={styles.btnText}>Save</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="New group title"
          placeholderTextColor={colors.faint}
          value={title}
          onChangeText={setTitle}
        />
        <Pressable
          style={styles.btn}
          onPress={() => {
            if (title.trim().length === 0) return;
            void createGroup({ title: title.trim() });
            setTitle('');
          }}
        >
          <Text style={styles.btnText}>Create</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>Threads</Text>
      <FlatList
        data={sorted}
        keyExtractor={(t) => t.id.toString()}
        ListEmptyComponent={<Text style={styles.empty}>No threads yet — create a group above.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.thread} onPress={() => onOpen(item.id)}>
            <Text style={styles.threadTitle}>{titleOf(item)}</Text>
            <Text style={styles.threadMeta}>{item.agentId !== 0n ? 'agent' : item.kind}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  header: { marginBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  agentsLink: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  signOut: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  you: { color: colors.dim, marginTop: 4 },
  id: { color: colors.faint, fontSize: 11, marginTop: 2 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  input: {
    flex: 1,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: colors.text,
    height: 42,
  },
  btn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  btnText: { color: '#06101d', fontWeight: '700' },
  section: { color: colors.dim, marginTop: 12, marginBottom: 6, fontSize: 13, textTransform: 'uppercase' },
  empty: { color: colors.faint, marginTop: 16 },
  thread: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  threadTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  threadMeta: { color: colors.faint, fontSize: 12, marginTop: 2 },
});
