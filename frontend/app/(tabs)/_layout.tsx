import React from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors, font } from "@/src/theme/theme";

const ICONS: Record<string, { active: string; inactive: string }> = {
  index: { active: "home", inactive: "home-outline" },
  keuangan: { active: "wallet", inactive: "wallet-outline" },
  jadwal: { active: "calendar", inactive: "calendar-outline" },
  brankas: { active: "lock-closed", inactive: "lock-closed-outline" },
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.onSurfaceTertiary,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: font.sm, fontWeight: "600" },
        tabBarIcon: ({ color, focused, size }) => {
          const cfg = ICONS[route.name] || ICONS.index;
          return (
            <Ionicons name={(focused ? cfg.active : cfg.inactive) as any} size={size ?? 24} color={color} />
          );
        },
      })}
      screenListeners={{
        tabPress: () => {
          if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Beranda" }} />
      <Tabs.Screen name="keuangan" options={{ title: "Keuangan" }} />
      <Tabs.Screen name="jadwal" options={{ title: "Jadwal" }} />
      <Tabs.Screen name="brankas" options={{ title: "Brankas" }} />
    </Tabs>
  );
}
