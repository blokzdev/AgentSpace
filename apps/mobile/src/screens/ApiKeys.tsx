import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useReducer, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../../module_bindings';
import { sealForOrchestrator } from '../byok';
import { colors, radius, space } from '../chat';

// Gateway-supported providers (mirrors the live registry in packages/gateway).
const PROVIDERS: { id: string; label: string; hint: string }[] = [
  { id: 'anthropic', label: 'Anthropic', hint: 'sk-ant-…' },
  { id: 'openai', label: 'OpenAI', hint: 'sk-…' },
];

export function ApiKeys({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [serviceInfo] = useTable(tables.service_info);
  const [myKeys] = useTable(tables.my_provider_keys);
  const setProviderKey = useReducer(reducers.setProviderKey);
  const deleteProviderKey = useReducer(reducers.deleteProviderKey);

  const pubKey = serviceInfo[0]?.encPubKey ?? '';
  const ready = pubKey.length > 0;

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const hasKey = (provider: string): boolean => myKeys.some((k) => k.provider === provider);

  const onSave = (provider: string): void => {
    const raw = (drafts[provider] ?? '').trim();
    if (raw.length === 0 || !ready) return;
    try {
      void setProviderKey({ provider, sealed: sealForOrchestrator(raw, pubKey) });
      setDrafts((d) => ({ ...d, [provider]: '' }));
    } catch {
      // sealing failed (bad pubkey) — ignored; the orchestrator may not be ready
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>API keys (BYOK)</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.blurb}>
          Your keys are encrypted on this device and stored as ciphertext — the raw key never
          touches the database. Your agents use your key.
        </Text>
        {!ready ? (
          <Text style={styles.warn}>⚠️ The agent service isn’t running yet — keys can’t be saved until it is.</Text>
        ) : null}

        {PROVIDERS.map((p) => (
          <View key={p.id} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.provider}>{p.label}</Text>
              {hasKey(p.id) ? <Text style={styles.set}>✓ key set</Text> : <Text style={styles.unset}>no key</Text>}
            </View>
            <View style={styles.row}>
              <TextInput
                style={styles.input}
                placeholder={p.hint}
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                secureTextEntry
                value={drafts[p.id] ?? ''}
                onChangeText={(t) => setDrafts((d) => ({ ...d, [p.id]: t }))}
              />
              <Pressable
                style={[styles.saveBtn, !ready && styles.btnOff]}
                disabled={!ready}
                onPress={() => onSave(p.id)}
              >
                <Text style={styles.saveText}>Save</Text>
              </Pressable>
            </View>
            {hasKey(p.id) ? (
              <Pressable onPress={() => void deleteProviderKey({ provider: p.id })} hitSlop={8}>
                <Text style={styles.remove}>Remove key</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: space.lg, borderBottomColor: colors.border, borderBottomWidth: 1 },
  back: { color: colors.accent, fontSize: 14, marginBottom: 4 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  body: { padding: space.lg, gap: space.md },
  blurb: { color: colors.dim, fontSize: 13, lineHeight: 18 },
  warn: { color: colors.danger, fontSize: 13 },
  card: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  provider: { color: colors.text, fontSize: 16, fontWeight: '600' },
  set: { color: colors.online, fontSize: 12, fontWeight: '600' },
  unset: { color: colors.faint, fontSize: 12 },
  row: { flexDirection: 'row', gap: space.sm },
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
  saveBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: space.lg, justifyContent: 'center' },
  btnOff: { opacity: 0.5 },
  saveText: { color: colors.onAccent, fontWeight: '700' },
  remove: { color: colors.danger, fontSize: 13, fontWeight: '600' },
});
