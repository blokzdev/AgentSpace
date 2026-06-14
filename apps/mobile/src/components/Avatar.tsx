import { StyleSheet, Text, View } from 'react-native';
import { avatarColor, colors, initials } from '../chat';

/**
 * Round avatar: deterministic color from `idKey`, initials from `name` (or an
 * explicit `emoji`, e.g. 🤖 for agents). Optional online presence ring.
 */
export function Avatar({
  idKey,
  name,
  emoji,
  online,
  size = 40,
}: {
  idKey: string;
  name?: string;
  emoji?: string;
  online?: boolean;
  size?: number;
}): React.JSX.Element {
  const bg = avatarColor(idKey);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        ]}
      >
        <Text style={[styles.label, { fontSize: size * 0.4 }]}>
          {emoji ?? initials(name ?? '?')}
        </Text>
      </View>
      {online ? (
        <View style={[styles.dot, { width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14 }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.onAccent, fontWeight: '700' },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: colors.online,
    borderWidth: 2,
    borderColor: colors.bg,
  },
});
