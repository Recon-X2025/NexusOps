/**
 * NexusOps Mobile — Tickets List Screen
 */

import React, { useState } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, TextInput, RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#EF4444",
  high:     "#F97316",
  medium:   "#EAB308",
  low:      "#6B7280",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open:        { bg: "#DBEAFE", text: "#1D4ED8" },
  in_progress: { bg: "#FEF3C7", text: "#92400E" },
  resolved:    { bg: "#D1FAE5", text: "#065F46" },
  closed:      { bg: "#F3F4F6", text: "#6B7280" },
};

export default function TicketsScreen() {
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);

  const ticketsQ = trpc.tickets.list.useQuery({
    limit: 30,
    search: search || undefined,
  }, { keepPreviousData: true });

  const tickets = (ticketsQ.data as any)?.items ?? [];

  function renderTicket({ item }: { item: any }) {
    const sc = STATUS_COLORS[item.status] ?? STATUS_COLORS.open;
    const pc = PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.low;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/tickets/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.ticketNumber}>{item.number}</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <View style={[styles.badge, { backgroundColor: sc.bg }]}>
              <Text style={[styles.badgeText, { color: sc.text }]}>{item.status?.replace("_", " ")}</Text>
            </View>
            <View style={[styles.priorityDot, { backgroundColor: pc }]} />
          </View>
        </View>
        <Text style={styles.ticketTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.ticketMeta}>
          {item.assigneeName ?? "Unassigned"} · {new Date(item.createdAt).toLocaleDateString("en-IN")}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchBar}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search tickets…"
          style={styles.searchInput}
          placeholderTextColor="#9CA3AF"
          clearButtonMode="while-editing"
        />
      </View>

      {ticketsQ.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      ) : tickets.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No tickets found</Text>
        </View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(i: any) => i.id}
          renderItem={renderTicket}
          refreshControl={
            <RefreshControl
              refreshing={ticketsQ.isFetching}
              onRefresh={() => void ticketsQ.refetch()}
              tintColor="#4F46E5"
            />
          }
          contentContainerStyle={{ padding: 16, gap: 10 }}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => router.push("/tickets/new")}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  searchBar: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  searchInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
  },
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  ticketNumber: { fontSize: 11, fontFamily: "monospace", color: "#9CA3AF" },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: "600", textTransform: "capitalize" },
  priorityDot: { width: 8, height: 8, borderRadius: 4, alignSelf: "center" },
  ticketTitle: { fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 6 },
  ticketMeta: { fontSize: 11, color: "#9CA3AF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 14, color: "#9CA3AF" },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#4F46E5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: { color: "#fff", fontSize: 28, fontWeight: "300", marginTop: -2 },
});
