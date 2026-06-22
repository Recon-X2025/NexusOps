import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function NewExpenseScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log Expense</Text>
      <Text style={styles.body}>
        Mobile expenses are scaffolded in the navigation. Next step is wiring
        this screen to `hr.expenses.createMine` and adding receipt upload + OCR.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 20 },
  title: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 10 },
  body: { fontSize: 13, color: "#4B5563", lineHeight: 18 },
});

