import React, { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PieChart } from "react-native-gifted-charts";
import { useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, font } from "@/src/theme/theme";
import { apiGet, apiPost, apiDelete } from "@/src/api/client";
import { Transaction, TxType, EXPENSE_CATEGORIES, INCOME_CATEGORIES, categoryMeta } from "@/src/types";
import { formatRupiah, formatDateShort, todayISO } from "@/src/utils/format";
import { Card, EmptyState, Fab, Field, PrimaryButton, Segmented, LoadingView, haptic } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { DateField } from "@/src/components/Pickers";
import { useToast } from "@/src/components/Toast";

export default function KeuanganScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<TxType>("expense");
  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Makanan");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());

  const load = useCallback(async () => {
    try {
      const data = await apiGet<Transaction[]>("/transactions");
      setTxns(data);
    } catch (e) {
      toast.show("Gagal memuat transaksi", "error");
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

  const { income, expense, balance } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    txns.forEach((t) => (t.type === "income" ? (inc += t.amount) : (exp += t.amount)));
    return { income: inc, expense: exp, balance: inc - exp };
  }, [txns]);

  const filtered = useMemo(() => txns.filter((t) => t.type === filter), [txns, filter]);

  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((t) => map.set(t.category, (map.get(t.category) || 0) + t.amount));
    const list = Array.from(map.entries()).map(([key, val]) => {
      const meta = categoryMeta(filter, key);
      return { value: val, color: meta.color, key };
    });
    return list.sort((a, b) => b.value - a.value);
  }, [filtered, filter]);

  const totalFiltered = pieData.reduce((s, p) => s + p.value, 0);

  const resetForm = () => {
    setType("expense");
    setAmount("");
    setCategory("Makanan");
    setNote("");
    setDate(todayISO());
  };

  const openAdd = () => {
    resetForm();
    setSheet(true);
  };

  const save = async () => {
    const amt = parseFloat(amount.replace(/[^0-9.]/g, ""));
    if (!amt || amt <= 0) {
      toast.show("Masukkan jumlah yang valid", "error");
      return;
    }
    setSaving(true);
    try {
      await apiPost("/transactions", { type, amount: amt, category, note, date });
      haptic("success");
      toast.show("Transaksi disimpan", "success");
      setSheet(false);
      await load();
    } catch (e) {
      toast.show("Gagal menyimpan", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setTxns((prev) => prev.filter((t) => t.id !== id));
    try {
      await apiDelete(`/transactions/${id}`);
      haptic("light");
    } catch {
      load();
    }
  };

  const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Keuangan</Text>
      </View>

      {loading ? (
        <LoadingView />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          <Card style={styles.balanceCard} testID="balance-card">
            <Text style={styles.balanceLabel}>Total Saldo</Text>
            <Text style={[styles.balanceValue, { color: balance < 0 ? colors.error : colors.onSurface }]}>
              {formatRupiah(balance)}
            </Text>
            <View style={styles.balanceRow}>
              <View style={styles.balancePill}>
                <View style={[styles.dot, { backgroundColor: colors.success }]} />
                <View>
                  <Text style={styles.pillLabel}>Pemasukan</Text>
                  <Text style={[styles.pillValue, { color: colors.success }]}>{formatRupiah(income)}</Text>
                </View>
              </View>
              <View style={styles.balancePill}>
                <View style={[styles.dot, { backgroundColor: colors.error }]} />
                <View>
                  <Text style={styles.pillLabel}>Pengeluaran</Text>
                  <Text style={[styles.pillValue, { color: colors.error }]}>{formatRupiah(expense)}</Text>
                </View>
              </View>
            </View>
          </Card>

          <View style={{ height: spacing.lg }} />
          <Segmented
            testID="finance-filter"
            value={filter}
            onChange={(k) => setFilter(k as TxType)}
            options={[
              { key: "expense", label: "Pengeluaran" },
              { key: "income", label: "Pemasukan" },
            ]}
          />

          <View style={{ height: spacing.lg }} />
          <Card testID="chart-card">
            <Text style={styles.cardTitle}>Berdasarkan Kategori</Text>
            {pieData.length === 0 ? (
              <Text style={styles.noData}>Belum ada data</Text>
            ) : (
              <View style={styles.chartWrap}>
                <PieChart
                  data={pieData}
                  donut
                  radius={80}
                  innerRadius={52}
                  innerCircleColor={colors.surfaceSecondary}
                  centerLabelComponent={() => (
                    <View style={{ alignItems: "center" }}>
                      <Text style={styles.chartCenterLabel}>Total</Text>
                      <Text style={styles.chartCenterValue}>{formatRupiah(totalFiltered)}</Text>
                    </View>
                  )}
                />
                <View style={styles.legend}>
                  {pieData.map((p) => (
                    <View key={p.key} style={styles.legendRow}>
                      <View style={[styles.dot, { backgroundColor: p.color }]} />
                      <Text style={styles.legendLabel} numberOfLines={1}>
                        {p.key}
                      </Text>
                      <Text style={styles.legendPct}>{Math.round((p.value / totalFiltered) * 100)}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </Card>

          <View style={{ height: spacing.xl }} />
          <Text style={styles.sectionHeader}>Transaksi Terakhir</Text>
          <View style={{ height: spacing.md }} />

          {filtered.length === 0 ? (
            <EmptyState
              testID="finance-empty"
              image="https://images.unsplash.com/photo-1551288049-bebda4e38f71?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxOTF8MHwxfHNlYXJjaHwxfHxmaW5hbmNlJTIwdHJhY2tpbmclMjBkYXNoYm9hcmQlMjBhYnN0cmFjdHxlbnwwfHx8fDE3ODgwMDM3MzV8MA&ixlib=rb-4.1.0&q=85"
              title="Belum ada transaksi"
              subtitle="Ketuk tombol + untuk menambah transaksi pertama Anda"
            />
          ) : (
            filtered.map((t, i) => {
              const meta = categoryMeta(t.type, t.category);
              return (
                <Animated.View key={t.id} entering={FadeInDown.delay(i * 30)}>
                  <Pressable
                    testID={`txn-${t.id}`}
                    onLongPress={() => remove(t.id)}
                    style={styles.txnRow}
                  >
                    <View style={[styles.txnIcon, { backgroundColor: meta.color + "22" }]}>
                      <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txnCat}>{t.category}</Text>
                      <Text style={styles.txnMeta}>
                        {formatDateShort(t.date)}
                        {t.note ? ` · ${t.note}` : ""}
                      </Text>
                    </View>
                    <Text style={[styles.txnAmount, { color: t.type === "income" ? colors.success : colors.onSurface }]}>
                      {t.type === "income" ? "+" : "-"}
                      {formatRupiah(t.amount).replace("Rp", "Rp ")}
                    </Text>
                  </Pressable>
                </Animated.View>
              );
            })
          )}
          {filtered.length > 0 && <Text style={styles.hint}>Tekan lama untuk menghapus</Text>}
        </ScrollView>
      )}

      <View style={[styles.fabWrap, { bottom: spacing.xl }]}>
        <Fab testID="add-transaction-fab" onPress={openAdd} />
      </View>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Tambah Transaksi" testID="txn-sheet">
        <Segmented
          testID="txn-type"
          value={type}
          onChange={(k) => {
            setType(k as TxType);
            setCategory(k === "income" ? "Gaji" : "Makanan");
          }}
          options={[
            { key: "expense", label: "Pengeluaran" },
            { key: "income", label: "Pemasukan" },
          ]}
        />
        <View style={{ height: spacing.lg }} />
        <Field
          label="Jumlah (Rp)"
          icon="cash-outline"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="0"
          testID="txn-amount"
        />
        <Text style={styles.fieldLabel}>Kategori</Text>
        <View style={styles.catGrid}>
          {cats.map((c) => {
            const active = c.key === category;
            return (
              <Pressable
                key={c.key}
                testID={`cat-${c.key}`}
                onPress={() => {
                  haptic("light");
                  setCategory(c.key);
                }}
                style={[styles.catChip, active && { backgroundColor: c.color + "33", borderColor: c.color }]}
              >
                <Ionicons name={c.icon as any} size={16} color={active ? c.color : colors.onSurfaceTertiary} />
                <Text style={[styles.catChipText, active && { color: colors.onSurface }]}>{c.key}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ height: spacing.md }} />
        <DateField label="Tanggal" value={date} onChange={setDate} testID="txn-date" />
        <Field label="Catatan (opsional)" icon="create-outline" value={note} onChangeText={setNote} placeholder="Tambah catatan" testID="txn-note" />
        <View style={{ height: spacing.sm }} />
        <PrimaryButton label="Simpan Transaksi" onPress={save} loading={saving} testID="txn-save" />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm },
  headerTitle: { color: colors.onSurface, fontSize: font["3xl"], fontWeight: "800" },
  balanceCard: { backgroundColor: colors.surfaceSecondary },
  balanceLabel: { color: colors.onSurfaceTertiary, fontSize: font.base, fontWeight: "600" },
  balanceValue: { fontSize: font["4xl"], fontWeight: "800", marginTop: spacing.xs, letterSpacing: -1 },
  balanceRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  balancePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pillLabel: { color: colors.onSurfaceTertiary, fontSize: font.sm },
  pillValue: { fontSize: font.base, fontWeight: "700" },
  cardTitle: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700", marginBottom: spacing.md },
  noData: { color: colors.onSurfaceTertiary, fontSize: font.base, textAlign: "center", paddingVertical: spacing.xl },
  chartWrap: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  chartCenterLabel: { color: colors.onSurfaceTertiary, fontSize: font.sm },
  chartCenterValue: { color: colors.onSurface, fontSize: font.sm, fontWeight: "700" },
  legend: { flex: 1, gap: spacing.sm },
  legendRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  legendLabel: { color: colors.onSurfaceSecondary, fontSize: font.base, flex: 1 },
  legendPct: { color: colors.onSurfaceTertiary, fontSize: font.sm, fontWeight: "700" },
  sectionHeader: { color: colors.onSurface, fontSize: font.xl, fontWeight: "700" },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  txnIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  txnCat: { color: colors.onSurface, fontSize: font.lg, fontWeight: "600" },
  txnMeta: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginTop: 2 },
  txnAmount: { fontSize: font.lg, fontWeight: "700" },
  hint: { color: colors.onSurfaceTertiary, fontSize: font.sm, textAlign: "center", marginTop: spacing.sm },
  fabWrap: { position: "absolute", right: spacing.lg },
  fieldLabel: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginBottom: spacing.sm, fontWeight: "600" },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catChipText: { color: colors.onSurfaceTertiary, fontSize: font.base, fontWeight: "600" },
});
