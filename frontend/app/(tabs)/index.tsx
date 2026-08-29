import React, { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { LineChart } from "react-native-gifted-charts";
import { useFocusEffect, useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, font } from "@/src/theme/theme";
import { apiGet } from "@/src/api/client";
import { Transaction, EventItem, TaskItem, Reminder } from "@/src/types";
import { formatRupiah, formatDateLong, todayISO, MONTHS_SHORT } from "@/src/utils/format";
import { Card, EmptyState, IconChip, LoadingView, haptic } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";

export default function BerandaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tx, ev, tk, rm] = await Promise.all([
        apiGet<Transaction[]>("/transactions"),
        apiGet<EventItem[]>("/events"),
        apiGet<TaskItem[]>("/tasks"),
        apiGet<Reminder[]>("/reminders"),
      ]);
      setTxns(tx);
      setEvents(ev);
      setTasks(tk);
      setReminders(rm);
    } catch {
      toast.show("Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const balance = useMemo(
    () => txns.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0),
    [txns]
  );
  const { income, expense } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    txns.forEach((t) => (t.type === "income" ? (inc += t.amount) : (exp += t.amount)));
    return { income: inc, expense: exp };
  }, [txns]);

  const today = todayISO();
  const todayEvents = useMemo(() => events.filter((e) => e.date === today), [events, today]);
  const pendingTasks = useMemo(() => tasks.filter((t) => !t.done), [tasks]);
  const activeReminders = useMemo(() => reminders.filter((r) => r.enabled), [reminders]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 11) return "Selamat pagi";
    if (h < 15) return "Selamat siang";
    if (h < 19) return "Selamat sore";
    return "Selamat malam";
  }, []);

  const hasToday = todayEvents.length > 0 || pendingTasks.length > 0 || activeReminders.length > 0;

  // Monthly trend: last 6 months income vs expense
  const monthly = useMemo(() => {
    const now = new Date();
    const months: { ym: string; label: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ ym, label: MONTHS_SHORT[d.getMonth()], income: 0, expense: 0 });
    }
    const idx = new Map(months.map((m, i) => [m.ym, i]));
    txns.forEach((t) => {
      const ym = t.date.slice(0, 7);
      const i = idx.get(ym);
      if (i !== undefined) {
        if (t.type === "income") months[i].income += t.amount;
        else months[i].expense += t.amount;
      }
    });
    return months;
  }, [txns]);

  const hasTrend = monthly.some((m) => m.income > 0 || m.expense > 0);
  const incomeLine = monthly.map((m) => ({ value: m.income, label: m.label }));
  const expenseLine = monthly.map((m) => ({ value: m.expense, label: m.label }));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {loading ? (
        <LoadingView />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>{greeting} 👋</Text>
              <Text style={styles.date}>{formatDateLong(today)}</Text>
            </View>
            <View style={styles.headerBtns}>
              <Pressable
                style={styles.aiHeaderBtn}
                onPress={() => { haptic("light"); router.push("/asisten"); }}
                testID="home-ai-btn"
                hitSlop={8}
              >
                <Ionicons name="sparkles" size={20} color={colors.onBrand} />
              </Pressable>
              <Pressable
                style={styles.gearBtn}
                onPress={() => { haptic("light"); router.push("/pengaturan"); }}
                testID="home-settings"
                hitSlop={8}
              >
                <Ionicons name="cloud-outline" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
          </View>

          {/* AI Assistant banner */}
          <Animated.View entering={FadeInDown.delay(30)}>
            <Pressable onPress={() => { haptic("medium"); router.push("/asisten"); }} testID="home-ai-banner">
              <LinearGradient
                colors={[colors.brandTertiary, colors.surfaceSecondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.aiBanner}
              >
                <View style={styles.aiBannerIcon}>
                  <Ionicons name="sparkles" size={22} color={colors.onBrand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aiBannerTitle}>Asisten AI</Text>
                  <Text style={styles.aiBannerSub}>Tanya apa saja atau catat transaksi dengan bahasa biasa</Text>
                </View>
                <Ionicons name="arrow-forward-circle" size={26} color={colors.brand} />
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Finance summary */}
          <Animated.View entering={FadeInDown.delay(50)}>
            <Pressable onPress={() => { haptic("light"); router.push("/(tabs)/keuangan"); }} testID="home-finance-card">
              <LinearGradient
                colors={[colors.surfaceSecondary, colors.surfaceTertiary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.financeCard}
              >
                <View style={styles.financeTop}>
                  <Text style={styles.financeLabel}>Total Saldo</Text>
                  <Ionicons name="wallet" size={20} color={colors.brand} />
                </View>
                <Text style={[styles.financeValue, { color: balance < 0 ? colors.error : colors.onSurface }]}>
                  {formatRupiah(balance)}
                </Text>
                <View style={styles.financeRow}>
                  <View style={styles.financeStat}>
                    <Ionicons name="arrow-down-circle" size={16} color={colors.success} />
                    <Text style={styles.financeStatText}>{formatRupiah(income)}</Text>
                  </View>
                  <View style={styles.financeStat}>
                    <Ionicons name="arrow-up-circle" size={16} color={colors.error} />
                    <Text style={styles.financeStatText}>{formatRupiah(expense)}</Text>
                  </View>
                </View>
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* Monthly trend */}
          {hasTrend && (
            <Animated.View entering={FadeInDown.delay(90)}>
              <View style={styles.trendCard} testID="home-trend">
                <View style={styles.trendHead}>
                  <Text style={styles.trendTitle}>Tren 6 Bulan</Text>
                  <View style={styles.trendLegend}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                      <Text style={styles.legendText}>Masuk</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
                      <Text style={styles.legendText}>Keluar</Text>
                    </View>
                  </View>
                </View>
                <LineChart
                  data={incomeLine}
                  data2={expenseLine}
                  height={140}
                  initialSpacing={12}
                  spacing={48}
                  thickness={2}
                  color1={colors.success}
                  color2={colors.error}
                  dataPointsColor1={colors.success}
                  dataPointsColor2={colors.error}
                  hideRules
                  yAxisThickness={0}
                  xAxisThickness={0}
                  xAxisLabelTextStyle={{ color: colors.onSurfaceTertiary, fontSize: 11 }}
                  hideYAxisText
                  curved
                  adjustToWidth
                />
              </View>
            </Animated.View>
          )}

          {/* Hari Ini */}
          <Animated.View entering={FadeInDown.delay(120)}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Hari Ini</Text>
              <Pressable onPress={() => router.push("/(tabs)/jadwal")} testID="home-see-jadwal">
                <Text style={styles.seeAll}>Lihat semua</Text>
              </Pressable>
            </View>

            {!hasToday ? (
              <Card>
                <EmptyState
                  testID="home-today-empty"
                  title="Tidak ada agenda hari ini"
                  subtitle="Nikmati harimu, atau tambah jadwal & tugas baru"
                />
              </Card>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {todayEvents.map((e) => (
                  <View key={e.id} style={styles.todayItem} testID={`home-event-${e.id}`}>
                    <View style={[styles.todayIcon, { backgroundColor: colors.brandTertiary }]}>
                      <Ionicons name="calendar" size={18} color={colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.todayTitle}>{e.title}</Text>
                      <Text style={styles.todaySub}>Jadwal · {e.time || "sepanjang hari"}</Text>
                    </View>
                  </View>
                ))}
                {activeReminders.map((r) => (
                  <View key={r.id} style={styles.todayItem} testID={`home-reminder-${r.id}`}>
                    <View style={[styles.todayIcon, { backgroundColor: "#0A84FF22" }]}>
                      <Ionicons name="alarm" size={18} color="#0A84FF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.todayTitle}>{r.label}</Text>
                      <Text style={styles.todaySub}>Alarm · {r.time}</Text>
                    </View>
                  </View>
                ))}
                {pendingTasks.slice(0, 5).map((t) => (
                  <View key={t.id} style={styles.todayItem} testID={`home-task-${t.id}`}>
                    <View style={[styles.todayIcon, { backgroundColor: "#32D74B22" }]}>
                      <Ionicons name="checkbox-outline" size={18} color={colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.todayTitle}>{t.title}</Text>
                      <Text style={styles.todaySub}>Tugas belum selesai</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>

          {/* Quick access */}
          <Animated.View entering={FadeInDown.delay(180)}>
            <Text style={[styles.sectionTitle, { marginTop: spacing.xl, marginBottom: spacing.md }]}>Akses Cepat</Text>
            <View style={styles.chipsRow}>
              <IconChip testID="quick-vault" icon="lock-closed" label="Brankas" onPress={() => router.push("/(tabs)/brankas")} />
              <IconChip testID="quick-files" icon="folder" label="Berkas" onPress={() => router.push("/(tabs)/brankas")} />
              <IconChip testID="quick-finance" icon="stats-chart" label="Keuangan" onPress={() => router.push("/(tabs)/keuangan")} />
              <IconChip testID="quick-schedule" icon="calendar" label="Jadwal" onPress={() => router.push("/(tabs)/jadwal")} />
            </View>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.lg },
  headerBtns: { flexDirection: "row", gap: spacing.sm },
  aiHeaderBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  gearBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  aiBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    marginBottom: spacing.lg,
  },
  aiBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  aiBannerTitle: { color: colors.onSurface, fontSize: font.lg, fontWeight: "800" },
  aiBannerSub: { color: colors.onSurfaceSecondary, fontSize: font.sm, marginTop: 2 },
  greeting: { color: colors.onSurface, fontSize: font["2xl"], fontWeight: "800" },
  date: { color: colors.onSurfaceTertiary, fontSize: font.base, marginTop: 2 },
  trendCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.lg,
    overflow: "hidden",
  },
  trendHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  trendTitle: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  trendLegend: { flexDirection: "row", gap: spacing.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.onSurfaceTertiary, fontSize: font.sm },
  financeCard: { borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  financeTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  financeLabel: { color: colors.onSurfaceTertiary, fontSize: font.base, fontWeight: "600" },
  financeValue: { fontSize: font["4xl"], fontWeight: "800", marginTop: spacing.xs, letterSpacing: -1 },
  financeRow: { flexDirection: "row", gap: spacing.xl, marginTop: spacing.md },
  financeStat: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  financeStatText: { color: colors.onSurfaceSecondary, fontSize: font.base, fontWeight: "600" },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: { color: colors.onSurface, fontSize: font.xl, fontWeight: "700" },
  seeAll: { color: colors.brand, fontSize: font.base, fontWeight: "600" },
  todayItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  todayIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  todayTitle: { color: colors.onSurface, fontSize: font.lg, fontWeight: "600" },
  todaySub: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginTop: 2 },
  chipsRow: { flexDirection: "row", justifyContent: "space-between" },
});
