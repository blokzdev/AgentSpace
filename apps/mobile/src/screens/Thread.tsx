import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Identity } from 'spacetimedb';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../module_bindings';
import { Avatar } from '../components/Avatar';
import { colors, fmtTime, radius, shortId, space } from '../chat';

export function Thread({
  threadId,
  onBack,
  onMembers,
}: {
  threadId: bigint;
  onBack: () => void;
  onMembers: () => void;
}): React.JSX.Element {
  const { identity } = useSpacetimeDB();
  const [allMessages] = useTable(tables.my_thread_messages);
  const [allMembers] = useTable(tables.my_thread_members);
  const [users] = useTable(tables.user);
  const [threads] = useTable(tables.my_threads);
  const [agents] = useTable(tables.my_agents);
  const [allDeltas] = useTable(tables.my_reply_deltas);
  const sendMessage = useReducer(reducers.sendMessage);

  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  const members = useMemo(() => allMembers.filter((m) => m.threadId === threadId), [allMembers, threadId]);
  const agentMemberHexes = useMemo(
    () => new Set(members.filter((m) => m.role === 'agent').map((m) => m.member.toHexString())),
    [members],
  );

  const messages = useMemo(
    () =>
      allMessages
        .filter((m) => m.threadId === threadId)
        .sort((a, b) => (a.sent.microsSinceUnixEpoch < b.sent.microsSinceUnixEpoch ? -1 : 1)),
    [allMessages, threadId],
  );

  // M1.9: assemble each in-flight run's live text from its append-only delta rows
  // (ordered by `seq`, a u64/bigint). The message row carries the authoritative final
  // text once it flips to `complete`/`failed`, so we read deltas only while `streaming`
  // and fall back to `message.text` otherwise (deltas are GC'd on finish — OT-004).
  const deltaTextByRun = useMemo(() => {
    const map = new Map<string, string>();
    [...allDeltas]
      .sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0))
      .forEach((d) => map.set(d.runId, (map.get(d.runId) ?? '') + d.text));
    return map;
  }, [allDeltas]);

  const displayText = (m: { streamState: string; runId: string; text: string }): string =>
    m.streamState === 'streaming' ? (deltaTextByRun.get(m.runId) ?? m.text) : m.text;

  useEffect(() => {
    if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const thread = threads.find((t) => t.id === threadId);
  const headerTitle = useMemo(() => {
    if (!thread) return 'Conversation';
    if (thread.agentId !== 0n) return `🤖 ${agents.find((a) => a.id === thread.agentId)?.name ?? 'Agent'}`;
    if (thread.kind === 'dm') {
      const other = members.find((m) => !(identity && m.member.isEqual(identity)));
      return other
        ? (users.find((u) => u.identity.isEqual(other.member))?.displayName ?? shortId(other.member))
        : 'Direct message';
    }
    return thread.title ?? `Group #${thread.id.toString()}`;
  }, [thread, agents, members, users, identity]);

  const nameOf = (sender: Identity): string =>
    users.find((x) => x.identity.isEqual(sender))?.displayName ?? shortId(sender);

  const onSend = (): void => {
    if (text.trim().length === 0) return;
    void sendMessage({ threadId, text: text.trim() });
    setText('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Chats</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.title}>{headerTitle}</Text>
        <Pressable onPress={onMembers} hitSlop={8}>
          <Text style={styles.membersLink}>{members.length} members ›</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        style={styles.list}
        data={messages}
        keyExtractor={(m) => m.id.toString()}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet. Say hello.</Text>}
        renderItem={({ item }) => {
          const mine = identity ? item.sender.isEqual(identity) : false;
          const isAgent = agentMemberHexes.has(item.sender.toHexString());
          if (mine) {
            return (
              <View style={[styles.bubble, styles.mine]}>
                <Text style={styles.body}>
                  {displayText(item)}
                  {item.streamState === 'streaming' ? <Text style={styles.cursor}>▍</Text> : null}
                </Text>
                <Text style={styles.time}>{fmtTime(item.sent)}</Text>
              </View>
            );
          }
          return (
            <View style={styles.theirRow}>
              <Avatar idKey={item.sender.toHexString()} name={nameOf(item.sender)} emoji={isAgent ? '🤖' : undefined} size={28} />
              <View style={[styles.bubble, styles.theirs]}>
                <Text style={styles.sender}>{nameOf(item.sender)}</Text>
                <Text style={styles.body}>
                  {displayText(item)}
                  {item.streamState === 'streaming' ? <Text style={styles.cursor}>▍</Text> : null}
                </Text>
                <Text style={styles.time}>{fmtTime(item.sent)}</Text>
              </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    padding: space.lg,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  back: { color: colors.accent, fontSize: 14 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  membersLink: { color: colors.dim, fontSize: 12 },
  list: { flex: 1, paddingHorizontal: space.md },
  empty: { color: colors.faint, textAlign: 'center', marginTop: space.xl },
  theirRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginVertical: space.xs },
  bubble: { maxWidth: '82%', borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.mine, marginVertical: space.xs },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.panel },
  sender: { color: colors.accent, fontSize: 12, fontWeight: '600', marginBottom: 2 },
  body: { color: colors.text, fontSize: 15 },
  cursor: { color: colors.accent },
  time: { color: colors.faint, fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', gap: space.sm, padding: space.md, borderTopColor: colors.border, borderTopWidth: 1 },
  input: {
    flex: 1,
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    color: colors.text,
    height: 44,
  },
  send: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: space.lg, justifyContent: 'center' },
  sendText: { color: colors.onAccent, fontWeight: '700' },
});
