// AgentSpace login / onboarding (M2.9, DEC-037). Our own screen — not SpacetimeAuth's
// hosted method list. Google is the production path (inert until SETUP.md S-9 wires the
// client; native SDK lands next chunk); SpacetimeAuth stays as the working fallback
// (Path A); "Continue as guest" is an anonymous testing affordance (retired at launch).
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../chat';
import { GOOGLE_CONFIGURED, SPACETIMEAUTH_CONFIGURED } from '../config';

export function Login({
  onGoogle,
  onSignIn,
  onGuest,
  busy,
  error,
}: {
  onGoogle: () => void;
  onSignIn: () => void;
  onGuest: () => void;
  busy: boolean;
  error: string | null;
}): React.JSX.Element {
  const googleDisabled = !GOOGLE_CONFIGURED || busy;
  const spacetimeDisabled = !SPACETIMEAUTH_CONFIGURED || busy;
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.brand}>AgentSpace</Text>
        <Text style={styles.tagline}>Your agentic workspace</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, googleDisabled && styles.btnDisabled]}
          disabled={googleDisabled}
          onPress={onGoogle}
        >
          <Text style={styles.btnText}>Continue with Google</Text>
        </Pressable>
        {!GOOGLE_CONFIGURED ? (
          <Text style={styles.note}>Google sign-in is coming online — see SETUP.md S-9.</Text>
        ) : null}

        <Pressable
          style={[styles.btnOutline, spacetimeDisabled && styles.btnDisabled]}
          disabled={spacetimeDisabled}
          onPress={onSignIn}
        >
          {busy ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text style={styles.btnOutlineText}>Sign in with SpacetimeAuth</Text>
          )}
        </Pressable>
        {!SPACETIMEAUTH_CONFIGURED ? (
          <Text style={styles.note}>
            SpacetimeAuth is not configured — set EXPO_PUBLIC_SPACETIMEAUTH_CLIENT_ID (SETUP.md S-1).
          </Text>
        ) : null}

        <Pressable style={styles.ghost} disabled={busy} onPress={onGuest}>
          <Text style={styles.ghostText}>Continue as guest (testing)</Text>
        </Pressable>

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
  actions: { gap: 10, paddingBottom: 24 },
  btn: { backgroundColor: colors.accent, borderRadius: 10, height: 50, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#06101d', fontWeight: '700', fontSize: 16 },
  btnOutline: {
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 10,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: { color: colors.accent, fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
  ghost: { height: 44, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: colors.dim, fontSize: 14, fontWeight: '600' },
  note: { color: colors.faint, fontSize: 12, textAlign: 'center' },
  error: { color: '#f97583', fontSize: 13, textAlign: 'center' },
});
