/**
 * CoheronConnect Mobile — Approvals Screen
 * Two views:
 *   - "Mine": pending approvals routed to the signed-in user (actionable).
 *   - "Team": pending approvals across the manager's reporting chain (read-only).
 * Approve/Reject prompt for an optional reason via a modal before deciding.
 */

import React, { useState } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Modal, TextInput,
} from "react-native";
import { trpc } from "@/lib/trpc";

type Tab = "mine" | "team";
type PendingDecision = { id: string; decision: "approved" | "rejected" } | null;

export default function ApprovalsScreen() {
  const [tab, setTab] = useState<Tab>("mine");
  const [pending, setPending] = useState<PendingDecision>(null);
  const [reason, setReason] = useState("");

  const mineQ = trpc.approvals.myPending.useQuery(undefined);
  const teamQ = trpc.approvals.myTeamPending.useQuery(undefined, { enabled: tab === "team" });
  const utils = trpc.useUtils();

  const decideMut = trpc.approvals.decide.useMutation({
    onSuccess: () => {
      void utils.approvals.myPending.invalidate();
      void utils.approvals.myTeamPending.invalidate();
      closeModal();
    },
    onError: (e: any) => Alert.alert("Error", e?.message ?? "Failed"),
  });

  const activeQ = tab === "mine" ? mineQ : teamQ;
  const items = (activeQ.data ?? []) as any[];

  function openDecision(id: string, decision: "approved" | "rejected") {
    setPending({ id, decision });
    setReason("");
  }

  function closeModal() {
    setPending(null);
    setReason("");
  }

  function confirmDecision() {
    if (!pending) return;
    const comment = reason.trim();
    decideMut.mutate({
      requestId: pending.id,
      decision: pending.decision,
      ...(comment ? { comment } : {}),
    });
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
        {tab === "team" && (
          <Text style={styles.meta}>Assigned to: {item.assignedTo ?? "—"}</Text>
        )}

        {isBoardResolution && (
          <View style={styles.boardBadge}>
            <Text style={styles.boardBadgeText}>Requires Director Sign-off</Text>
          </View>
        )}

        {tab === "mine" ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.approveBtn]}
              onPress={() => openDecision(item.id, "approved")}
              disabled={decideMut.isPending}
            >
              <Text style={[styles.btnText, { color: "#065F46" }]}>✓ Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.rejectBtn]}
              onPress={() => openDecision(item.id, "rejected")}
              disabled={decideMut.isPending}
            >
              <Text style={[styles.btnText, { color: "#991B1B" }]}>✕ Reject</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.awaitingPill}>
            <Text style={styles.awaitingText}>Awaiting decision</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Approvals</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{items.length}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === "mine" && styles.tabActive]}
          onPress={() => setTab("mine")}
        >
          <Text style={[styles.tabText, tab === "mine" && styles.tabTextActive]}>Mine</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "team" && styles.tabActive]}
          onPress={() => setTab("team")}
        >
          <Text style={[styles.tabText, tab === "team" && styles.tabTextActive]}>Team</Text>
        </TouchableOpacity>
      </View>

      {activeQ.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{tab === "mine" ? "🎉 No pending approvals" : "👥 Team is all caught up"}</Text>
          <Text style={styles.emptySub}>
            {tab === "mine" ? "All caught up!" : "No pending approvals across your reports."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i: any) => i.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={activeQ.isFetching}
              onRefresh={() => void activeQ.refetch()}
              tintColor="#4F46E5"
            />
          }
          contentContainerStyle={{ padding: 16, gap: 10 }}
        />
      )}

      <Modal visible={pending !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {pending?.decision === "approved" ? "Approve request" : "Reject request"}
            </Text>
            <Text style={styles.modalSub}>
              Add an optional reason for this {pending?.decision === "approved" ? "approval" : "rejection"}.
            </Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Reason (optional)"
              placeholderTextColor="#9CA3AF"
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={closeModal}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  pending?.decision === "approved" ? styles.modalApprove : styles.modalReject,
                ]}
                onPress={confirmDecision}
                disabled={decideMut.isPending}
              >
                <Text style={styles.modalConfirmText}>
                  {decideMut.isPending
                    ? "…"
                    : pending?.decision === "approved"
                      ? "Approve"
                      : "Reject"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: "#EEF2FF",
    borderRadius: 10,
    padding: 3,
  },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  tabActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  tabTextActive: { color: "#4F46E5" },
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
  meta: { fontSize: 12, color: "#6B7280", marginBottom: 4 },
  actions: { flexDirection: "row", gap: 8, marginTop: 6 },
  btn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  approveBtn: { backgroundColor: "#D1FAE5" },
  rejectBtn: { backgroundColor: "#FEE2E2" },
  btnText: { fontSize: 13, fontWeight: "600" },
  awaitingPill: {
    alignSelf: "flex-start",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
  },
  awaitingText: { fontSize: 11, fontWeight: "700", color: "#92400E" },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  modalSub: { fontSize: 13, color: "#6B7280" },
  reasonInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: "#111827",
    minHeight: 72,
  },
  modalActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  modalBtn: { flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: "center" },
  modalCancel: { backgroundColor: "#F3F4F6" },
  modalCancelText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  modalApprove: { backgroundColor: "#059669" },
  modalReject: { backgroundColor: "#DC2626" },
  modalConfirmText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
