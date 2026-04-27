/**
 * NexusOps Mobile — Approvals Screen
 * Lists pending approvals for the signed-in user.
 */

import React from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from "react-native";
import { trpc } from "@/lib/trpc";

export default function ApprovalsScreen() {
  const approvalsQ = trpc.approvals.myPending.useQuery(undefined);
  const utils = trpc.useUtils();

  const decideMut = trpc.approvals.decide.useMutation({
    onSuccess: () => void utils.approvals.myPending.invalidate(),
    onError: (e: any) => Alert.alert("Error", e?.message ?? "Failed"),
  });

  const items = (approvalsQ.data ?? []) as any[];

  function handleApprove(id: string) {
    Alert.alert("Approve?", "Confirm approval of this request.", [
      { text: "Cancel", style: "cancel" },
      { text: "Approve", onPress: () => decideMut.mutate({ requestId: id, decision: "approved", comment: "Approved from mobile" }) },
    ]);
  }

  function handleReject(id: string) {
    Alert.alert("Reject?", "Confirm rejection of this request.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reject", style: "destructive", onPress: () => decideMut.mutate({ requestId: id, decision: "rejected", comment: "Rejected from mobile" }) },
    ]);
  }

  function renderItem({ item }: { item: any }) {
    const isBoardResolution = item.type === "board_resolution" || item.entityType === "board_resolution";

    return (
      <View style={[styles.card, isBoardResolution && styles.boardCard]}>
        <View style={styles.cardRow}>
          <Text style={[styles.type, isBoardResolution && styles.boardType]}>
            {isBoardResolution ? "🏛️ Board Resolution" : (item.type ?? "Request").replace(/_/g, " ")}
          </Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString("en-IN")}</Text>
        </View>
        <Text style={[styles.subject, isBoardResolution && styles.boardSubject]} numberOfLines={2}>
          {item.title ?? item.subject ?? item.entityType ?? "Approval Request"}
        </Text>
        <Text style={styles.meta}>Requested by: {item.requestedBy ?? item.requestedByName ?? "—"}</Text>

        {isBoardResolution && (
          <View style={styles.boardBadge}>
            <Text style={styles.boardBadgeText}>Requires Director Sign-off</Text>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.approveBtn]}
            onPress={() => handleApprove(item.id)}
            disabled={decideMut.isPending}
          >
            <Text style={[styles.btnText, { color: "#065F46" }]}>✓ Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.rejectBtn]}
            onPress={() => handleReject(item.id)}
            disabled={decideMut.isPending}
          >
            <Text style={[styles.btnText, { color: "#991B1B" }]}>✕ Reject</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (approvalsQ.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Pending Approvals</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{items.length}</Text>
        </View>
      </View>
      {items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>🎉 No pending approvals</Text>
          <Text style={styles.emptySub}>All caught up!</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i: any) => i.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={approvalsQ.isFetching}
              onRefresh={() => void approvalsQ.refetch()}
              tintColor="#4F46E5"
            />
          }
          contentContainerStyle={{ padding: 16, gap: 10 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 16,
    paddingBottom: 8,
  },
  headerText: { fontSize: 17, fontWeight: "700", color: "#111827", flex: 1 },
  badge: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: "#5B21B6" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  type: { fontSize: 10, fontWeight: "700", color: "#7C3AED", textTransform: "uppercase", letterSpacing: 0.5 },
  date: { fontSize: 11, color: "#9CA3AF" },
  subject: { fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 4 },
  meta: { fontSize: 12, color: "#6B7280", marginBottom: 10 },
  actions: { flexDirection: "row", gap: 8 },
  btn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  approveBtn: { backgroundColor: "#D1FAE5" },
  rejectBtn: { backgroundColor: "#FEE2E2" },
  btnText: { fontSize: 13, fontWeight: "600" },
  empty: { fontSize: 20 },
  emptySub: { fontSize: 14, color: "#9CA3AF" },
  boardCard: { borderLeftWidth: 4, borderLeftColor: "#7C3AED", backgroundColor: "#F5F3FF" },
  boardType: { color: "#5B21B6" },
  boardSubject: { color: "#1E1B4B" },
  boardBadge: {
    backgroundColor: "#DDD6FE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  boardBadgeText: { fontSize: 10, fontWeight: "800", color: "#4C1D95", textTransform: "uppercase" },
});
