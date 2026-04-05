/**
 * Auth store for NexusOps Mobile
 * Persists session token via expo-secure-store.
 */

import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

interface AuthState {
  token:     string | null;
  userId:    string | null;
  orgId:     string | null;
  userName:  string | null;
  role:      string | null;
  isLoaded:  boolean;
  setAuth:   (data: { token: string; userId: string; orgId: string; userName: string; role: string }) => void;
  clearAuth: () => void;
  loadAuth:  () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token:    null,
  userId:   null,
  orgId:    null,
  userName: null,
  role:     null,
  isLoaded: false,

  setAuth: async (data) => {
    await SecureStore.setItemAsync("nexusops_token",  data.token);
    await SecureStore.setItemAsync("nexusops_user",   JSON.stringify({ userId: data.userId, orgId: data.orgId, userName: data.userName, role: data.role }));
    set({ ...data, isLoaded: true });
  },

  clearAuth: async () => {
    await SecureStore.deleteItemAsync("nexusops_token");
    await SecureStore.deleteItemAsync("nexusops_user");
    set({ token: null, userId: null, orgId: null, userName: null, role: null });
  },

  loadAuth: async () => {
    try {
      const token = await SecureStore.getItemAsync("nexusops_token");
      const raw   = await SecureStore.getItemAsync("nexusops_user");
      if (token && raw) {
        const user = JSON.parse(raw);
        set({ token, ...user, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },
}));
