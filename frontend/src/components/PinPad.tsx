import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { colors, radius, spacing, font } from "@/src/theme/theme";
import { haptic } from "@/src/components/ui";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export function PinPad({
  title,
  subtitle,
  value,
  onKey,
  error,
}: {
  title: string;
  subtitle: string;
  value: string;
  onKey: (k: string) => void;
  error?: boolean;
}) {
  const shake = useSharedValue(0);

  React.useEffect(() => {
    if (error) {
      haptic("error");
      shake.value = withSequence(
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 50 }),
        withTiming(-6, { duration: 50 }),
        withTiming(0, { duration: 50 })
      );
    }
  }, [error, shake]);

  const dotsStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <View style={styles.wrap}>
      <View style={styles.lockCircle}>
        <Ionicons name="lock-closed" size={32} color={colors.brand} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <Animated.View style={[styles.dots, dotsStyle]}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < value.length && styles.dotFilled,
              error && styles.dotError,
            ]}
          />
        ))}
      </Animated.View>

      <View style={styles.pad}>
        {KEYS.map((k, i) => {
          if (k === "") return <View key={i} style={styles.key} />;
          if (k === "del") {
            return (
              <Pressable
                key={i}
                testID="pin-del"
                style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
                onPress={() => {
                  haptic("light");
                  onKey("del");
                }}
              >
                <Ionicons name="backspace-outline" size={26} color={colors.onSurface} />
              </Pressable>
            );
          }
          return (
            <Pressable
              key={i}
              testID={`pin-key-${k}`}
              style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
              onPress={() => {
                haptic("light");
                onKey(k);
              }}
            >
              <Text style={styles.keyText}>{k}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  lockCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  title: { color: colors.onSurface, fontSize: font["2xl"], fontWeight: "800" },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: font.base, marginTop: spacing.xs, textAlign: "center" },
  dots: { flexDirection: "row", gap: spacing.lg, marginVertical: spacing["2xl"] },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  dotFilled: { backgroundColor: colors.brand, borderColor: colors.brand },
  dotError: { borderColor: colors.error },
  pad: { flexDirection: "row", flexWrap: "wrap", width: 280, justifyContent: "center" },
  key: {
    width: 80,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  keyPressed: { backgroundColor: colors.surfaceTertiary },
  keyText: { color: colors.onSurface, fontSize: font["2xl"], fontWeight: "600" },
});
