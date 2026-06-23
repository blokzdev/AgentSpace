import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTable } from 'spacetimedb/react';
import { tables } from '../../module_bindings';
import { Avatar } from '../components/Avatar';
import { colors, matchesQuery, radius, space } from '../chat';

/**
 * Pick one of the user's own agents to add to a thread (M2.1). Mirrors UserPicker
 * but over `my_agents`; excludes agents already in the thread (by id, as strings).
 */
export function AgentPicker({
  excludeAgentIds,
  onPick,
  onBack,
}: {
  excludeAgentIds: string[];
  onPick: (agentId: bigint) => void;
  onBack: () => void;
}): React.JSX.Element {
  const [agents] = useTable(tables.my_agents);
  const [query, setQuery] = useState('');

  const exclude = useMemo(() => new Set(excludeAgentIds), [excludeAgentIds]);
  const results = useMemo(
    () =>
      agents
        .filter((a) => !exclude.has(a.id.toString()))
        .filter((a) => matchesQuery(a.name, a.model, query))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [agents, exclude, query],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Add agent</Text>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search your agents…"
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoFocus
        value={query}
        onChangeText={setQuery}
      />

      <FlatList
        data={results}
        keyExtractor={(a) => a.id.toString()}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query.length > 0 ? 'No matching agents.' : 'No agents to add — create one in 🤖 Agents first.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onPick(item.id)}>
            <Avatar idKey={`agent-${item.id.toString()}`} name={item.name} emoji="🤖" />
            <View style={styles.rowMain}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sub}>
                {item.provider} · {item.model}
                {item.respondsToAgents ? '  · replies to agents' : ''}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: space.lg, borderBottomColor: colors.border, borderBottomWidth: 1 },
  back: { color: colors.accent, fontSize: 14, marginBottom: 4 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  search: {
    margin: space.md,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    color: colors.text,
    height: 44,
  },
  empty: { color: colors.faint, textAlign: 'center', marginTop: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 10 },
  rowMain: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  sub: { color: colors.faint, fontSize: 12, marginTop: 1 },
});
