import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../chat';

/**
 * Three dots that pulse in a staggered, continuous loop — the standard "typing /
 * thinking" affordance (M2.2). Pure presentation; the caller mounts it while an agent
 * is streaming a reply. Each dot runs its own loop padded to a constant period so the
 * three stay phase-locked into a left→right wave.
 */
export function TypingDots({
  color = colors.accent,
  size = 5,
}: {
  color?: string;
  size?: number;
}): React.JSX.Element {
  const dots = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const step = 160; // ms between dots

  useEffect(() => {
    const n = dots.length;
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * step),
          Animated.timing(v, { toValue: 1, duration: 340, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 340, useNativeDriver: true }),
          Animated.delay((n - 1 - i) * step), // pad so every dot's period is equal
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);

  return (
    <View style={[styles.row, { height: size * 2 }]}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.7] }) }],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});
