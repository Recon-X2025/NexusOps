import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function NewChangeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Raise Change</Text>
      <Text style={styles.body}>
        Change creation is scaffolded in the mobile navigation. Next step is
        wiring to the `changes` router and adding approval routing.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 20 },
  title: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 10 },
  body: { fontSize: 13, color: "#4B5563", lineHeight: 18 },
});

