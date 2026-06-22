import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducer, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../module_bindings';
import { colors } from '../chat';

export function AgentList({
  onBack,
  onNew,
  onEdit,
  onOpenThread,
}: {
  onBack: () => void;
  onNew: () => void;
  onEdit: (agentId: bigint) => void;
  onOpenThread: (threadId: bigint) => void;
}): React.JSX.Element {
  const [agents] = useTable(tables.my_agents);
  const [threads] = useTable(tables.my_threads);
  const createAgentDm = useReducer(reducers.createAgentDm);
  const [pending, setPending] = useState<bigint | null>(null);

  // After deploying a new agent DM, jump into it once it appears.
  useEffect(() => {
    if (pending === null) return;
    const dm = threads.find((t) => t.agentId === pending);
    if (dm) {
      setPending(null);
      onOpenThread(dm.id);
    }
  }, [threads, pending, onOpenThread]);

  const onChat = (agentId: bigint): void => {
    const existing = threads.find((t) => t.agentId === agentId);
    if (existing) {
      onOpenThread(existing.id);
      return;
    }
    setPending(agentId);
    void createAgentDm({ agentId });
  };

  const sorted = [...agents].sort((a, b) =>
    a.createdAt.microsSinceUnixEpoch < b.createdAt.microsSinceUnixEpoch ? 1 : -1,
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Threads</Text>
        </Pressable>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Agents</Text>
          <Pressable style={styles.newBtn} onPress={onNew}>
            <Text style={styles.newBtnText}>+ New</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={sorted}
        keyExtractor={(a) => a.id.toString()}
        ListEmptyComponent={<Text style={styles.empty}>No agents yet — create one with “+ New”.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardMain}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.provider}/{item.model}</Text>
              <Text numberOfLines={1} style={styles.prompt}>
                {item.systemPrompt.length > 0 ? item.systemPrompt : 'No system prompt'}
              </Text>
            </View>
            <View style={styles.actions}>
              <Pressable style={styles.editBtn} onPress={() => onEdit(item.id)}>
                <Text style={styles.editText}>Edit</Text>
              </Pressable>
              <Pressable style={styles.chatBtn} onPress={() => onChat(item.id)}>
                <Text style={styles.chatText}>Chat</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: 16, borderBottomColor: colors.border, borderBottomWidth: 1 },
  back: { color: colors.accent, fontSize: 14, marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  newBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  newBtnText: { color: '#06101d', fontWeight: '700' },
  list: { padding: 12, gap: 8 },
  empty: { color: colors.faint, textAlign: 'center', marginTop: 24 },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 10,
  },
  cardMain: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.accent, fontSize: 12 },
  prompt: { color: colors.faint, fontSize: 12, marginTop: 2 },
  actions: { justifyContent: 'center', gap: 6 },
  editBtn: { borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  editText: { color: colors.dim, fontWeight: '600', fontSize: 13 },
  chatBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  chatText: { color: '#06101d', fontWeight: '700', fontSize: 13 },
});
