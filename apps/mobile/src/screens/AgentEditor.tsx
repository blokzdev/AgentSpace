import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducer, useTable } from 'spacetimedb/react';
import { DEFAULT_MODEL, PROVIDER_CATALOG, providerInfo } from '@agentspace/shared';
import { reducers, tables } from '../../module_bindings';
import { colors } from '../chat';

export function AgentEditor({
  agentId,
  onBack,
  onApiKeys,
}: {
  agentId: bigint | null;
  onBack: () => void;
  onApiKeys: () => void;
}): React.JSX.Element {
  const [agents] = useTable(tables.my_agents);
  const [myKeys] = useTable(tables.my_provider_keys);
  const createAgent = useReducer(reducers.createAgent);
  const updateAgent = useReducer(reducers.updateAgent);

  const existing = useMemo(
    () => (agentId === null ? undefined : agents.find((a) => a.id === agentId)),
    [agents, agentId],
  );

  const [name, setName] = useState(existing?.name ?? '');
  const [systemPrompt, setSystemPrompt] = useState(existing?.systemPrompt ?? '');
  const [provider, setProvider] = useState<string>(existing?.provider ?? DEFAULT_MODEL.provider);
  const [model, setModel] = useState(existing?.model ?? DEFAULT_MODEL.model);
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? '');
  const [respondsToAgents, setRespondsToAgents] = useState(existing?.respondsToAgents ?? false);

  const info = providerInfo(provider);
  const isLocal = info?.kind === 'baseUrl';
  const hasKey = myKeys.some((k) => k.provider === provider);
  const canSave =
    name.trim().length > 0 && model.trim().length > 0 && (!isLocal || baseUrl.trim().length > 0);

  // Switching provider swaps in that provider's default model + base URL (a no-op tap keeps yours).
  const selectProvider = (id: string): void => {
    if (id === provider) return;
    setProvider(id);
    setModel(providerInfo(id)?.defaultModel ?? '');
    setBaseUrl(providerInfo(id)?.defaultBaseUrl ?? '');
  };

  const onSave = (): void => {
    if (!canSave) return;
    const fields = {
      name: name.trim(),
      systemPrompt: systemPrompt.trim(),
      provider,
      model: model.trim(),
      baseUrl: isLocal ? baseUrl.trim() : '',
      respondsToAgents,
    };
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
          {PROVIDER_CATALOG.map((p) => (
            <Pressable
              key={p.id}
              style={[styles.chip, provider === p.id && styles.chipOn]}
              onPress={() => selectProvider(p.id)}
            >
              <Text style={[styles.chipText, provider === p.id && styles.chipTextOn]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        {isLocal ? (
          <>
            <Text style={styles.label}>Base URL</Text>
            <TextInput
              style={styles.input}
              placeholder={info?.defaultBaseUrl ?? 'http://localhost:11434/v1'}
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              value={baseUrl}
              onChangeText={setBaseUrl}
            />
            <Text style={styles.hint}>Runs on your machine (Ollama / vLLM / LM Studio). A key is usually not needed.</Text>
          </>
        ) : !hasKey ? (
          <Pressable onPress={onApiKeys} hitSlop={8}>
            <Text style={styles.warn}>
              ⚠️ No key for {info?.label ?? provider} — tap to add one in 🔑 Keys
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.ok}>✓ Key set for {info?.label ?? provider}</Text>
        )}

        <Text style={styles.label}>Model</Text>
        <TextInput
          style={styles.input}
          placeholder={info?.defaultModel ?? 'model id'}
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          value={model}
          onChangeText={setModel}
        />
        {info && info.suggestedModels.length > 0 ? (
          <View style={styles.chips}>
            {info.suggestedModels.map((m) => (
              <Pressable
                key={m}
                style={[styles.modelChip, model === m && styles.chipOn]}
                onPress={() => setModel(m)}
              >
                <Text style={[styles.modelChipText, model === m && styles.chipTextOn]}>{m}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={styles.label}>Agent-to-agent (M2)</Text>
        <Pressable style={styles.toggleRow} onPress={() => setRespondsToAgents((v) => !v)}>
          <Text style={styles.toggleText}>Reply when another agent @mentions this one</Text>
          <View style={[styles.toggle, respondsToAgents && styles.toggleOn]}>
            <Text style={[styles.toggleLabel, respondsToAgents && styles.chipTextOn]}>{respondsToAgents ? 'ON' : 'OFF'}</Text>
          </View>
        </Pressable>
        <Text style={styles.hint}>
          Off by default. When on, this agent can be drawn into agent↔agent exchanges — always bounded by the
          per-conversation turn + token budget.
        </Text>

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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.dim, fontSize: 13 },
  chipTextOn: { color: colors.onAccent, fontWeight: '700' },
  modelChip: { backgroundColor: colors.panel2, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  modelChipText: { color: colors.dim, fontSize: 12 },
  warn: { color: colors.danger, fontSize: 13, marginTop: 8 },
  ok: { color: colors.online, fontSize: 13, marginTop: 8 },
  hint: { color: colors.faint, fontSize: 12, marginTop: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 },
  toggleText: { color: colors.text, fontSize: 14, flex: 1 },
  toggle: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, minWidth: 56, alignItems: 'center' },
  toggleOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  toggleLabel: { color: colors.dim, fontSize: 12, fontWeight: '700' },
  save: { backgroundColor: colors.accent, borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saveOff: { opacity: 0.5 },
  saveText: { color: colors.onAccent, fontWeight: '700', fontSize: 16 },
});
