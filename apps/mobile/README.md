# CoheronConnect Mobile App

React Native + Expo mobile application for CoheronConnect — India's leading SMB ERP platform.

## Features

- 📱 **Dashboard** — Real-time KPI overview (open tickets, pending approvals, incidents)
- 🎫 **ITSM Tickets** — Create, view, and search tickets; status updates
- ✅ **Approvals** — One-tap approve/reject for pending requests
- 👤 **HR Self-Service** — Leave requests, expense claims, attendance check-in
- 🔔 **Push Notifications** — Ticket assignments, leave approvals, expense status via Expo
- 🌐 **WhatsApp** — Notifications delivered via WhatsApp Business API
- 🔐 **Secure Auth** — JWT tokens persisted in expo-secure-store

## Setup

```bash
# Install dependencies
cd apps/mobile
pnpm install

# Start development server
pnpm start

# Run on Android
pnpm android

# Run on iOS
pnpm ios
```

## Environment variables

Create `.env.local` in `apps/mobile/`:

```env
EXPO_PUBLIC_API_URL=https://api.yourdomain.com/trpc
EXPO_PUBLIC_APP_URL=https://app.yourdomain.com
```

## Building for distribution

Uses [EAS Build](https://docs.expo.dev/build/introduction/):

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure
eas login
eas build:configure

# Build Android APK/AAB
eas build --platform android

# Build iOS IPA
eas build --platform ios
```

## Structure

```
apps/mobile/
├── src/
│   ├── screens/          # Screen components
│   │   ├── DashboardScreen.tsx
│   │   ├── LoginScreen.tsx
│   │   ├── TicketsScreen.tsx
│   │   └── ApprovalsScreen.tsx
│   ├── navigation/       # Expo Router navigation
│   ├── components/       # Shared UI components
│   ├── hooks/            # Custom React hooks
│   └── lib/
│       ├── trpc.ts       # tRPC client
│       ├── auth-store.ts # Zustand auth state
│       └── push-notifications.ts
├── assets/               # App icons, splash screen
├── app.json
└── package.json
```
