import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../chat';
import { SPACETIMEAUTH_CONFIGURED } from '../config';

export function Login({
  onSignIn,
  busy,
  error,
}: {
  onSignIn: () => void;
  busy: boolean;
  error: string | null;
}): React.JSX.Element {
  const disabled = !SPACETIMEAUTH_CONFIGURED || busy;
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.brand}>AgentSpace</Text>
        <Text style={styles.tagline}>Your agentic workspace</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, disabled && styles.btnDisabled]}
          disabled={disabled}
          onPress={onSignIn}
        >
          {busy ? (
            <ActivityIndicator color="#06101d" />
          ) : (
            <Text style={styles.btnText}>Sign in with SpacetimeAuth</Text>
          )}
        </Pressable>
        {!SPACETIMEAUTH_CONFIGURED ? (
          <Text style={styles.note}>
            Sign-in is not configured yet — set EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID (see SETUP.md S-1).
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  brand: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: 0.5 },
  tagline: { color: colors.dim, fontSize: 15 },
  actions: { gap: 12, paddingBottom: 24 },
  btn: { backgroundColor: colors.accent, borderRadius: 10, height: 50, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#06101d', fontWeight: '700', fontSize: 16 },
  note: { color: colors.faint, fontSize: 12, textAlign: 'center' },
  error: { color: '#f97583', fontSize: 13, textAlign: 'center' },
});
