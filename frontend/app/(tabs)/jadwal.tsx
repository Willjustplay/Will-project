import React, { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, font } from "@/src/theme/theme";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/src/api/client";
import { EventItem, TaskItem, Reminder } from "@/src/types";
import { toISODate, formatDateLong, DAYS_SHORT } from "@/src/utils/format";
import { Card, EmptyState, Fab, Field, PrimaryButton, Segmented, LoadingView, haptic } from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { TimeField } from "@/src/components/Pickers";
import { useToast } from "@/src/components/Toast";

type Tab = "jadwal" | "tugas" | "alarm";
const WEEK_DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export default function JadwalScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("jadwal");
  const [selDate, setSelDate] = useState(toISODate(new Date()));
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  // form fields
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [time, setTime] = useState("08:00");
  const [days, setDays] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const [ev, tk, rm] = await Promise.all([
        apiGet<EventItem[]>("/events"),
        apiGet<TaskItem[]>("/tasks"),
        apiGet<Reminder[]>("/reminders"),
      ]);
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

  const week = useMemo(() => {
    const base = new Date();
    const start = new Date(base);
    start.setDate(base.getDate() - base.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, []);

  const dayEvents = useMemo(
    () => events.filter((e) => e.date === selDate).sort((a, b) => (a.time || "").localeCompare(b.time || "")),
    [events, selDate]
  );

  const resetForm = () => {
    setTitle("");
    setNote("");
    setTime("08:00");
    setDays([]);
  };

  const openAdd = () => {
    resetForm();
    setSheet(true);
  };

  const save = async () => {
    if (!title.trim()) {
      toast.show("Judul tidak boleh kosong", "error");
      return;
    }
    setSaving(true);
    try {
      if (tab === "jadwal") {
        await apiPost("/events", { title: title.trim(), date: selDate, time, note });
      } else if (tab === "tugas") {
        await apiPost("/tasks", { title: title.trim(), due_date: selDate });
      } else {
        await apiPost("/reminders", { label: title.trim(), time, days });
      }
      haptic("success");
      toast.show("Tersimpan", "success");
      setSheet(false);
      await load();
    } catch {
      toast.show("Gagal menyimpan", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (t: TaskItem) => {
    haptic("light");
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    try {
      await apiPatch(`/tasks/${t.id}`, { done: !t.done });
    } catch {
      load();
    }
  };

  const toggleReminder = async (r: Reminder) => {
    setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)));
    try {
      await apiPatch(`/reminders/${r.id}`, { enabled: !r.enabled });
    } catch {
      load();
    }
  };

  const removeItem = async (kind: Tab, id: string) => {
    haptic("light");
    if (kind === "jadwal") {
      setEvents((p) => p.filter((x) => x.id !== id));
      apiDelete(`/events/${id}`).catch(load);
    } else if (kind === "tugas") {
      setTasks((p) => p.filter((x) => x.id !== id));
      apiDelete(`/tasks/${id}`).catch(load);
    } else {
      setReminders((p) => p.filter((x) => x.id !== id));
      apiDelete(`/reminders/${id}`).catch(load);
    }
  };

  const sheetTitle = tab === "jadwal" ? "Tambah Jadwal" : tab === "tugas" ? "Tambah Tugas" : "Tambah Alarm";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Jadwal</Text>
        <Text style={styles.headerSub}>{formatDateLong(selDate)}</Text>
      </View>

      {/* Week strip */}
      <View style={styles.weekStrip}>
        {week.map((d) => {
          const iso = toISODate(d);
          const active = iso === selDate;
          const isToday = iso === toISODate(new Date());
          return (
            <Pressable
              key={iso}
              testID={`week-${iso}`}
              onPress={() => {
                haptic("light");
                setSelDate(iso);
              }}
              style={[styles.weekDay, active && styles.weekDayActive]}
            >
              <Text style={[styles.weekDayLabel, active && styles.weekDayTextActive]}>{WEEK_DAYS[d.getDay()]}</Text>
              <Text style={[styles.weekDayNum, active && styles.weekDayTextActive]}>{d.getDate()}</Text>
              {isToday && <View style={[styles.todayDot, active && { backgroundColor: colors.onBrand }]} />}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.segmentWrap}>
        <Segmented
          testID="jadwal-tabs"
          value={tab}
          onChange={(k) => setTab(k as Tab)}
          options={[
            { key: "jadwal", label: "Jadwal" },
            { key: "tugas", label: "Tugas" },
            { key: "alarm", label: "Alarm" },
          ]}
        />
      </View>

      {loading ? (
        <LoadingView />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {tab === "jadwal" &&
            (dayEvents.length === 0 ? (
              <EmptyState
                testID="jadwal-empty"
                image="https://images.unsplash.com/photo-1644329843491-99edfc83de04?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzd8MHwxfHNlYXJjaHwxfHx0b2RvJTIwbGlzdCUyMG5vdGVwYWR8ZW58MHx8fHwxNzg4MDAzNzM1fDA&ixlib=rb-4.1.0&q=85"
                title="Tidak ada jadwal hari ini"
                subtitle="Ketuk + untuk menambah acara pada tanggal ini"
              />
            ) : (
              dayEvents.map((e, i) => (
                <Animated.View key={e.id} entering={FadeInDown.delay(i * 30)}>
                  <Pressable style={styles.itemRow} onLongPress={() => removeItem("jadwal", e.id)} testID={`event-${e.id}`}>
                    <View style={styles.timeBadge}>
                      <Text style={styles.timeBadgeText}>{e.time || "--:--"}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>{e.title}</Text>
                      {!!e.note && <Text style={styles.itemMeta}>{e.note}</Text>}
                    </View>
                    <Ionicons name="calendar" size={18} color={colors.brand} />
                  </Pressable>
                </Animated.View>
              ))
            ))}

          {tab === "tugas" &&
            (tasks.length === 0 ? (
              <EmptyState
                testID="tugas-empty"
                image="https://images.unsplash.com/photo-1644329843491-99edfc83de04?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzd8MHwxfHNlYXJjaHwxfHx0b2RvJTIwbGlzdCUyMG5vdGVwYWR8ZW58MHx8fHwxNzg4MDAzNzM1fDA&ixlib=rb-4.1.0&q=85"
                title="Belum ada tugas"
                subtitle="Ketuk + untuk menambah tugas baru"
              />
            ) : (
              tasks.map((t, i) => (
                <Animated.View key={t.id} entering={FadeInDown.delay(i * 30)}>
                  <Pressable style={styles.itemRow} onPress={() => toggleTask(t)} onLongPress={() => removeItem("tugas", t.id)} testID={`task-${t.id}`}>
                    <View style={[styles.checkbox, t.done && styles.checkboxDone]}>
                      {t.done && <Ionicons name="checkmark" size={16} color={colors.onBrand} />}
                    </View>
                    <Text style={[styles.itemTitle, { flex: 1 }, t.done && styles.itemDone]}>{t.title}</Text>
                  </Pressable>
                </Animated.View>
              ))
            ))}

          {tab === "alarm" &&
            (reminders.length === 0 ? (
              <EmptyState
                testID="alarm-empty"
                image="https://images.unsplash.com/photo-1591436123200-5ccc6511c0e9?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MjJ8MHwxfHNlYXJjaHwxfHxkaWdpdGFsJTIwY2xvY2slMjBhbGFybXxlbnwwfHx8fDE3ODgwMDM3MzV8MA&ixlib=rb-4.1.0&q=85"
                title="Belum ada alarm"
                subtitle="Ketuk + untuk membuat pengingat waktu"
              />
            ) : (
              reminders.map((r, i) => (
                <Animated.View key={r.id} entering={FadeInDown.delay(i * 30)}>
                  <Pressable style={styles.itemRow} onLongPress={() => removeItem("alarm", r.id)} testID={`reminder-${r.id}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.alarmTime, !r.enabled && { color: colors.onSurfaceTertiary }]}>{r.time}</Text>
                      <Text style={styles.itemMeta}>
                        {r.label}
                        {r.days.length ? ` · ${r.days.join(", ")}` : ""}
                      </Text>
                    </View>
                    <Switch
                      testID={`reminder-toggle-${r.id}`}
                      value={r.enabled}
                      onValueChange={() => toggleReminder(r)}
                      trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
                      thumbColor={colors.onSurface}
                    />
                  </Pressable>
                </Animated.View>
              ))
            ))}
        </ScrollView>
      )}

      <View style={[styles.fabWrap, { bottom: spacing.xl }]}>
        <Fab testID="add-jadwal-fab" onPress={openAdd} />
      </View>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title={sheetTitle} testID="jadwal-sheet">
        <Field
          label={tab === "alarm" ? "Nama Alarm" : "Judul"}
          icon="text-outline"
          value={title}
          onChangeText={setTitle}
          placeholder={tab === "alarm" ? "Contoh: Bangun pagi" : "Masukkan judul"}
          testID="jadwal-title"
        />
        {tab === "jadwal" && (
          <>
            <TimeField label="Waktu" value={time} onChange={setTime} testID="jadwal-time" />
            <Field label="Catatan (opsional)" icon="create-outline" value={note} onChangeText={setNote} placeholder="Tambah catatan" testID="jadwal-note" />
          </>
        )}
        {tab === "alarm" && (
          <>
            <TimeField label="Waktu" value={time} onChange={setTime} testID="alarm-time" />
            <Text style={styles.daysLabel}>Ulangi (opsional)</Text>
            <View style={styles.daysRow}>
              {DAYS_SHORT.map((d) => {
                const active = days.includes(d);
                return (
                  <Pressable
                    key={d}
                    testID={`day-${d}`}
                    onPress={() => {
                      haptic("light");
                      setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
                    }}
                    style={[styles.dayChip, active && styles.dayChipActive]}
                  >
                    <Text style={[styles.dayChipText, active && { color: colors.onBrand }]}>{d}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        {tab === "tugas" && <Text style={styles.taskHint}>Tugas akan ditambahkan untuk {formatDateLong(selDate)}</Text>}
        <View style={{ height: spacing.md }} />
        <PrimaryButton label="Simpan" onPress={save} loading={saving} testID="jadwal-save" />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerTitle: { color: colors.onSurface, fontSize: font["3xl"], fontWeight: "800" },
  headerSub: { color: colors.onSurfaceTertiary, fontSize: font.base, marginTop: 2 },
  weekStrip: { flexDirection: "row", paddingHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.xs },
  weekDay: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekDayActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  weekDayLabel: { color: colors.onSurfaceTertiary, fontSize: font.sm, fontWeight: "600" },
  weekDayNum: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700", marginTop: 2 },
  weekDayTextActive: { color: colors.onBrand },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.brand, marginTop: 3 },
  segmentWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  itemRow: {
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
  timeBadge: {
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    minWidth: 56,
    alignItems: "center",
  },
  timeBadgeText: { color: colors.brand, fontSize: font.base, fontWeight: "700" },
  itemTitle: { color: colors.onSurface, fontSize: font.lg, fontWeight: "600" },
  itemMeta: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginTop: 2 },
  itemDone: { textDecorationLine: "line-through", color: colors.onSurfaceTertiary },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: { backgroundColor: colors.brand, borderColor: colors.brand },
  alarmTime: { color: colors.onSurface, fontSize: font["2xl"], fontWeight: "800", letterSpacing: -0.5 },
  fabWrap: { position: "absolute", right: spacing.lg },
  daysLabel: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginBottom: spacing.sm, fontWeight: "600" },
  daysRow: { flexDirection: "row", gap: spacing.xs, marginBottom: spacing.md },
  dayChip: {
    flex: 1,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },
  dayChipActive: { backgroundColor: colors.brand },
  dayChipText: { color: colors.onSurfaceTertiary, fontSize: font.sm, fontWeight: "700" },
  taskHint: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginBottom: spacing.sm },
});
