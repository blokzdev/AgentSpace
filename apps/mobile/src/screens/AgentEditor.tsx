import { useMemo, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useReducer, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../module_bindings';
import { colors } from '../chat';

// Mirrors MODEL_PROVIDERS in @agentspace/shared (the gateway rejects others).
const PROVIDERS = ['anthropic', 'openai', 'google', 'openai-compatible'] as const;
const DEFAULT_MODEL_ID = 'claude-opus-4-8';

export function AgentEditor({
  agentId,
  onBack,
}: {
  agentId: bigint | null;
  onBack: () => void;
}): React.JSX.Element {
  const [agents] = useTable(tables.my_agents);
  const createAgent = useReducer(reducers.createAgent);
  const updateAgent = useReducer(reducers.updateAgent);

  const existing = useMemo(
    () => (agentId === null ? undefined : agents.find((a) => a.id === agentId)),
    [agents, agentId],
  );

  const [name, setName] = useState(existing?.name ?? '');
  const [systemPrompt, setSystemPrompt] = useState(existing?.systemPrompt ?? '');
  const [provider, setProvider] = useState<string>(existing?.provider ?? 'anthropic');
  const [model, setModel] = useState(existing?.model ?? DEFAULT_MODEL_ID);

  const canSave = name.trim().length > 0 && model.trim().length > 0;

  const onSave = (): void => {
    if (!canSave) return;
    const fields = { name: name.trim(), systemPrompt: systemPrompt.trim(), provider, model: model.trim() };
    if (agentId === null) {
      void createAgent(fields);
    } else {
      void updateAgent({ agentId, ...fields });
    }
    onBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Agents</Text>
        </Pressable>
        <Text style={styles.title}>{agentId === null ? 'New agent' : 'Edit agent'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Research Assistant"
          placeholderTextColor={colors.faint}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>System prompt</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Describe the agent's personality and behavior…"
          placeholderTextColor={colors.faint}
          value={systemPrompt}
          onChangeText={setSystemPrompt}
          multiline
        />

        <Text style={styles.label}>Provider</Text>
        <View style={styles.chips}>
          {PROVIDERS.map((p) => (
            <Pressable
              key={p}
              style={[styles.chip, provider === p && styles.chipOn]}
              onPress={() => {
                setProvider(p);
              }}
            >
              <Text style={[styles.chipText, provider === p && styles.chipTextOn]}>{p}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Model</Text>
        <TextInput
          style={styles.input}
          placeholder="claude-opus-4-8"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          value={model}
          onChangeText={setModel}
        />

        <Pressable style={[styles.save, !canSave && styles.saveOff]} disabled={!canSave} onPress={onSave}>
          <Text style={styles.saveText}>{agentId === null ? 'Create agent' : 'Save changes'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: 16, borderBottomColor: colors.border, borderBottomWidth: 1 },
  back: { color: colors.accent, fontSize: 14, marginBottom: 4 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  form: { padding: 16, gap: 8 },
  label: { color: colors.dim, fontSize: 13, marginTop: 10, textTransform: 'uppercase' },
  input: {
    backgroundColor: colors.panel,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
  },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.dim, fontSize: 13 },
  chipTextOn: { color: '#06101d', fontWeight: '700' },
  save: { backgroundColor: colors.accent, borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saveOff: { opacity: 0.5 },
  saveText: { color: '#06101d', fontWeight: '700', fontSize: 16 },
});
