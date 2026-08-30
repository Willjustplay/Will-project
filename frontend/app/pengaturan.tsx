import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, font } from "@/src/theme/theme";
import { apiGet, apiPost } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { Card, PrimaryButton, LoadingView, haptic } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { formatDateLong, todayISO } from "@/src/utils/format";

const SAF_DIR_KEY = "pv_saf_download_dir";

export default function PengaturanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const doExport = async () => {
    setExporting(true);
    try {
      const data = await apiGet<any>("/backup/export");
      const json = JSON.stringify(data, null, 2);
      const filename = `personal-vault-backup-${todayISO()}.json`;

      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const uri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(uri, json);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Simpan Cadangan" });
        } else {
          toast.show("Cadangan tersimpan di perangkat", "success");
        }
      }
      haptic("success");
      toast.show("Cadangan berhasil dibuat", "success");
    } catch {
      toast.show("Gagal membuat cadangan", "error");
    } finally {
      setExporting(false);
    }
  };

  const doImport = async () => {
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) {
        setImporting(false);
        return;
      }
      const uri = result.assets[0].uri;
      const text = await (await fetch(uri)).text();
      const parsed = JSON.parse(text);
      if (!parsed || parsed.app !== "personal-vault") {
        toast.show("File cadangan tidak valid", "error");
        setImporting(false);
        return;
      }
      const res = await apiPost<any>("/backup/import", parsed);
      const total = Object.values(res.imported || {}).reduce((s: number, n: any) => s + n, 0);
      setLastResult(`${total} item berhasil dipulihkan`);
      haptic("success");
      toast.show("Data berhasil dipulihkan", "success");
    } catch {
      toast.show("Gagal memulihkan data", "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="back-button">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Cadangan Data</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="cloud-upload" size={36} color={colors.brand} />
          </View>
          <Text style={styles.heroTitle}>Simpan & Pulihkan</Text>
          <Text style={styles.heroSub}>
            Buat cadangan semua data Anda (transaksi, jadwal, tugas, alarm, sandi, kantong & daftar berkas) ke dalam satu
            file, dan pulihkan kapan saja.
          </Text>
        </View>

        <Card style={styles.card} testID="export-card">
          <View style={styles.cardHead}>
            <Ionicons name="download-outline" size={22} color={colors.brand} />
            <Text style={styles.cardTitle}>Simpan Cadangan</Text>
          </View>
          <Text style={styles.cardDesc}>Unduh seluruh data Anda sebagai file .json yang dapat disimpan dengan aman.</Text>
          <View style={{ height: spacing.md }} />
          <PrimaryButton label="Simpan Data" icon="save-outline" onPress={doExport} loading={exporting} testID="export-btn" />
        </Card>

        <View style={{ height: spacing.lg }} />

        <Card style={styles.card} testID="import-card">
          <View style={styles.cardHead}>
            <Ionicons name="refresh-outline" size={22} color={colors.brand} />
            <Text style={styles.cardTitle}>Pulihkan Data</Text>
          </View>
          <Text style={styles.cardDesc}>Pilih file cadangan .json untuk memuat kembali data Anda ke aplikasi.</Text>
          {lastResult && <Text style={styles.resultText}>✓ {lastResult}</Text>}
          <View style={{ height: spacing.md }} />
          <PrimaryButton label="Muat Data" icon="folder-open-outline" onPress={doImport} loading={importing} variant="ghost" testID="import-btn" />
        </Card>

        <View style={styles.infoRow}>
          <Ionicons name="information-circle-outline" size={18} color={colors.onSurfaceTertiary} />
          <Text style={styles.infoText}>
            Cadangan berisi data teks. Foto & berkas tersimpan aman di penyimpanan awan dan tetap dapat diakses.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { color: colors.onSurface, fontSize: font.xl, fontWeight: "700" },
  hero: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  heroTitle: { color: colors.onSurface, fontSize: font["2xl"], fontWeight: "800" },
  heroSub: { color: colors.onSurfaceTertiary, fontSize: font.base, textAlign: "center", paddingHorizontal: spacing.md, lineHeight: 20 },
  card: {},
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  cardTitle: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  cardDesc: { color: colors.onSurfaceTertiary, fontSize: font.base, lineHeight: 20 },
  resultText: { color: colors.success, fontSize: font.base, fontWeight: "600", marginTop: spacing.sm },
  infoRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl, paddingHorizontal: spacing.xs },
  infoText: { color: colors.onSurfaceTertiary, fontSize: font.sm, flex: 1, lineHeight: 18 },
});
