import React from "react";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#4F46E5",
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="tickets" options={{ title: "Tickets" }} />
      <Tabs.Screen name="approvals" options={{ title: "Approvals" }} />
      <Tabs.Screen name="notifications" options={{ title: "Alerts" }} />
    </Tabs>
  );
}

