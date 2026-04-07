/**
 * NexusOps Mobile — Push Notification setup
 * Registers for Expo push notifications and stores the token
 * in the user's profile for server-side delivery.
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? "";
  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "NexusOps",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#4F46E5",
    });
  }

  return tokenResult.data;
}

/** Parse an inbound push notification payload from NexusOps server. */
export interface NexusPushNotification {
  type:      "ticket" | "approval" | "incident" | "leave" | "expense" | "general";
  entityId:  string;
  title:     string;
  body:      string;
  badge?:    number;
}

export function parseNotificationPayload(notification: Notifications.Notification): NexusPushNotification | null {
  const data = notification.request.content.data as any;
  if (!data?.type) return null;
  return {
    type:     data.type,
    entityId: data.entityId ?? "",
    title:    notification.request.content.title ?? "",
    body:     notification.request.content.body  ?? "",
    badge:    data.badge,
  };
}
