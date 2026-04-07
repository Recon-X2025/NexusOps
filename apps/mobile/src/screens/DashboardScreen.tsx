/**
 * NexusOps Mobile — Dashboard / Home Screen
 */

import React from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/lib/auth-store";

export default function DashboardScreen() {
  const userName  = useAuthStore(s => s.userName);
  const statsQ    = trpc.dashboard.stats.useQuery({}, { staleTime: 30_000 });
  const stats     = (statsQ.data as any) ?? {};

  const KPI_CARDS = [
    { label: "Open Tickets",    value: stats.openTickets    ?? "—", color: "#4F46E5", route: "/(tabs)/tickets" },
    { label: "Pending Approvals", value: stats.pendingApprovals ?? "—", color: "#F59E0B", route: "/(tabs)/approvals" },
    { label: "Open Incidents", value: stats.openIncidents  ?? "—", color: "#EF4444", route: "/(tabs)/tickets" },
    { label: "Assets",         value: stats.totalAssets    ?? "—", color: "#10B981", route: "/(tabs)/tickets" },
  ];

  const QUICK_ACTIONS = [
    { label: "New Ticket",    emoji: "🎫", route: "/tickets/new" },
    { label: "Submit Leave",  emoji: "🌴", route: "/leave/new" },
    { label: "Log Expense",   emoji: "💸", route: "/expenses/new" },
    { label: "Raise Change",  emoji: "⚙️", route: "/changes/new" },
  ];

  const firstName = userName?.split(" ")[0] ?? "User";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={statsQ.isFetching}
          onRefresh={() => void statsQ.refetch()}
          tintColor="#4F46E5"
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}, {firstName} 👋</Text>
          <Text style={styles.subGreeting}>Here's your operations snapshot</Text>
        </View>
      </View>

      {/* KPI grid */}
      {statsQ.isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#4F46E5" />
        </View>
      ) : (
        <View style={styles.grid}>
          {KPI_CARDS.map(k => (
            <TouchableOpacity
              key={k.label}
              style={[styles.kpiCard, { borderLeftColor: k.color }]}
              onPress={() => router.push(k.route as any)}
              activeOpacity={0.7}
            >
              <Text style={[styles.kpiValue, { color: k.color }]}>{k.value}</Text>
              <Text style={styles.kpiLabel}>{k.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        {QUICK_ACTIONS.map(a => (
          <TouchableOpacity
            key={a.label}
            style={styles.actionCard}
            onPress={() => router.push(a.route as any)}
            activeOpacity={0.7}
          >
            <Text style={styles.actionEmoji}>{a.emoji}</Text>
            <Text style={styles.actionLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  greeting: { fontSize: 22, fontWeight: "800", color: "#111827" },
  subGreeting: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  loadingBox: { paddingVertical: 32, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 10 },
  kpiCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiValue: { fontSize: 28, fontWeight: "800" },
  kpiLabel: { fontSize: 11, color: "#6B7280", marginTop: 2, fontWeight: "500" },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 10,
  },
  actionCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  actionEmoji: { fontSize: 28 },
  actionLabel: { fontSize: 12, fontWeight: "600", color: "#374151", textAlign: "center" },
});
