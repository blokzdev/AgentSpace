import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Identity } from 'spacetimedb';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../module_bindings';
import { Avatar } from '../components/Avatar';
import { colors, radius, shortId, space } from '../chat';

export function ThreadMembers({
  threadId,
  onAddMember,
  onBack,
  onLeft,
}: {
  threadId: bigint;
  onAddMember: () => void;
  onBack: () => void;
  onLeft: () => void;
}): React.JSX.Element {
  const { identity } = useSpacetimeDB();
  const [threads] = useTable(tables.my_threads);
  const [allMembers] = useTable(tables.my_thread_members);
  const [users] = useTable(tables.user);
  const removeMember = useReducer(reducers.removeMember);
  const setThreadTitle = useReducer(reducers.setThreadTitle);
  const leaveThread = useReducer(reducers.leaveThread);

  const thread = threads.find((t) => t.id === threadId);
  const isCreator = !!(identity && thread && thread.createdBy.isEqual(identity));
  const isGroup = thread?.kind === 'group' && thread.agentId === 0n;

  const members = useMemo(
    () => allMembers.filter((m) => m.threadId === threadId),
    [allMembers, threadId],
  );

  const [title, setTitle] = useState(thread?.title ?? '');

  const nameOf = (id: Identity): string =>
    users.find((u) => u.identity.isEqual(id))?.displayName ?? shortId(id);
  const onlineOf = (id: Identity): boolean =>
    users.find((u) => u.identity.isEqual(id))?.online ?? false;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>{isGroup ? 'Group' : 'Members'}</Text>
        <Text style={styles.meta}>{members.length} members</Text>
      </View>

      {isGroup && isCreator ? (
        <View style={styles.renameRow}>
          <TextInput
            style={styles.input}
            placeholder="Group name"
            placeholderTextColor={colors.faint}
            value={title}
            onChangeText={setTitle}
          />
          <Pressable
            style={styles.saveBtn}
            onPress={() => {
              if (title.trim().length > 0) void setThreadTitle({ threadId, title: title.trim() });
            }}
          >
            <Text style={styles.saveText}>Rename</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {isGroup ? (
          <Pressable style={styles.addBtn} onPress={onAddMember}>
            <Text style={styles.addText}>+ Add member</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={members}
        keyExtractor={(m) => m.id.toString()}
        renderItem={({ item }) => {
          const me = identity ? item.member.isEqual(identity) : false;
          const creator = thread ? item.member.isEqual(thread.createdBy) : false;
          const isAgent = item.role === 'agent';
          return (
            <View style={styles.row}>
              <Avatar
                idKey={item.member.toHexString()}
                name={nameOf(item.member)}
                emoji={isAgent ? '🤖' : undefined}
                online={!isAgent && onlineOf(item.member)}
              />
              <View style={styles.rowMain}>
                <Text style={styles.name}>
                  {me ? 'You' : nameOf(item.member)}
                  {creator ? <Text style={styles.badge}>  · creator</Text> : null}
                  {isAgent ? <Text style={styles.badge}>  · agent</Text> : null}
                </Text>
                <Text style={styles.sub}>{item.role}</Text>
              </View>
              {isCreator && !me && !creator ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    void removeMember({ threadId, member: item.member });
                  }}
                >
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          );
        }}
      />

      <Pressable
        style={styles.leave}
        onPress={() => {
          void leaveThread({ threadId });
          onLeft();
        }}
      >
        <Text style={styles.leaveText}>Leave conversation</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: space.lg, borderBottomColor: colors.border, borderBottomWidth: 1 },
  back: { color: colors.accent, fontSize: 14, marginBottom: 4 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  meta: { color: colors.faint, fontSize: 12, marginTop: 2 },
  renameRow: { flexDirection: 'row', gap: space.sm, padding: space.md },
  input: {
    flex: 1,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    color: colors.text,
    height: 42,
  },
  saveBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: space.lg, justifyContent: 'center' },
  saveText: { color: colors.onAccent, fontWeight: '700' },
  actionsRow: { paddingHorizontal: space.md, paddingBottom: space.sm },
  addBtn: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  addText: { color: colors.accent, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 10 },
  rowMain: { flex: 1 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  badge: { color: colors.faint, fontSize: 12, fontWeight: '400' },
  sub: { color: colors.faint, fontSize: 12, marginTop: 1 },
  remove: { color: colors.danger, fontWeight: '600', fontSize: 13 },
  leave: { margin: space.lg, borderColor: colors.danger, borderWidth: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
  leaveText: { color: colors.danger, fontWeight: '700' },
});
