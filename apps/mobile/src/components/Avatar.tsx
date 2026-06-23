import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { avatarColor, colors, initials } from '../chat';

/**
 * Round avatar: deterministic color from `idKey`, initials from `name` (or an
 * explicit `emoji`, e.g. 🤖 for agents). Optional online presence ring (humans) and an
 * optional pulsing "thinking" halo (M2.2) while an agent is mid-reply.
 */
export function Avatar({
  idKey,
  name,
  emoji,
  online,
  thinking,
  size = 40,
}: {
  idKey: string;
  name?: string;
  emoji?: string;
  online?: boolean;
  thinking?: boolean;
  size?: number;
}): React.JSX.Element {
  const bg = avatarColor(idKey);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!thinking) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [thinking, pulse]);

  return (
    <View style={{ width: size, height: size }}>
      {thinking ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.7] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
            },
          ]}
        />
      ) : null}
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
  ring: { position: 'absolute', borderWidth: 2, borderColor: colors.accent },
  dot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: colors.online,
    borderWidth: 2,
    borderColor: colors.bg,
  },
});
