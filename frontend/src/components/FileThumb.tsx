import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { fileSource } from "@/src/api/client";
import { colors, font } from "@/src/theme/theme";

export function FileThumb({ fileId, style }: { fileId: string; style?: any }) {
  const [src, setSrc] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);

  useEffect(() => {
    let active = true;
    fileSource(fileId).then((s) => {
      if (active) setSrc(s);
    });
    return () => {
      active = false;
    };
  }, [fileId]);

  if (!src) {
    return (
      <View style={[style, styles.loading]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }
  return <Image source={src} style={style} contentFit="cover" transition={200} />;
}

export function FileIcon({ contentType, name }: { contentType: string; name: string }) {
  let icon = "document-outline";
  if (contentType.includes("pdf")) icon = "document-text";
  else if (contentType.includes("word") || contentType.includes("msword")) icon = "document-text";
  else if (contentType.includes("sheet") || contentType.includes("excel")) icon = "grid";
  else if (contentType.includes("zip") || contentType.includes("compressed")) icon = "archive";
  else if (contentType.startsWith("audio")) icon = "musical-notes";
  else if (contentType.startsWith("video")) icon = "videocam";
  return (
    <View style={styles.fileIconWrap}>
      <Ionicons name={icon as any} size={40} color={colors.brand} />
      <Text style={styles.fileName} numberOfLines={2}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  fileIconWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 8, gap: 8 },
  fileName: { color: colors.onSurfaceSecondary, fontSize: font.sm, textAlign: "center", fontWeight: "500" },
});
