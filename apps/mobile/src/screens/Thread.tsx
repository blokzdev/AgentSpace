import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Identity } from 'spacetimedb';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../module_bindings';
import { colors, fmtTime, shortId } from '../chat';

export function Thread({
  threadId,
  onBack,
}: {
  threadId: bigint;
  onBack: () => void;
}): React.JSX.Element {
  const { identity } = useSpacetimeDB();
  const [allMessages] = useTable(tables.my_thread_messages);
  const [allMembers] = useTable(tables.my_thread_members);
  const [users] = useTable(tables.user);
  const sendMessage = useReducer(reducers.sendMessage);
  const addMember = useReducer(reducers.addMember);

  const [text, setText] = useState('');
  const [member, setMember] = useState('');
  const [addRole, setAddRole] = useState<'human' | 'agent'>('human');

  const messages = useMemo(
    () =>
      allMessages
        .filter((m) => m.threadId === threadId)
        .sort((a, b) => (a.sent.microsSinceUnixEpoch < b.sent.microsSinceUnixEpoch ? -1 : 1)),
    [allMessages, threadId],
  );
  const memberCount = allMembers.filter((m) => m.threadId === threadId).length;

  const nameOf = (sender: Identity): string => {
    const u = users.find((x) => x.identity.isEqual(sender));
    return u?.displayName ?? shortId(sender);
  };

  const onSend = (): void => {
    if (text.trim().length === 0) return;
    void sendMessage({ threadId, text: text.trim() });
    setText('');
  };

  const onAdd = (): void => {
    const hex = member.trim();
    if (hex.length === 0) return;
    try {
      void addMember({ threadId, member: Identity.fromString(hex), role: addRole });
      setMember('');
    } catch {
      // invalid identity hex — ignored (validated on the device)
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Threads</Text>
        </Pressable>
        <Text style={styles.title}>Thread #{threadId.toString()}</Text>
        <Text style={styles.meta}>{memberCount} members</Text>
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="Add member by identity hex"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          value={member}
          onChangeText={setMember}
        />
        <Pressable
          style={styles.roleBtn}
          onPress={() => {
            setAddRole((r) => (r === 'human' ? 'agent' : 'human'));
          }}
        >
          <Text style={styles.roleBtnText}>{addRole === 'agent' ? '🤖 Agent' : '🧑 Human'}</Text>
        </Pressable>
        <Pressable style={styles.addBtn} onPress={onAdd}>
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </View>

      <FlatList
        style={styles.list}
        data={messages}
        keyExtractor={(m) => m.id.toString()}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet. Say hello.</Text>}
        renderItem={({ item }) => {
          const mine = identity ? item.sender.isEqual(identity) : false;
          return (
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              {!mine ? <Text style={styles.sender}>{nameOf(item.sender)}</Text> : null}
              <Text style={styles.body}>
                {item.text}
                {item.streamState === 'streaming' ? <Text style={styles.cursor}>▍</Text> : null}
              </Text>
              <Text style={styles.time}>{fmtTime(item.sent)}</Text>
            </View>
          );
        }}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Message"
            placeholderTextColor={colors.faint}
            value={text}
            onChangeText={setText}
            onSubmitEditing={onSend}
          />
          <Pressable style={styles.send} onPress={onSend}>
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: 16, borderBottomColor: colors.border, borderBottomWidth: 1 },
  back: { color: colors.accent, fontSize: 14, marginBottom: 4 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  meta: { color: colors.faint, fontSize: 12, marginTop: 2 },
  addRow: { flexDirection: 'row', gap: 8, padding: 12 },
  addInput: {
    flex: 1,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: colors.text,
    height: 38,
    fontSize: 12,
  },
  addBtn: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  addBtnText: { color: colors.dim, fontWeight: '600' },
  roleBtn: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, justifyContent: 'center' },
  roleBtnText: { color: colors.dim, fontWeight: '600', fontSize: 12 },
  list: { flex: 1, paddingHorizontal: 12 },
  empty: { color: colors.faint, textAlign: 'center', marginTop: 24 },
  bubble: { maxWidth: '82%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginVertical: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.mine },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.panel },
  sender: { color: colors.accent, fontSize: 12, fontWeight: '600', marginBottom: 2 },
  body: { color: colors.text, fontSize: 15 },
  cursor: { color: colors.accent },
  time: { color: colors.faint, fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', gap: 8, padding: 12, borderTopColor: colors.border, borderTopWidth: 1 },
  input: {
    flex: 1,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    color: colors.text,
    height: 44,
  },
  send: { backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 18, justifyContent: 'center' },
  sendText: { color: '#06101d', fontWeight: '700' },
});
