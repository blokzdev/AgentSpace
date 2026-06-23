import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Identity } from 'spacetimedb';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../module_bindings';
import { thinkingLabel } from '@agentspace/shared';
import { Avatar } from '../components/Avatar';
import { TypingDots } from '../components/TypingDots';
import { colors, radius, relativeTime, shortId, space } from '../chat';

export function ThreadList({
  onOpen,
  onNewChat,
  onNewGroup,
  onAgents,
  onApiKeys,
  onSignOut,
}: {
  onOpen: (id: bigint) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  onAgents: () => void;
  onApiKeys: () => void;
  onSignOut: () => void;
}): React.JSX.Element {
  const { identity } = useSpacetimeDB();
  const [threads] = useTable(tables.my_threads);
  const [users] = useTable(tables.user);
  const [agents] = useTable(tables.my_agents);
  const [members] = useTable(tables.my_thread_members);
  const [threadAgents] = useTable(tables.my_thread_agents);
  const [cards] = useTable(tables.thread_agent_cards);
  const [messages] = useTable(tables.my_thread_messages);
  const setDisplayName = useReducer(reducers.setDisplayName);

  const [name, setName] = useState('');

  const me = identity ? users.find((u) => u.identity.isEqual(identity)) : undefined;
  const needsName = !!identity && (me?.displayName ?? '').length === 0;
  const myName = me?.displayName ?? (identity ? shortId(identity) : '—');

  const nameOf = (id: Identity): string =>
    users.find((u) => u.identity.isEqual(id))?.displayName ?? shortId(id);

  // M2.4: the public agent face — name + avatar visible to all members (fixes BL-021).
  const cardByAgentId = useMemo(
    () => new Map(cards.map((c) => [c.agentId, { name: c.name, emoji: c.avatarEmoji }])),
    [cards],
  );

  // Per-thread view-model: title, subtitle (last message), time, avatar.
  const rows = useMemo(() => {
    return threads
      .map((t) => {
        const tMessages = messages.filter((m) => m.threadId === t.id);
        const last = tMessages.reduce<(typeof tMessages)[number] | undefined>(
          (acc, m) => (!acc || m.sent.microsSinceUnixEpoch > acc.sent.microsSinceUnixEpoch ? m : acc),
          undefined,
        );
        const activity = last?.sent.microsSinceUnixEpoch ?? t.createdAt.microsSinceUnixEpoch;

        let title: string;
        let avatar: { idKey: string; name?: string; emoji?: string; online?: boolean };
        if (t.agentId !== 0n) {
          const card = cardByAgentId.get(t.agentId);
          title = card?.name ?? agents.find((x) => x.id === t.agentId)?.name ?? 'Agent';
          avatar = { idKey: `agent-${t.agentId.toString()}`, emoji: card?.emoji ?? '🤖' };
        } else if (t.kind === 'dm') {
          const other = members.find((m) => m.threadId === t.id && !(identity && m.member.isEqual(identity)));
          if (other) {
            const u = users.find((x) => x.identity.isEqual(other.member));
            title = nameOf(other.member);
            avatar = { idKey: other.member.toHexString(), name: u?.displayName, online: u?.online };
          } else {
            title = 'Direct message';
            avatar = { idKey: `dm-${t.id.toString()}` };
          }
        } else {
          const base = t.title ?? `Group #${t.id.toString()}`;
          const agentCount = threadAgents.filter((ta) => ta.threadId === t.id).length;
          title = agentCount > 0 ? `${base}  ·  🤖 ${agentCount}` : base;
          avatar = { idKey: `group-${t.id.toString()}`, name: base, emoji: agentCount > 0 ? '🤖' : undefined };
        }

        const subtitle = last ? (last.text.length > 0 ? last.text : '…') : 'No messages yet';
        // M2.2: agents mid-reply in this thread → an animated presence preview that
        // replaces the last-message subtitle. Derived from `streaming` rows; self-clears
        // on complete/failed (incl. the reaper). Cross-owner agents → "Agent" (BL-021).
        const seen = new Set<string>();
        const thinkingNames: string[] = [];
        for (const m of tMessages) {
          if (m.streamState !== 'streaming' || m.agentId === 0n) continue;
          const key = m.agentId.toString();
          if (seen.has(key)) continue;
          seen.add(key);
          thinkingNames.push(cardByAgentId.get(m.agentId)?.name ?? agents.find((a) => a.id === m.agentId)?.name ?? 'Agent');
        }
        const thinking = thinkingLabel(thinkingNames);
        return { id: t.id, title, subtitle, thinking, activity, avatar, when: last ? relativeTime(last.sent) : '' };
      })
      .sort((a, b) => (a.activity < b.activity ? 1 : -1));
  }, [threads, messages, members, agents, threadAgents, cardByAgentId, users, identity]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AgentSpace</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={onAgents} hitSlop={8}>
            <Text style={styles.link}>🤖 Agents</Text>
          </Pressable>
          <Pressable onPress={onApiKeys} hitSlop={8}>
            <Text style={styles.link}>🔑 Keys</Text>
          </Pressable>
          <Pressable onPress={onSignOut} hitSlop={8}>
            <Text style={styles.link}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      {needsName ? (
        <View style={styles.nudge}>
          <Text style={styles.nudgeText}>Set your name so others can find you</Text>
          <View style={styles.nudgeRow}>
            <TextInput
              style={styles.input}
              placeholder="Your display name"
              placeholderTextColor={colors.faint}
              value={name}
              onChangeText={setName}
            />
            <Pressable
              style={styles.primaryBtn}
              onPress={() => {
                if (name.trim().length === 0) return;
                void setDisplayName({ name: name.trim() });
                setName('');
              }}
            >
              <Text style={styles.primaryText}>Save</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={styles.you}>You: {myName}</Text>
      )}

      <View style={styles.actions}>
        <Pressable style={styles.newChatBtn} onPress={onNewChat}>
          <Text style={styles.newChatText}>＋ New chat</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={onNewGroup}>
          <Text style={styles.secondaryText}>New group</Text>
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id.toString()}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No conversations yet — start one with “New chat”.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.thread} onPress={() => onOpen(item.id)}>
            <Avatar idKey={item.avatar.idKey} name={item.avatar.name} emoji={item.avatar.emoji} online={item.avatar.online} thinking={!!item.thinking} />
            <View style={styles.threadMain}>
              <Text numberOfLines={1} style={styles.threadTitle}>{item.title}</Text>
              {item.thinking ? (
                <View style={styles.thinkingRow}>
                  <Text numberOfLines={1} style={styles.threadThinking}>{item.thinking}</Text>
                  <TypingDots size={4} />
                </View>
              ) : (
                <Text numberOfLines={1} style={styles.threadSub}>{item.subtitle}</Text>
              )}
            </View>
            {item.when.length > 0 ? <Text style={styles.when}>{item.when}</Text> : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  link: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  you: { color: colors.dim, paddingHorizontal: space.lg, paddingBottom: space.sm, fontSize: 12 },
  nudge: { margin: space.md, padding: space.md, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, gap: space.sm },
  nudgeText: { color: colors.text, fontWeight: '600' },
  nudgeRow: { flexDirection: 'row', gap: space.sm },
  input: {
    flex: 1,
    backgroundColor: colors.panel2,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    color: colors.text,
    height: 42,
  },
  primaryBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: space.lg, justifyContent: 'center' },
  primaryText: { color: colors.onAccent, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  newChatBtn: { flex: 2, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: space.md, alignItems: 'center' },
  newChatText: { color: colors.onAccent, fontWeight: '700', fontSize: 15 },
  secondaryBtn: { flex: 1, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingVertical: space.md, alignItems: 'center' },
  secondaryText: { color: colors.accent, fontWeight: '600' },
  list: { paddingHorizontal: space.md, paddingBottom: space.lg },
  empty: { color: colors.faint, textAlign: 'center', marginTop: space.xl },
  thread: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: space.sm },
  threadMain: { flex: 1 },
  threadTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  threadSub: { color: colors.dim, fontSize: 13, marginTop: 1 },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  threadThinking: { color: colors.accent, fontSize: 13, fontStyle: 'italic', flexShrink: 1 },
  when: { color: colors.faint, fontSize: 11 },
});
