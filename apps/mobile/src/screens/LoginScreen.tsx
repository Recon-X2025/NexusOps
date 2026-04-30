/**
 * CoheronConnect Mobile — Login Screen
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { trpc } from "@/lib/trpc";
import { useAuthStore } from "@/lib/auth-store";

export default function LoginScreen() {
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [loading, setLoading]     = useState(false);

  const setAuth = useAuthStore(s => s.setAuth);

  const loginMut = trpc.auth.login.useMutation({
    onSuccess: async (data: any) => {
      await setAuth({
        token:    data.token,
        userId:   data.user.id,
        orgId:    data.org.id,
        userName: data.user.name ?? data.user.email,
        role:     data.user.role,
      });
      router.replace("/(tabs)");
    },
    onError: (err: any) => {
      Alert.alert("Login failed", err?.message ?? "Invalid credentials");
    },
  });

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert("Required", "Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await loginMut.mutateAsync({ email: email.trim().toLowerCase(), password, rememberMe: false });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
      <View style={styles.card}>
        {/* Logo */}
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>N</Text>
        </View>
        <Text style={styles.title}>CoheronConnect</Text>
        <Text style={styles.subtitle}>Sign in to your workspace</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            placeholderTextColor="#9CA3AF"
          />

          <Text style={[styles.label, { marginTop: 12 }]}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            style={styles.input}
            placeholderTextColor="#9CA3AF"
          />

          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading || loginMut.isPending}
            style={[styles.button, (loading || loginMut.isPending) && styles.buttonDisabled]}
          >
            {(loading || loginMut.isPending)
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Sign In</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/forgot-password")} style={styles.forgotBtn}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
    alignItems: "center",
  },
  logoBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: "#4F46E5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  logoText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 28,
  },
  form: {
    width: "100%",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#F9FAFB",
  },
  button: {
    backgroundColor: "#4F46E5",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  forgotBtn: {
    marginTop: 16,
    alignItems: "center",
  },
  forgotText: {
    color: "#4F46E5",
    fontSize: 13,
    fontWeight: "500",
  },
});
