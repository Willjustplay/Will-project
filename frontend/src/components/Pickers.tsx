import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, font } from "@/src/theme/theme";
import { Sheet } from "@/src/components/Sheet";
import { haptic } from "@/src/components/ui";
import { formatDateLong, parseISODate, toISODate, MONTHS_ID, DAYS_SHORT } from "@/src/utils/format";

export function DateField({
  label,
  value,
  onChange,
  testID,
}: {
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => parseISODate(value));

  const grid = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = first.getDay();
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < start; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [view]);

  const selected = value;

  return (
    <View style={styles.fieldWrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        testID={testID}
        style={styles.trigger}
        onPress={() => {
          haptic("light");
          setView(parseISODate(value));
          setOpen(true);
        }}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.brand} />
        <Text style={styles.triggerText}>{formatDateLong(value)}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.onSurfaceTertiary} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Pilih Tanggal" testID="date-sheet">
        <View style={styles.calHeader}>
          <Pressable
            hitSlop={10}
            onPress={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
            testID="cal-prev"
          >
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.calMonth}>
            {MONTHS_ID[view.getMonth()]} {view.getFullYear()}
          </Text>
          <Pressable
            hitSlop={10}
            onPress={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
            testID="cal-next"
          >
            <Ionicons name="chevron-forward" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
        <View style={styles.weekRow}>
          {DAYS_SHORT.map((d) => (
            <Text key={d} style={styles.weekLabel}>
              {d}
            </Text>
          ))}
        </View>
        <View style={styles.calGrid}>
          {grid.map((d, i) => {
            if (d === null) return <View key={`e${i}`} style={styles.calCell} />;
            const iso = toISODate(new Date(view.getFullYear(), view.getMonth(), d));
            const isSel = iso === selected;
            return (
              <Pressable
                key={iso}
                style={styles.calCell}
                onPress={() => {
                  haptic("light");
                  onChange(iso);
                  setOpen(false);
                }}
                testID={`cal-day-${d}`}
              >
                <View style={[styles.calDay, isSel && styles.calDaySel]}>
                  <Text style={[styles.calDayText, isSel && styles.calDayTextSel]}>{d}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          style={styles.todayBtn}
          onPress={() => {
            onChange(toISODate(new Date()));
            setOpen(false);
          }}
          testID="cal-today"
        >
          <Text style={styles.todayText}>Hari Ini</Text>
        </Pressable>
      </Sheet>
    </View>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function TimeField({
  label,
  value,
  onChange,
  testID,
}: {
  label?: string;
  value: string;
  onChange: (hhmm: string) => void;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const [h, m] = value.split(":").map(Number);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  return (
    <View style={styles.fieldWrap}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        testID={testID}
        style={styles.trigger}
        onPress={() => {
          haptic("light");
          setOpen(true);
        }}
      >
        <Ionicons name="time-outline" size={18} color={colors.brand} />
        <Text style={styles.triggerText}>{value}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.onSurfaceTertiary} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Pilih Waktu" testID="time-sheet">
        <View style={styles.timeRow}>
          <View style={styles.timeCol}>
            <Text style={styles.timeColLabel}>Jam</Text>
            <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {hours.map((hh) => (
                <Pressable
                  key={hh}
                  onPress={() => {
                    haptic("light");
                    onChange(`${pad(hh)}:${pad(m || 0)}`);
                  }}
                  style={[styles.timeItem, hh === h && styles.timeItemSel]}
                  testID={`hour-${hh}`}
                >
                  <Text style={[styles.timeItemText, hh === h && styles.timeItemTextSel]}>{pad(hh)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <Text style={styles.timeColon}>:</Text>
          <View style={styles.timeCol}>
            <Text style={styles.timeColLabel}>Menit</Text>
            <ScrollView style={styles.timeScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              {minutes.map((mm) => (
                <Pressable
                  key={mm}
                  onPress={() => {
                    haptic("light");
                    onChange(`${pad(h || 0)}:${pad(mm)}`);
                  }}
                  style={[styles.timeItem, mm === m && styles.timeItemSel]}
                  testID={`min-${mm}`}
                >
                  <Text style={[styles.timeItemText, mm === m && styles.timeItemTextSel]}>{pad(mm)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
        <Pressable style={styles.todayBtn} onPress={() => setOpen(false)} testID="time-done">
          <Text style={styles.todayText}>Selesai</Text>
        </Pressable>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrap: { marginBottom: spacing.md },
  label: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginBottom: spacing.xs, fontWeight: "600" },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
  },
  triggerText: { flex: 1, color: colors.onSurface, fontSize: font.lg, fontWeight: "500" },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  calMonth: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  weekRow: { flexDirection: "row", marginBottom: spacing.sm },
  weekLabel: { flex: 1, textAlign: "center", color: colors.onSurfaceTertiary, fontSize: font.sm, fontWeight: "600" },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  calDay: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  calDaySel: { backgroundColor: colors.brand },
  calDayText: { color: colors.onSurface, fontSize: font.base, fontWeight: "600" },
  calDayTextSel: { color: colors.onBrand, fontWeight: "800" },
  todayBtn: {
    marginTop: spacing.lg,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  todayText: { color: colors.brand, fontSize: font.lg, fontWeight: "700" },
  timeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md },
  timeCol: { flex: 1, alignItems: "center" },
  timeColLabel: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginBottom: spacing.sm, fontWeight: "600" },
  timeScroll: { height: 200, width: "100%" },
  timeItem: { height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, marginVertical: 2 },
  timeItemSel: { backgroundColor: colors.brandTertiary },
  timeItemText: { color: colors.onSurfaceSecondary, fontSize: font.xl, fontWeight: "600" },
  timeItemTextSel: { color: colors.brand, fontWeight: "800" },
  timeColon: { color: colors.onSurface, fontSize: font["2xl"], fontWeight: "800", marginTop: spacing.xl },
});
