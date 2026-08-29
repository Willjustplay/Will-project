import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, font } from "@/src/theme/theme";
import { storage } from "@/src/utils/storage";
import { apiGet, apiPost, apiPut, apiDelete, uploadFile, fileSource } from "@/src/api/client";
import { VaultAccount, FileItem, FILE_FOLDERS } from "@/src/types";
import {
  Card,
  EmptyState,
  Fab,
  Field,
  PrimaryButton,
  Segmented,
  LoadingView,
  haptic,
} from "@/src/components/ui";
import { Sheet } from "@/src/components/Sheet";
import { PinPad } from "@/src/components/PinPad";
import { FileThumb, FileIcon } from "@/src/components/FileThumb";
import { useToast } from "@/src/components/Toast";

const PIN_KEY = "pv_vault_pin";
const { width } = Dimensions.get("window");
const GRID_GAP = spacing.md;
const COLS = 3;

export default function BrankasScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();

  // PIN state
  const [pinExists, setPinExists] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [entry, setEntry] = useState("");
  const [setupStage, setSetupStage] = useState<"create" | "confirm">("create");
  const [firstPin, setFirstPin] = useState("");
  const [pinError, setPinError] = useState(false);

  // content
  const [tab, setTab] = useState<"sandi" | "berkas">("sandi");
  const [accounts, setAccounts] = useState<VaultAccount[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // account form
  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [service, setService] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  // upload options + viewer
  const [uploadSheet, setUploadSheet] = useState(false);
  const [viewer, setViewer] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);

  // search & folders
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const [uploadFolder, setUploadFolder] = useState("Dokumen");

  const checkPin = useCallback(async () => {
    const stored = await storage.secureGet<string>(PIN_KEY, "");
    setPinExists(!!stored);
  }, []);

  useFocusEffect(
    useCallback(() => {
      checkPin();
      return () => {
        // Lock again when leaving the tab
        setUnlocked(false);
        setEntry("");
        setSetupStage("create");
        setFirstPin("");
      };
    }, [checkPin])
  );

  const loadContent = useCallback(async () => {
    setLoading(true);
    try {
      const [acc, fl] = await Promise.all([apiGet<VaultAccount[]>("/vault"), apiGet<FileItem[]>("/files")]);
      setAccounts(acc);
      setFiles(fl);
    } catch {
      toast.show("Gagal memuat brankas", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadContent();
    setRefreshing(false);
  }, [loadContent]);

  // ---- PIN handlers ----
  const handleKey = async (k: string) => {
    setPinError(false);
    if (pinExists) {
      // enter mode
      let next = entry;
      if (k === "del") next = entry.slice(0, -1);
      else if (entry.length < 4) next = entry + k;
      setEntry(next);
      if (next.length === 4) {
        const stored = await storage.secureGet<string>(PIN_KEY, "");
        if (next === stored) {
          haptic("success");
          setUnlocked(true);
          setEntry("");
          loadContent();
        } else {
          setPinError(true);
          setTimeout(() => setEntry(""), 400);
        }
      }
    } else {
      // setup mode
      if (setupStage === "create") {
        let next = entry;
        if (k === "del") next = entry.slice(0, -1);
        else if (entry.length < 4) next = entry + k;
        setEntry(next);
        if (next.length === 4) {
          setFirstPin(next);
          setTimeout(() => {
            setEntry("");
            setSetupStage("confirm");
          }, 200);
        }
      } else {
        let next = entry;
        if (k === "del") next = entry.slice(0, -1);
        else if (entry.length < 4) next = entry + k;
        setEntry(next);
        if (next.length === 4) {
          if (next === firstPin) {
            await storage.secureSet(PIN_KEY, next);
            haptic("success");
            toast.show("PIN berhasil dibuat", "success");
            setPinExists(true);
            setUnlocked(true);
            setEntry("");
            loadContent();
          } else {
            setPinError(true);
            toast.show("PIN tidak cocok, coba lagi", "error");
            setTimeout(() => {
              setEntry("");
              setSetupStage("create");
              setFirstPin("");
            }, 400);
          }
        }
      }
    }
  };

  // ---- account handlers ----
  const openAddAccount = () => {
    setEditId(null);
    setService("");
    setUsername("");
    setPassword("");
    setNote("");
    setShowPw(false);
    setSheet(true);
  };

  const openEditAccount = (a: VaultAccount) => {
    setEditId(a.id);
    setService(a.service);
    setUsername(a.username);
    setPassword(a.password);
    setNote(a.note || "");
    setShowPw(false);
    setSheet(true);
  };

  const saveAccount = async () => {
    if (!service.trim() || !username.trim() || !password) {
      toast.show("Lengkapi aplikasi, username & sandi", "error");
      return;
    }
    setSaving(true);
    try {
      const body = { service: service.trim(), username: username.trim(), password, note };
      if (editId) await apiPut(`/vault/${editId}`, body);
      else await apiPost("/vault", body);
      haptic("success");
      toast.show("Akun disimpan", "success");
      setSheet(false);
      await loadContent();
    } catch {
      toast.show("Gagal menyimpan", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async (id: string) => {
    setAccounts((p) => p.filter((a) => a.id !== id));
    apiDelete(`/vault/${id}`).catch(loadContent);
    haptic("light");
  };

  const copyValue = async (val: string, label: string) => {
    await Clipboard.setStringAsync(val);
    haptic("success");
    toast.show(`${label} disalin`, "success");
  };

  // ---- file handlers ----
  const pickImage = async () => {
    setUploadSheet(false);
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted" && perm.canAskAgain) {
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") {
      toast.show("Izin galeri ditolak. Buka Pengaturan untuk mengizinkan.", "error");
      setTimeout(() => Linking.openSettings(), 600);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const name = asset.fileName || `image-${Date.now()}.jpg`;
    await doUpload(asset.uri, name, asset.mimeType || "image/jpeg");
  };

  const pickDocument = async () => {
    setUploadSheet(false);
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    await doUpload(asset.uri, asset.name, asset.mimeType || "application/octet-stream");
  };

  const doUpload = async (uri: string, name: string, type: string) => {
    setUploading(true);
    try {
      await uploadFile(uri, name, type, uploadFolder);
      haptic("success");
      toast.show("Berkas diunggah", "success");
      await loadContent();
    } catch (e: any) {
      if (e?.message === "PENYIMPANAN_PENUH") toast.show("Penyimpanan penuh", "error");
      else toast.show("Gagal mengunggah", "error");
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = async (id: string) => {
    setFiles((p) => p.filter((f) => f.id !== id));
    apiDelete(`/files/${id}`).catch(loadContent);
    haptic("light");
  };

  const openFile = async (f: FileItem) => {
    if (f.kind === "image") {
      const s = await fileSource(f.id);
      setViewer(s);
    } else {
      toast.show(`${f.filename}`, "info");
    }
  };

  const cellSize = (width - spacing.lg * 2 - GRID_GAP * (COLS - 1)) / COLS;

  const q = search.trim().toLowerCase();
  const filteredAccounts = accounts.filter(
    (a) => !q || a.service.toLowerCase().includes(q) || a.username.toLowerCase().includes(q)
  );
  const filteredFiles = files.filter((f) => {
    const okFolder = folderFilter === "all" || (f.folder || "Lainnya") === folderFilter;
    return okFolder && (!q || f.filename.toLowerCase().includes(q));
  });

  // ---- render PIN gate ----
  if (pinExists === null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LoadingView />
      </View>
    );
  }

  if (!unlocked) {
    const title = pinExists ? "Masukkan PIN" : setupStage === "create" ? "Buat PIN Brankas" : "Konfirmasi PIN";
    const subtitle = pinExists
      ? "Masukkan PIN 4 digit untuk membuka brankas"
      : setupStage === "create"
      ? "Buat PIN 4 digit untuk mengamankan brankas Anda"
      : "Masukkan kembali PIN Anda";
    return (
      <View style={[styles.container, { paddingTop: insets.top }]} testID="pin-gate">
        <PinPad title={title} subtitle={subtitle} value={entry} onKey={handleKey} error={pinError} />
      </View>
    );
  }

  // ---- render unlocked ----
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Brankas</Text>
        <Ionicons name="shield-checkmark" size={24} color={colors.brand} />
      </View>

      <View style={styles.segmentWrap}>
        <Segmented
          testID="vault-tabs"
          value={tab}
          onChange={(k) => {
            setTab(k as any);
            setSearch("");
          }}
          options={[
            { key: "sandi", label: "Sandi" },
            { key: "berkas", label: "Berkas" },
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
          {tab === "sandi" && accounts.length > 0 && (
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Cari akun atau username..."
                placeholderTextColor={colors.onSurfaceTertiary}
                style={styles.searchInput}
                testID="sandi-search"
                autoCapitalize="none"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")} hitSlop={8} testID="sandi-search-clear">
                  <Ionicons name="close-circle" size={18} color={colors.onSurfaceTertiary} />
                </Pressable>
              )}
            </View>
          )}
          {tab === "sandi" &&
            (accounts.length === 0 ? (
              <EmptyState
                testID="sandi-empty"
                image="https://images.unsplash.com/photo-1699275303913-7ef75b618dd6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2ODh8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGZvbGRlciUyMGRhcmt8ZW58MHx8fHwxNzg4MDAzNzM1fDA&ixlib=rb-4.1.0&q=85"
                title="Brankas sandi kosong"
                subtitle="Simpan akun & sandi berbagai aplikasi dengan aman"
              />
            ) : (
              filteredAccounts.map((a, i) => (
                <Animated.View key={a.id} entering={FadeInDown.delay(i * 30)}>
                  <Card style={styles.accountCard} testID={`account-${a.id}`}>
                    <View style={styles.accountHead}>
                      <View style={styles.serviceIcon}>
                        <Text style={styles.serviceInitial}>{a.service.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.serviceName}>{a.service}</Text>
                        <Text style={styles.serviceUser}>{a.username}</Text>
                      </View>
                      <Pressable onPress={() => openEditAccount(a)} hitSlop={10} testID={`edit-${a.id}`}>
                        <Ionicons name="create-outline" size={20} color={colors.onSurfaceTertiary} />
                      </Pressable>
                      <Pressable onPress={() => deleteAccount(a.id)} hitSlop={10} testID={`delete-account-${a.id}`}>
                        <Ionicons name="trash-outline" size={20} color={colors.error} />
                      </Pressable>
                    </View>
                    <View style={styles.pwRow}>
                      <Text style={styles.pwText}>
                        {revealed[a.id] ? a.password : "•".repeat(Math.min(a.password.length, 12))}
                      </Text>
                      <Pressable
                        onPress={() => setRevealed((p) => ({ ...p, [a.id]: !p[a.id] }))}
                        hitSlop={8}
                        testID={`reveal-${a.id}`}
                      >
                        <Ionicons name={revealed[a.id] ? "eye-off" : "eye"} size={18} color={colors.brand} />
                      </Pressable>
                      <Pressable onPress={() => copyValue(a.password, "Sandi")} hitSlop={8} testID={`copy-pw-${a.id}`}>
                        <Ionicons name="copy-outline" size={18} color={colors.brand} />
                      </Pressable>
                    </View>
                    {!!a.note && <Text style={styles.accountNote}>{a.note}</Text>}
                  </Card>
                </Animated.View>
              ))
            ))}
          {tab === "sandi" && accounts.length > 0 && filteredAccounts.length === 0 && (
            <Text style={styles.noMatch}>Tidak ada hasil untuk &quot;{search}&quot;</Text>
          )}

          {tab === "berkas" && files.length > 0 && (
            <>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color={colors.onSurfaceTertiary} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Cari berkas..."
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={styles.searchInput}
                  testID="berkas-search"
                  autoCapitalize="none"
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch("")} hitSlop={8} testID="berkas-search-clear">
                    <Ionicons name="close-circle" size={18} color={colors.onSurfaceTertiary} />
                  </Pressable>
                )}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.folderRow}
                testID="folder-row"
              >
                <Pressable
                  testID="folder-all"
                  onPress={() => { haptic("light"); setFolderFilter("all"); }}
                  style={[styles.folderChip, folderFilter === "all" && styles.folderChipActive]}
                >
                  <Text style={[styles.folderChipText, folderFilter === "all" && styles.folderChipTextActive]}>Semua</Text>
                </Pressable>
                {FILE_FOLDERS.map((f) => {
                  const active = folderFilter === f;
                  return (
                    <Pressable
                      key={f}
                      testID={`folder-${f}`}
                      onPress={() => { haptic("light"); setFolderFilter(f); }}
                      style={[styles.folderChip, active && styles.folderChipActive]}
                    >
                      <Text style={[styles.folderChipText, active && styles.folderChipTextActive]}>{f}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}

          {tab === "berkas" &&
            (files.length === 0 ? (
              <EmptyState
                testID="berkas-empty"
                image="https://images.unsplash.com/photo-1699275303913-7ef75b618dd6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2ODh8MHwxfHNlYXJjaHwxfHxlbXB0eSUyMGZvbGRlciUyMGRhcmt8ZW58MHx8fHwxNzg4MDAzNzM1fDA&ixlib=rb-4.1.0&q=85"
                title="Belum ada berkas"
                subtitle="Simpan foto, gambar, dan dokumen penting Anda"
              />
            ) : (
              <View style={styles.grid}>
                {filteredFiles.map((f) => (
                  <Pressable
                    key={f.id}
                    testID={`file-${f.id}`}
                    onPress={() => openFile(f)}
                    onLongPress={() => deleteFile(f.id)}
                    style={[styles.gridCell, { width: cellSize, height: cellSize }]}
                  >
                    {f.kind === "image" ? (
                      <FileThumb fileId={f.id} style={{ width: "100%", height: "100%", borderRadius: radius.md }} />
                    ) : (
                      <FileIcon contentType={f.content_type} name={f.filename} />
                    )}
                    <View style={styles.delBadge}>
                      <Ionicons name="close" size={14} color={colors.onError} />
                    </View>
                  </Pressable>
                ))}
              </View>
            ))}
          {tab === "berkas" && files.length > 0 && filteredFiles.length === 0 && (
            <Text style={styles.noMatch}>Tidak ada berkas ditemukan</Text>
          )}
          {tab === "berkas" && filteredFiles.length > 0 && <Text style={styles.hint}>Tekan lama untuk menghapus</Text>}
        </ScrollView>
      )}

      <View style={[styles.fabWrap, { bottom: spacing.xl }]}>
        {uploading ? (
          <View style={styles.uploadingFab}>
            <ActivityIndicator color={colors.onBrand} />
          </View>
        ) : (
          <Fab
            testID="vault-fab"
            onPress={() => (tab === "sandi" ? openAddAccount() : setUploadSheet(true))}
            icon={tab === "sandi" ? "add" : "cloud-upload"}
          />
        )}
      </View>

      {/* Account form sheet */}
      <Sheet visible={sheet} onClose={() => setSheet(false)} title={editId ? "Edit Akun" : "Tambah Akun"} testID="account-sheet">
        <Field label="Aplikasi / Layanan" icon="apps-outline" value={service} onChangeText={setService} placeholder="Contoh: Instagram" testID="acc-service" />
        <Field label="Username / Email" icon="person-outline" value={username} onChangeText={setUsername} placeholder="Username atau email" autoCapitalize="none" testID="acc-username" />
        <View style={styles.pwFieldWrap}>
          <Text style={styles.pwLabel}>Kata Sandi</Text>
          <View style={styles.pwInputRow}>
            <Ionicons name="key-outline" size={18} color={colors.onSurfaceTertiary} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Kata sandi"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              testID="acc-password"
              style={styles.pwInputInner}
            />
            <Pressable onPress={() => setShowPw((s) => !s)} hitSlop={8} testID="acc-toggle-pw">
              <Ionicons name={showPw ? "eye-off" : "eye"} size={20} color={colors.brand} />
            </Pressable>
          </View>
        </View>
        <Field label="Catatan (opsional)" icon="create-outline" value={note} onChangeText={setNote} placeholder="Tambah catatan" testID="acc-note" />
        <View style={{ height: spacing.sm }} />
        <PrimaryButton label="Simpan Akun" onPress={saveAccount} loading={saving} testID="acc-save" />
      </Sheet>

      {/* Upload options sheet */}
      <Sheet visible={uploadSheet} onClose={() => setUploadSheet(false)} title="Unggah Berkas" testID="upload-sheet">
        <Text style={styles.uploadFolderLabel}>Simpan ke folder</Text>
        <View style={styles.folderPickRow}>
          {FILE_FOLDERS.map((f) => {
            const active = uploadFolder === f;
            return (
              <Pressable
                key={f}
                testID={`upload-folder-${f}`}
                onPress={() => { haptic("light"); setUploadFolder(f); }}
                style={[styles.folderPick, active && styles.folderPickActive]}
              >
                <Text style={[styles.folderPickText, active && styles.folderChipTextActive]}>{f}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ height: spacing.lg }} />
        <Pressable style={styles.uploadOption} onPress={pickImage} testID="upload-image">
          <View style={styles.uploadIcon}>
            <Ionicons name="image" size={24} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.uploadOptTitle}>Foto / Gambar</Text>
            <Text style={styles.uploadOptSub}>Pilih dari galeri</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
        </Pressable>
        <View style={{ height: spacing.md }} />
        <Pressable style={styles.uploadOption} onPress={pickDocument} testID="upload-document">
          <View style={styles.uploadIcon}>
            <Ionicons name="document" size={24} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.uploadOptTitle}>Dokumen / Berkas</Text>
            <Text style={styles.uploadOptSub}>PDF, dokumen, dan lainnya</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
        </Pressable>
      </Sheet>

      {/* Image viewer */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewerBackdrop}>
          <Pressable style={styles.viewerClose} onPress={() => setViewer(null)} testID="viewer-close">
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          {viewer && <Image source={viewer} style={styles.viewerImage} contentFit="contain" />}
        </View>
      </Modal>
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
    paddingTop: spacing.sm,
  },
  headerTitle: { color: colors.onSurface, fontSize: font["3xl"], fontWeight: "800" },
  segmentWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontSize: font.lg },
  noMatch: { color: colors.onSurfaceTertiary, fontSize: font.base, textAlign: "center", paddingVertical: spacing.xl },
  folderRow: { gap: spacing.sm, paddingRight: spacing.lg, paddingBottom: spacing.md },
  folderChip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  folderChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  folderChipText: { color: colors.onSurfaceTertiary, fontSize: font.base, fontWeight: "600" },
  folderChipTextActive: { color: colors.onBrand, fontWeight: "700" },
  uploadFolderLabel: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginBottom: spacing.sm, fontWeight: "600" },
  folderPickRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  folderPick: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  folderPickActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  folderPickText: { color: colors.onSurfaceTertiary, fontSize: font.base, fontWeight: "600" },
  accountCard: { marginBottom: spacing.md },
  accountHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  serviceIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceInitial: { color: colors.brand, fontSize: font.xl, fontWeight: "800" },
  serviceName: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  serviceUser: { color: colors.onSurfaceTertiary, fontSize: font.base, marginTop: 2 },
  pwRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  pwText: { flex: 1, color: colors.onSurface, fontSize: font.lg, fontWeight: "600", letterSpacing: 1 },
  accountNote: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginTop: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP },
  gridCell: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  delBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: { color: colors.onSurfaceTertiary, fontSize: font.sm, textAlign: "center", marginTop: spacing.md },
  fabWrap: { position: "absolute", right: spacing.lg },
  uploadingFab: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  pwFieldWrap: { marginBottom: spacing.md },
  pwLabel: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginBottom: spacing.xs, fontWeight: "600" },
  pwInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pwInputInner: { flex: 1, color: colors.onSurface, fontSize: font.lg, paddingVertical: 14 },
  uploadOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  uploadIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadOptTitle: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  uploadOptSub: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginTop: 2 },
  viewerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerClose: { position: "absolute", top: 60, right: 24, zIndex: 10 },
  viewerImage: { width: "92%", height: "80%" },
});
