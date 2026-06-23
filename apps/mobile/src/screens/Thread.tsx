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
import { thinkingLabel } from '@agentspace/shared';
import { Avatar } from '../components/Avatar';
import { TypingDots } from '../components/TypingDots';
import { colors, fmtTime, radius, shortId, space } from '../chat';

interface MentionInput {
  kind: string;
  ref: bigint;
  start: number;
  len: number;
}

/** Derive structured mentions from the final composed text (robust to mid-edit cursor
 *  drift — offsets are recomputed at send). MVP addresses agents + @everyone only. */
function computeMentions(text: string, threadAgents: { agentId: bigint; name: string }[]): MentionInput[] {
  const out: MentionInput[] = [];
  const lower = text.toLowerCase();
  const ev = lower.indexOf('@everyone');
  if (ev >= 0) out.push({ kind: 'all', ref: 0n, start: ev, len: '@everyone'.length });
  for (const a of threadAgents) {
    if (a.name.length === 0) continue;
    const tok = `@${a.name}`.toLowerCase();
    const i = lower.indexOf(tok);
    if (i < 0) continue;
    const after = text[i + tok.length];
    if (after === undefined || !/\w/.test(after)) {
      out.push({ kind: 'agent', ref: a.agentId, start: i, len: tok.length });
    }
  }
  return out;
}

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
  const [allThreadAgents] = useTable(tables.my_thread_agents);
  const sendMessage = useReducer(reducers.sendMessage);

  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  const members = useMemo(() => allMembers.filter((m) => m.threadId === threadId), [allMembers, threadId]);

  // Agents active in this thread. Names resolve via the user's own agents; an agent
  // owned by another member falls back to a generic label (@everyone still reaches it).
  const agentNameById = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);
  const threadAgents = useMemo(
    () =>
      allThreadAgents
        .filter((ta) => ta.threadId === threadId)
        .map((ta) => ({ agentId: ta.agentId, name: agentNameById.get(ta.agentId) ?? '' })),
    [allThreadAgents, threadId, agentNameById],
  );

  const messages = useMemo(
    () =>
      allMessages
        .filter((m) => m.threadId === threadId)
        .sort((a, b) => (a.sent.microsSinceUnixEpoch < b.sent.microsSinceUnixEpoch ? -1 : 1)),
    [allMessages, threadId],
  );

  // M1.9 + M2.1: assemble each in-flight run's live text from its append-only delta
  // rows. Group by runId FIRST, then sort each run's deltas by `seq` — robust when two
  // agents stream into one thread concurrently (no cross-run interleave; guard #10).
  const deltaTextByRun = useMemo(() => {
    const byRun = new Map<string, { seq: bigint; text: string }[]>();
    for (const d of allDeltas) {
      const list = byRun.get(d.runId) ?? [];
      list.push({ seq: d.seq, text: d.text });
      byRun.set(d.runId, list);
    }
    const out = new Map<string, string>();
    for (const [runId, list] of byRun) {
      list.sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0));
      out.set(runId, list.map((x) => x.text).join(''));
    }
    return out;
  }, [allDeltas]);

  const displayText = (m: { streamState: string; runId: string; text: string }): string =>
    m.streamState === 'streaming' ? (deltaTextByRun.get(m.runId) ?? m.text) : m.text;

  // M2.2: which agents are mid-reply in THIS thread (deduped by agentId) → a presence
  // label for the header. Derived purely from `streaming` rows; clears on complete/failed
  // (incl. the reaper). Cross-owner agents fall back to "Agent" (BL-021).
  const streamingAgentNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const m of messages) {
      if (m.streamState !== 'streaming' || m.agentId === 0n) continue;
      const key = m.agentId.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(agentNameById.get(m.agentId) ?? 'Agent');
    }
    return names;
  }, [messages, agentNameById]);
  const thinkingHeader = thinkingLabel(streamingAgentNames);

  useEffect(() => {
    if (messages.length > 0) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const thread = threads.find((t) => t.id === threadId);
  const headerTitle = useMemo(() => {
    if (!thread) return 'Conversation';
    if (thread.agentId !== 0n) return `🤖 ${agentNameById.get(thread.agentId) ?? 'Agent'}`;
    if (thread.kind === 'dm') {
      const other = members.find((m) => !(identity && m.member.isEqual(identity)));
      return other
        ? (users.find((u) => u.identity.isEqual(other.member))?.displayName ?? shortId(other.member))
        : 'Direct message';
    }
    return thread.title ?? `Group #${thread.id.toString()}`;
  }, [thread, agentNameById, members, users, identity]);

  const nameOf = (sender: Identity): string =>
    users.find((x) => x.identity.isEqual(sender))?.displayName ?? shortId(sender);

  // @mention typeahead: when the trailing word is "@partial", suggest matching thread
  // agents + a synthetic @everyone. Picking one inserts an "@Name " token.
  const atMatch = /(^|\s)@(\w*)$/.exec(text);
  const mentionQuery = atMatch ? atMatch[2].toLowerCase() : null;
  const suggestions =
    mentionQuery !== null
      ? [
          { label: 'everyone', emoji: '📣' },
          ...threadAgents.filter((a) => a.name.length > 0).map((a) => ({ label: a.name, emoji: '🤖' })),
        ]
          .filter((s) => s.label.toLowerCase().startsWith(mentionQuery))
          .slice(0, 5)
      : [];
  const pickMention = (insert: string): void =>
    setText((t) => t.replace(/(^|\s)@(\w*)$/, (_m, lead: string) => `${lead}@${insert} `));

  const onSend = (): void => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    void sendMessage({ threadId, text: trimmed, mentions: computeMentions(trimmed, threadAgents) });
    setText('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Chats</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text numberOfLines={1} style={styles.title}>{headerTitle}</Text>
          {thinkingHeader ? (
            <View style={styles.headerThinking}>
              <Text numberOfLines={1} style={styles.headerThinkingText}>{thinkingHeader}</Text>
              <TypingDots size={4} />
            </View>
          ) : null}
        </View>
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
          const isAgentMsg = item.agentId !== 0n;
          const mine = !isAgentMsg && identity ? item.sender.isEqual(identity) : false;
          const streaming = item.streamState === 'streaming';
          const body = displayText(item);
          if (mine) {
            return (
              <View style={[styles.bubble, styles.mine]}>
                <Text style={styles.body}>{body}</Text>
                <Text style={styles.time}>{fmtTime(item.sent)}</Text>
              </View>
            );
          }
          // M2.1: name/avatar from the agentId TAG (not the shared orchestrator identity)
          // so each persona renders distinctly — no UI persona-bleed.
          const label = isAgentMsg ? (agentNameById.get(item.agentId) ?? 'Agent') : nameOf(item.sender);
          const avatarKey = isAgentMsg ? `agent-${item.agentId.toString()}` : item.sender.toHexString();
          return (
            <View style={styles.theirRow}>
              <Avatar idKey={avatarKey} name={label} emoji={isAgentMsg ? '🤖' : undefined} size={28} />
              <View style={[styles.bubble, styles.theirs]}>
                <Text style={styles.sender}>{label}</Text>
                {streaming && body.length === 0 ? (
                  <View style={styles.thinkingRow}>
                    <Text style={[styles.body, styles.thinking]}>{label} is thinking</Text>
                    <TypingDots size={4} />
                  </View>
                ) : (
                  <Text style={styles.body}>
                    {body}
                    {streaming ? <Text style={styles.cursor}>▍</Text> : null}
                  </Text>
                )}
                <Text style={styles.time}>{fmtTime(item.sent)}</Text>
              </View>
            </View>
          );
        }}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {suggestions.length > 0 ? (
          <View style={styles.suggestions}>
            {suggestions.map((s) => (
              <Pressable key={s.label} style={styles.suggestion} onPress={() => pickMention(s.label)}>
                <Text style={styles.suggestionText}>
                  {s.emoji} {s.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Message — @mention an agent"
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
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center', alignSelf: 'stretch' },
  headerThinking: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  headerThinkingText: { color: colors.accent, fontSize: 11 },
  membersLink: { color: colors.dim, fontSize: 12 },
  list: { flex: 1, paddingHorizontal: space.md },
  empty: { color: colors.faint, textAlign: 'center', marginTop: space.xl },
  theirRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginVertical: space.xs },
  bubble: { maxWidth: '82%', borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.mine, marginVertical: space.xs },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.panel },
  sender: { color: colors.accent, fontSize: 12, fontWeight: '600', marginBottom: 2 },
  body: { color: colors.text, fontSize: 15 },
  thinking: { color: colors.dim, fontStyle: 'italic' },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cursor: { color: colors.accent },
  time: { color: colors.faint, fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  suggestion: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  suggestionText: { color: colors.text, fontSize: 13 },
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
