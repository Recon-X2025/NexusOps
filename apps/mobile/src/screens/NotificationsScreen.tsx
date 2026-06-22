import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { trpc } from "@/lib/trpc";

export default function NotificationsScreen() {
  const q = trpc.notifications.list.useQuery(
    { limit: 50 },
    { staleTime: 15_000 },
  );
  const items = (q.data as any[]) ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alerts</Text>
      <Text style={styles.sub}>
        {q.isLoading ? "Loading…" : `${items.length} notifications`}
      </Text>

      {items.slice(0, 12).map((n: any) => (
        <View key={n.id} style={styles.card}>
          <Text style={styles.cardTitle}>{n.title ?? "Notification"}</Text>
          <Text style={styles.cardBody} numberOfLines={2}>
            {n.body ?? ""}
          </Text>
        </View>
      ))}

      {!q.isLoading && items.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No notifications yet.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 20 },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  sub: { fontSize: 12, color: "#6B7280", marginTop: 4, marginBottom: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 13, fontWeight: "700", color: "#111827" },
  cardBody: { fontSize: 12, color: "#4B5563", marginTop: 4 },
  empty: { paddingVertical: 24, alignItems: "center" },
  emptyText: { fontSize: 12, color: "#9CA3AF" },
});

