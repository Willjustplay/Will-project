import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { colors, radius, spacing, font } from "@/src/theme/theme";

export function haptic(type: "light" | "medium" | "success" | "error" = "light") {
  if (Platform.OS === "web") return;
  try {
    if (type === "success") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === "error") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else if (type === "medium") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {}
}

export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  icon,
  testID,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  testID?: string;
  variant?: "primary" | "ghost" | "danger";
}) {
  const bg = variant === "primary" ? colors.brand : variant === "danger" ? colors.error : "transparent";
  const fg = variant === "ghost" ? colors.onSurface : variant === "danger" ? colors.onError : colors.onBrand;
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        haptic("medium");
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === "ghost" && { borderWidth: 1, borderColor: colors.borderStrong },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnInner}>
          {icon && <Ionicons name={icon as any} size={18} color={fg} />}
          <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  icon,
  ...props
}: TextInputProps & { label?: string; icon?: string }) {
  return (
    <View style={styles.fieldWrap}>
      {label && <Text style={styles.fieldLabel}>{label}</Text>}
      <View style={styles.fieldInner}>
        {icon && <Ionicons name={icon as any} size={18} color={colors.onSurfaceTertiary} />}
        <TextInput
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.input}
          {...props}
        />
      </View>
    </View>
  );
}

export function Segmented({
  options,
  value,
  onChange,
  testID,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
  testID?: string;
}) {
  return (
    <View style={styles.segment} testID={testID}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={`${testID}-${o.key}`}
            onPress={() => {
              haptic("light");
              onChange(o.key);
            }}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({
  image,
  title,
  subtitle,
  testID,
}: {
  image?: string;
  title: string;
  subtitle?: string;
  testID?: string;
}) {
  return (
    <View style={styles.empty} testID={testID}>
      {image && <Image source={{ uri: image }} style={styles.emptyImg} contentFit="cover" transition={200} />}
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySub}>{subtitle}</Text>}
    </View>
  );
}

export function Fab({ onPress, testID, icon = "add" }: { onPress: () => void; testID?: string; icon?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        haptic("medium");
        onPress();
      }}
      style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.94 }] }]}
    >
      <Ionicons name={icon as any} size={28} color={colors.onBrand} />
    </Pressable>
  );
}

export function IconChip({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        haptic("light");
        onPress();
      }}
      style={({ pressed }) => [styles.iconChip, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.iconChipCircle}>
        <Ionicons name={icon as any} size={22} color={colors.brand} />
      </View>
      <Text style={styles.iconChipLabel}>{label}</Text>
    </Pressable>
  );
}

export function LoadingView() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  sectionTitle: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  btn: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  btnInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  btnText: { fontSize: font.lg, fontWeight: "700" },
  fieldWrap: { marginBottom: spacing.md },
  fieldLabel: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginBottom: spacing.xs, fontWeight: "600" },
  fieldInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: font.lg, paddingVertical: 14 },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: 4,
  },
  segmentItem: {
    flex: 1,
    height: 40,
    borderRadius: radius.sm + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentItemActive: { backgroundColor: colors.brand },
  segmentText: { color: colors.onSurfaceTertiary, fontSize: font.base, fontWeight: "600" },
  segmentTextActive: { color: colors.onBrand, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: spacing["2xl"], gap: spacing.md },
  emptyImg: { width: 140, height: 140, borderRadius: radius.lg, opacity: 0.85 },
  emptyTitle: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700", textAlign: "center" },
  emptySub: { color: colors.onSurfaceTertiary, fontSize: font.base, textAlign: "center", paddingHorizontal: spacing.xl },
  fab: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.brand,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  iconChip: { alignItems: "center", gap: spacing.sm, width: 76 },
  iconChipCircle: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  iconChipLabel: { color: colors.onSurfaceSecondary, fontSize: font.sm, fontWeight: "600" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing["2xl"] },
});
