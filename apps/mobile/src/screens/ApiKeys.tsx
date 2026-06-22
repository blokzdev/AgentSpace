import { useMemo, useState } from 'react';
import { Linking, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useReducer, useTable } from 'spacetimedb/react';
import { PROVIDER_CATALOG } from '@agentspace/shared';
import { reducers, tables } from '../../module_bindings';
import { sealForOrchestrator } from '../byok';
import { colors, radius, space } from '../chat';

// Single-API-key providers (one secret) vs multi-credential providers (a form of
// fields sealed as JSON). Local (openai-compatible) keys are optional → entered with
// the Base URL in the agent editor, not here.
const KEY_PROVIDERS = PROVIDER_CATALOG.filter((p) => p.kind === 'apiKey');
const MULTI_PROVIDERS = PROVIDER_CATALOG.filter((p) => p.kind === 'multi');

export function ApiKeys({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [serviceInfo] = useTable(tables.service_info);
  const [myKeys] = useTable(tables.my_provider_keys);
  const setProviderKey = useReducer(reducers.setProviderKey);
  const deleteProviderKey = useReducer(reducers.deleteProviderKey);

  const pubKey = serviceInfo[0]?.encPubKey ?? '';
  const ready = pubKey.length > 0;

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [mdrafts, setMdrafts] = useState<Record<string, Record<string, string>>>({});

  const hasKey = (provider: string): boolean => myKeys.some((k) => k.provider === provider);

  const ordered = useMemo(
    () => [...KEY_PROVIDERS].sort((a, b) => Number(hasKey(b.id)) - Number(hasKey(a.id))),
    [myKeys],
  );

  const seal = (provider: string, raw: string): void => {
    if (!ready) return;
    try {
      void setProviderKey({ provider, sealed: sealForOrchestrator(raw, pubKey) });
    } catch {
      // sealing failed (bad pubkey) — ignored; the orchestrator may not be ready
    }
  };

  const onSaveKey = (provider: string): void => {
    const raw = (drafts[provider] ?? '').trim();
    if (raw.length === 0) return;
    seal(provider, raw);
    setDrafts((d) => ({ ...d, [provider]: '' }));
  };

  const onSaveMulti = (provider: string, fieldIds: string[]): void => {
    const vals = mdrafts[provider] ?? {};
    const obj: Record<string, string> = {};
    for (const f of fieldIds) {
      const v = (vals[f] ?? '').trim();
      if (v.length === 0) return; // all fields required
      obj[f] = v;
    }
    seal(provider, JSON.stringify(obj));
    setMdrafts((d) => ({ ...d, [provider]: {} }));
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
          touches the database. Each agent uses your key for its provider.
        </Text>
        {!ready ? (
          <Text style={styles.warn}>⚠️ The agent service isn’t running yet — keys can’t be saved until it is.</Text>
        ) : null}

        {ordered.map((p) => (
          <View key={p.id} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.provider}>{p.label}</Text>
              {hasKey(p.id) ? <Text style={styles.set}>✓ key set</Text> : <Text style={styles.unset}>no key</Text>}
            </View>
            <View style={styles.row}>
              <TextInput
                style={styles.input}
                placeholder={p.keyHint}
                placeholderTextColor={colors.faint}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                value={drafts[p.id] ?? ''}
                onChangeText={(t) => setDrafts((d) => ({ ...d, [p.id]: t }))}
              />
              <Pressable style={[styles.saveBtn, !ready && styles.btnOff]} disabled={!ready} onPress={() => onSaveKey(p.id)}>
                <Text style={styles.saveText}>Save</Text>
              </Pressable>
            </View>
            <View style={styles.cardFoot}>
              <Pressable onPress={() => void Linking.openURL(p.getKeyUrl)} hitSlop={8}>
                <Text style={styles.link}>Get a key →</Text>
              </Pressable>
              {hasKey(p.id) ? (
                <Pressable onPress={() => void deleteProviderKey({ provider: p.id })} hitSlop={8}>
                  <Text style={styles.remove}>Remove key</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}

        {MULTI_PROVIDERS.length > 0 ? (
          <Text style={styles.section}>Multi-credential providers</Text>
        ) : null}
        {MULTI_PROVIDERS.map((p) => {
          const fieldIds = (p.fields ?? []).map((f) => f.id);
          return (
            <View key={p.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.provider}>{p.label}</Text>
                {hasKey(p.id) ? <Text style={styles.set}>✓ set</Text> : <Text style={styles.unset}>not set</Text>}
              </View>
              {(p.fields ?? []).map((f) => (
                <TextInput
                  key={f.id}
                  style={styles.input}
                  placeholder={`${f.label}${f.placeholder ? ` (${f.placeholder})` : ''}`}
                  placeholderTextColor={colors.faint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={f.secret}
                  value={mdrafts[p.id]?.[f.id] ?? ''}
                  onChangeText={(t) =>
                    setMdrafts((d) => ({ ...d, [p.id]: { ...(d[p.id] ?? {}), [f.id]: t } }))
                  }
                />
              ))}
              <View style={styles.cardFoot}>
                <Pressable onPress={() => void Linking.openURL(p.getKeyUrl)} hitSlop={8}>
                  <Text style={styles.link}>Get credentials →</Text>
                </Pressable>
                <View style={styles.footActions}>
                  {hasKey(p.id) ? (
                    <Pressable onPress={() => void deleteProviderKey({ provider: p.id })} hitSlop={8}>
                      <Text style={styles.remove}>Remove</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={[styles.saveBtn, !ready && styles.btnOff]}
                    disabled={!ready}
                    onPress={() => onSaveMulti(p.id, fieldIds)}
                  >
                    <Text style={styles.saveText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })}
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
  section: { color: colors.dim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginTop: space.sm },
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
  saveBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: space.lg, justifyContent: 'center', height: 42 },
  btnOff: { opacity: 0.5 },
  saveText: { color: colors.onAccent, fontWeight: '700' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footActions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  link: { color: colors.accent, fontSize: 13 },
  remove: { color: colors.danger, fontSize: 13, fontWeight: '600' },
});
