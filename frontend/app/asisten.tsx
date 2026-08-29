import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, font } from "@/src/theme/theme";
import { aiChat, aiParse, aiHistory, aiClearHistory, apiGet, apiPost, ParsedTx } from "@/src/api/client";
import { Wallet, categoryMeta, walletTypeMeta } from "@/src/types";
import { formatRupiah, formatDateShort } from "@/src/utils/format";
import { Segmented, haptic } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";

type Mode = "chat" | "quick";
interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  tx?: ParsedTx;
  saved?: boolean;
}

const CHAT_SUGGESTIONS = [
  "Berapa total pengeluaran saya?",
  "Beri tips hemat bulan ini",
  "Apa jadwal & tugas saya hari ini?",
];
const QUICK_SUGGESTIONS = [
  "beli makan siang 25rb pakai DANA",
  "gaji masuk 5jt ke bank",
  "bayar listrik 150rb tunai",
];

export default function AsistenScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const scrollRef = useRef<ScrollView>(null);

  const [mode, setMode] = useState<Mode>("chat");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [wallets, setWallets] = useState<Wallet[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [hist, wl] = await Promise.all([aiHistory(), apiGet<Wallet[]>("/wallets")]);
        setWallets(wl);
        if (hist.length) {
          setMessages(hist.map((h, i) => ({ id: `h-${i}`, role: h.role as any, content: h.content })));
        }
      } catch {}
    })();
  }, []);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    haptic("light");
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: q };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);
    scrollDown();
    try {
      if (mode === "chat") {
        const res = await aiChat(q);
        setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: res.reply }]);
      } else {
        const tx = await aiParse(q);
        setMessages((m) => [
          ...m,
          { id: `a-${Date.now()}`, role: "assistant", content: "Saya menangkap transaksi berikut. Periksa lalu simpan:", tx },
        ]);
      }
    } catch (e: any) {
      const msg = e?.message?.includes("422")
        ? "Maaf, saya belum paham. Coba tulis lebih jelas, mis: 'beli kopi 20rb tunai'."
        : "Asisten sedang sibuk, coba lagi sebentar.";
      setMessages((m) => [...m, { id: `e-${Date.now()}`, role: "assistant", content: msg }]);
    } finally {
      setBusy(false);
      scrollDown();
    }
  };

  const saveTx = async (msgId: string, tx: ParsedTx, walletId: string) => {
    try {
      await apiPost("/transactions", { ...tx, wallet_id: walletId });
      haptic("success");
      toast.show("Transaksi tersimpan", "success");
      setMessages((m) => m.map((x) => (x.id === msgId ? { ...x, saved: true, tx: { ...tx, wallet_id: walletId } } : x)));
    } catch {
      toast.show("Gagal menyimpan", "error");
    }
  };

  const clearChat = async () => {
    haptic("light");
    setMessages([]);
    try {
      await aiClearHistory();
    } catch {}
  };

  const suggestions = mode === "chat" ? CHAT_SUGGESTIONS : QUICK_SUGGESTIONS;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="ai-back">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={styles.aiDot}>
            <Ionicons name="sparkles" size={16} color={colors.onBrand} />
          </View>
          <Text style={styles.headerTitle}>Asisten AI</Text>
        </View>
        <Pressable onPress={clearChat} hitSlop={12} testID="ai-clear">
          <Ionicons name="trash-outline" size={22} color={colors.onSurfaceTertiary} />
        </Pressable>
      </View>

      <View style={styles.segmentWrap}>
        <Segmented
          testID="ai-mode"
          value={mode}
          onChange={(k) => setMode(k as Mode)}
          options={[
            { key: "chat", label: "Ngobrol" },
            { key: "quick", label: "Catat Cepat" },
          ]}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.top + 8}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollDown}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 && (
            <View style={styles.welcome} testID="ai-welcome">
              <View style={styles.welcomeIcon}>
                <Ionicons name="sparkles" size={34} color={colors.brand} />
              </View>
              <Text style={styles.welcomeTitle}>
                {mode === "chat" ? "Tanya apa saja" : "Catat transaksi dengan bahasa biasa"}
              </Text>
              <Text style={styles.welcomeSub}>
                {mode === "chat"
                  ? "Saya bisa membantu soal keuangan, jadwal, dan tugas Anda."
                  : "Ketik seperti Anda bicara, saya ubah jadi transaksi otomatis."}
              </Text>
            </View>
          )}

          {messages.map((m) => (
            <Animated.View key={m.id} entering={FadeInDown.duration(220)}>
              {m.role === "user" ? (
                <View style={styles.userBubble} testID="ai-user-msg">
                  <Text style={styles.userText}>{m.content}</Text>
                </View>
              ) : (
                <View style={styles.assistantWrap}>
                  <View style={styles.assistantAvatar}>
                    <Ionicons name="sparkles" size={14} color={colors.brand} />
                  </View>
                  <View style={styles.assistantBubble} testID="ai-assistant-msg">
                    <Text style={styles.assistantText}>{m.content}</Text>
                    {m.tx && (
                      <TxCard
                        tx={m.tx}
                        wallets={wallets}
                        saved={!!m.saved}
                        onSave={(walletId) => saveTx(m.id, m.tx!, walletId)}
                      />
                    )}
                  </View>
                </View>
              )}
            </Animated.View>
          ))}

          {busy && (
            <Animated.View entering={FadeIn} style={styles.assistantWrap}>
              <View style={styles.assistantAvatar}>
                <Ionicons name="sparkles" size={14} color={colors.brand} />
              </View>
              <View style={[styles.assistantBubble, styles.typing]}>
                <ActivityIndicator color={colors.brand} size="small" />
                <Text style={styles.typingText}>Sedang mengetik…</Text>
              </View>
            </Animated.View>
          )}
        </ScrollView>

        {messages.length === 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.suggestScroll}
            contentContainerStyle={styles.suggestRow}
            keyboardShouldPersistTaps="handled"
          >
            {suggestions.map((s) => (
              <Pressable key={s} style={styles.suggestChip} onPress={() => send(s)} testID="ai-suggestion">
                <Text style={styles.suggestText}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={mode === "chat" ? "Tulis pesan…" : "mis: beli kopi 20rb pakai OVO"}
            placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
            multiline
            testID="ai-input"
            onSubmitEditing={() => send()}
          />
          <Pressable
            onPress={() => send()}
            disabled={!input.trim() || busy}
            style={[styles.sendBtn, (!input.trim() || busy) && { opacity: 0.4 }]}
            testID="ai-send"
          >
            <Ionicons name="arrow-up" size={22} color={colors.onBrand} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function TxCard({
  tx,
  wallets,
  saved,
  onSave,
}: {
  tx: ParsedTx;
  wallets: Wallet[];
  saved: boolean;
  onSave: (walletId: string) => void;
}) {
  const [walletId, setWalletId] = useState(tx.wallet_id || wallets[0]?.id || "");
  const meta = categoryMeta(tx.type, tx.category);
  return (
    <View style={styles.txCard} testID="ai-tx-card">
      <View style={styles.txHeadRow}>
        <View style={[styles.txIcon, { backgroundColor: meta.color + "22" }]}>
          <Ionicons name={meta.icon as any} size={18} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.txCategory}>{tx.category}</Text>
          <Text style={styles.txDate}>
            {formatDateShort(tx.date)} · {tx.type === "income" ? "Pemasukan" : "Pengeluaran"}
          </Text>
        </View>
        <Text style={[styles.txAmount, { color: tx.type === "income" ? colors.success : colors.onSurface }]}>
          {tx.type === "income" ? "+" : "-"}
          {formatRupiah(tx.amount)}
        </Text>
      </View>

      {!saved && (
        <>
          <Text style={styles.txWalletLabel}>Kantong</Text>
          <View style={styles.txWalletRow}>
            {wallets.map((w) => {
              const active = w.id === walletId;
              const wm = walletTypeMeta(w.type);
              return (
                <Pressable
                  key={w.id}
                  onPress={() => setWalletId(w.id)}
                  style={[styles.txWalletChip, active && { backgroundColor: wm.color + "33", borderColor: wm.color }]}
                  testID={`ai-wallet-${w.id}`}
                >
                  <Ionicons name={wm.icon as any} size={14} color={active ? wm.color : colors.onSurfaceTertiary} />
                  <Text style={[styles.txWalletText, active && { color: colors.onSurface }]}>{w.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={styles.txSaveBtn} onPress={() => onSave(walletId)} testID="ai-save-tx">
            <Ionicons name="checkmark-circle" size={18} color={colors.onBrand} />
            <Text style={styles.txSaveText}>Simpan Transaksi</Text>
          </Pressable>
        </>
      )}
      {saved && (
        <View style={styles.txSaved}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.txSavedText}>Tersimpan ke {wallets.find((w) => w.id === tx.wallet_id)?.name || "kantong"}</Text>
        </View>
      )}
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
  headerCenter: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  aiDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { color: colors.onSurface, fontSize: font.xl, fontWeight: "700" },
  segmentWrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  welcome: { alignItems: "center", paddingVertical: spacing["3xl"], gap: spacing.sm },
  welcomeIcon: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  welcomeTitle: { color: colors.onSurface, fontSize: font.xl, fontWeight: "800", textAlign: "center" },
  welcomeSub: { color: colors.onSurfaceTertiary, fontSize: font.base, textAlign: "center", paddingHorizontal: spacing.xl, lineHeight: 20 },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "82%",
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  userText: { color: colors.onBrand, fontSize: font.lg, fontWeight: "500", lineHeight: 22 },
  assistantWrap: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, maxWidth: "90%" },
  assistantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  assistantBubble: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  assistantText: { color: colors.onSurface, fontSize: font.lg, lineHeight: 22 },
  typing: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  typingText: { color: colors.onSurfaceTertiary, fontSize: font.base },
  suggestScroll: { flexGrow: 0, maxHeight: 44 },
  suggestRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  suggestChip: {
    flexShrink: 0,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  suggestText: { color: colors.onSurfaceSecondary, fontSize: font.base, fontWeight: "500" },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    color: colors.onSurface,
    fontSize: font.lg,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  txCard: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  txHeadRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  txIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  txCategory: { color: colors.onSurface, fontSize: font.lg, fontWeight: "700" },
  txDate: { color: colors.onSurfaceTertiary, fontSize: font.sm, marginTop: 2 },
  txAmount: { fontSize: font.lg, fontWeight: "800" },
  txWalletLabel: { color: colors.onSurfaceTertiary, fontSize: font.sm, fontWeight: "600", marginTop: spacing.md, marginBottom: spacing.sm },
  txWalletRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  txWalletChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  txWalletText: { color: colors.onSurfaceTertiary, fontSize: font.sm, fontWeight: "600" },
  txSaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    height: 46,
    marginTop: spacing.md,
  },
  txSaveText: { color: colors.onBrand, fontSize: font.lg, fontWeight: "700" },
  txSaved: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  txSavedText: { color: colors.success, fontSize: font.base, fontWeight: "600" },
});
