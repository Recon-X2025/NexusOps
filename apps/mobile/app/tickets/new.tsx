import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";

export default function NewTicketScreen() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const create = trpc.tickets.create.useMutation({
    onSuccess: () => router.replace("/(tabs)/tickets"),
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>New Ticket</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Title"
        style={styles.input}
      />
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Description (optional)"
        style={[styles.input, styles.textarea]}
        multiline
      />
      <TouchableOpacity
        style={[styles.button, !title.trim() && styles.buttonDisabled]}
        disabled={!title.trim() || create.isPending}
        onPress={() => create.mutate({ title: title.trim(), description: description.trim() || undefined })}
      >
        <Text style={styles.buttonText}>{create.isPending ? "Creating…" : "Create"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB", padding: 20 },
  title: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 12 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  textarea: { height: 110, textAlignVertical: "top" },
  button: { backgroundColor: "#4F46E5", borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontWeight: "700" },
});

