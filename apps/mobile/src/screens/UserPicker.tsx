import { useMemo, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Identity } from 'spacetimedb';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from '../../module_bindings';
import { Avatar } from '../components/Avatar';
import { colors, matchesQuery, radius, shortId, space } from '../chat';

/**
 * Searchable user directory (the `user` table is public, so all users are
 * visible). Excludes `excludeIds` (hex) + self; calls `onPick` with the choice.
 */
export function UserPicker({
  title,
  excludeIds,
  onPick,
  onBack,
}: {
  title: string;
  excludeIds: string[];
  onPick: (id: Identity) => void;
  onBack: () => void;
}): React.JSX.Element {
  const { identity } = useSpacetimeDB();
  const [users] = useTable(tables.user);
  const [query, setQuery] = useState('');

  const exclude = useMemo(() => {
    const s = new Set(excludeIds);
    if (identity) s.add(identity.toHexString());
    return s;
  }, [excludeIds, identity]);

  const results = useMemo(
    () =>
      users
        .filter((u) => !exclude.has(u.identity.toHexString()))
        .filter((u) => matchesQuery(u.displayName, u.identity.toHexString(), query))
        .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? '')),
    [users, exclude, query],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
      </View>

      <TextInput
        style={styles.search}
        placeholder="Search by name…"
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoFocus
        value={query}
        onChangeText={setQuery}
      />

      <FlatList
        data={results}
        keyExtractor={(u) => u.identity.toHexString()}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query.length > 0 ? 'No matching users.' : 'No other users yet.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onPick(item.identity)}>
            <Avatar
              idKey={item.identity.toHexString()}
              name={item.displayName}
              online={item.online}
            />
            <View style={styles.rowMain}>
              <Text style={styles.name}>{item.displayName ?? shortId(item.identity)}</Text>
              <Text style={styles.sub}>{item.online ? 'online' : 'offline'}</Text>
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
