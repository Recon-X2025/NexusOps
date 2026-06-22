/**
 * CoheronConnect Mobile — tRPC client setup
 * Connects to the same tRPC API server used by the web app.
 *
 * Set EXPO_PUBLIC_API_URL in app.config.ts or .env.local:
 *   EXPO_PUBLIC_API_URL=https://api.yourdomain.com/trpc
 */

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import * as SecureStore from "expo-secure-store";
import type { AppRouter } from "@coheronconnect/api/src/routers";

export const trpc = createTRPCReact<AppRouter>();

export function getTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/trpc"}`,
        transformer: SuperJSON,
        async headers() {
          const token = await SecureStore.getItemAsync("coheronconnect_token");
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
