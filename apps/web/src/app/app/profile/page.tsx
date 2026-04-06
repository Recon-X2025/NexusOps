"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { useRBAC } from "@/lib/rbac-context";
import { toast } from "sonner";
import {
  User, KeyRound, Bell, Shield, Camera, Save, Loader2,
  CheckCircle2, Eye, EyeOff, Mail, Phone, Building2, Badge,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "profile",       label: "My Profile",              icon: User },
  { key: "security",      label: "Password & Security",      icon: KeyRound },
  { key: "notifications", label: "Notification Preferences", icon: Bell },
];

function ProfileTab() {
  const { currentUser } = useRBAC();
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    name: currentUser.name,
    email: currentUser.email,
    phone: "",
    department: currentUser.department ?? "",
    jobTitle: "",
    location: "",
    bio: "",
  });

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated successfully");
      utils.auth.me.invalidate();
    },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });

  function handleSave() {
    const { email: _e, ...rest } = form;
    updateProfile.mutate(rest);
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      {/* Avatar */}
      <div className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg">
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-bold text-white">
            {currentUser.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <button className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-muted border border-border shadow-sm hover:bg-accent transition">
            <Camera className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
        <div>
          <p className="font-semibold text-sm">{currentUser.name}</p>
          <p className="text-xs text-muted-foreground">{currentUser.email}</p>
          <div className="flex gap-1 mt-1 flex-wrap">
            {currentUser.roles.map((r) => (
              <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">{r}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="grid grid-cols-2 gap-3 p-4 bg-card border border-border rounded-lg">
        <h2 className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Personal Information</h2>
        {[
          { key: "name",       label: "Full Name",   icon: User,      span: 2 },
          { key: "email",      label: "Email",        icon: Mail,      span: 2 },
          { key: "phone",      label: "Phone",        icon: Phone,     span: 1 },
          { key: "location",   label: "Location",     icon: Building2, span: 1 },
          { key: "department", label: "Department",   icon: Building2, span: 1 },
          { key: "jobTitle",   label: "Job Title",    icon: Badge,     span: 1 },
        ].map(({ key, label, icon: Icon, span }) => (
          <div key={key} className={cn("flex flex-col gap-1", span === 2 ? "col-span-2" : "col-span-1")}>
            <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
            <div className="relative flex items-center">
              <Icon className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full rounded border border-input bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        ))}
        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-[11px] font-medium text-muted-foreground">Bio</label>
          <textarea
            rows={3}
            value={form.bio}
            onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            placeholder="Short professional bio…"
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={updateProfile.isPending}
        className="flex items-center gap-2 self-start rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition"
      >
        {updateProfile.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        {updateProfile.isPending ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}

function SecurityTab() {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ current: "", newPwd: "", confirm: "" });

  const sessionsQuery = trpc.auth.listMySessions.useQuery();
  const revokeSession = trpc.auth.revokeSession.useMutation({
    onSuccess: () => { toast.success("Session revoked"); sessionsQuery.refetch(); },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });
  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setForm({ current: "", newPwd: "", confirm: "" });
      toast.success("Password changed successfully");
    },
    onError: (err) => toast.error(err?.message ?? "Something went wrong"),
  });

  const strength = (() => {
    const p = form.newPwd;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  })();

  const STRENGTH_LABEL = ["", "Weak", "Fair", "Good", "Strong"];
  const STRENGTH_COLOR = ["", "bg-red-500", "bg-yellow-400", "bg-blue-500", "bg-green-500"];

  function handleSave() {
    if (!form.current) { toast.error("Enter your current password"); return; }
    if (form.newPwd.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (form.newPwd !== form.confirm) { toast.error("Passwords do not match"); return; }
    changePassword.mutate({ currentPassword: form.current, newPassword: form.newPwd });
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      {/* Change password */}
      <div className="p-4 bg-card border border-border rounded-lg flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Change Password</h2>
        {[
          { key: "current", label: "Current Password", show: showCurrent, toggle: () => setShowCurrent((v) => !v) },
          { key: "newPwd",  label: "New Password",     show: showNew,     toggle: () => setShowNew((v) => !v) },
          { key: "confirm", label: "Confirm New Password", show: showNew, toggle: () => setShowNew((v) => !v) },
        ].map(({ key, label, show, toggle }) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
            <div className="relative flex items-center">
              <input
                type={show ? "text" : "password"}
                value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm pr-9 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button type="button" onClick={toggle} className="absolute right-2.5 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {key === "newPwd" && form.newPwd && (
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex gap-0.5 flex-1">
                  {[1,2,3,4].map((n) => (
                    <div key={n} className={cn("h-1 flex-1 rounded-full", n <= strength ? STRENGTH_COLOR[strength] : "bg-muted")} />
                  ))}
                </div>
                <span className={cn("text-[10px] font-medium", strength >= 3 ? "text-green-600" : strength === 2 ? "text-yellow-600" : "text-red-600")}>
                  {STRENGTH_LABEL[strength]}
                </span>
              </div>
            )}
          </div>
        ))}
        <button
          onClick={handleSave}
          disabled={changePassword.isPending}
          className="flex items-center gap-2 self-start rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition mt-1"
        >
          {changePassword.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          {changePassword.isPending ? "Updating…" : "Update Password"}
        </button>
      </div>

      {/* MFA */}
      <div className="p-4 bg-card border border-border rounded-lg flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Two-Factor Authentication</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Authenticator App (TOTP)</p>
            <p className="text-xs text-muted-foreground">Use Google Authenticator or similar to generate codes.</p>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200">Not enabled</span>
        </div>
        <button
          onClick={() => toast.info("2FA enrollment is managed by your administrator. Contact your org admin to enable TOTP for your account.")}
          className="flex items-center gap-2 self-start rounded border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition"
        >
          <Shield className="h-3.5 w-3.5" />
          Enable 2FA
        </button>
      </div>

      {/* Sessions */}
      <div className="p-4 bg-card border border-border rounded-lg flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Sessions</h2>
        {sessionsQuery.isLoading ? (
          <div className="text-xs text-muted-foreground">Loading sessions…</div>
        ) : (
          (sessionsQuery.data ?? []).map((s: any) => (
            <div key={s.id} className="flex items-center justify-between text-sm">
              <div>
                <p className="font-medium text-foreground/90">{s.userAgent ?? "Unknown device"}</p>
                <p className="text-xs text-muted-foreground">{s.ipAddress ?? "Unknown IP"} · {new Date(s.createdAt).toLocaleDateString()}</p>
              </div>
              {s.isCurrent
                ? <span className="text-[10px] text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">Current</span>
                : <button
                    onClick={() => revokeSession.mutate({ sessionId: s.id })}
                    disabled={revokeSession.isPending}
                    className="text-xs text-red-500 hover:text-red-600 transition disabled:opacity-50"
                  >Revoke</button>
              }
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function NotificationsTab() {
  const CHANNELS = ["email", "in_app"] as const;
  const EVENT_GROUPS = [
    { group: "Tickets & Incidents", events: ["ticket_assigned", "ticket_updated", "sla_breach", "ticket_resolved"] },
    { group: "Approvals", events: ["approval_requested", "approval_actioned"] },
    { group: "Security", events: ["security_incident", "vulnerability_found"] },
    { group: "System", events: ["maintenance_window", "system_alert"] },
  ];

  const { data: existingPrefs } = trpc.notifications.getPreferences.useQuery();
  const updatePref = trpc.notifications.updatePreference.useMutation();

  const [prefs, setPrefs] = useState<Record<string, Record<string, boolean>>>(() => {
    const init: Record<string, Record<string, boolean>> = {};
    EVENT_GROUPS.forEach(({ events }) =>
      events.forEach((ev) => {
        init[ev] = { email: true, in_app: true };
      })
    );
    return init;
  });
  const [saving, setSaving] = useState(false);

  function toggle(event: string, channel: string) {
    setPrefs((p) => ({ ...p, [event]: { ...p[event], [channel]: !p[event]?.[channel] } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const allEvents = EVENT_GROUPS.flatMap(g => g.events);
      await Promise.all(allEvents.map(ev =>
        updatePref.mutateAsync({ eventType: ev, emailEnabled: prefs[ev]?.email ?? true, inAppEnabled: prefs[ev]?.in_app ?? true } as any)
      ));
      toast.success("Notification preferences saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="p-4 bg-card border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider pb-2">Event</th>
              {CHANNELS.map((ch) => (
                <th key={ch} className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider pb-2 w-20">
                  {ch === "in_app" ? "In-App" : "Email"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EVENT_GROUPS.map(({ group, events }) => (
              <>
                <tr key={group}>
                  <td colSpan={3} className="pt-3 pb-1">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{group}</span>
                  </td>
                </tr>
                {events.map((ev) => (
                  <tr key={ev} className="border-b border-border/50 last:border-0">
                    <td className="py-2 text-[13px] text-foreground/80">
                      {ev.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </td>
                    {CHANNELS.map((ch) => (
                      <td key={ch} className="py-2 text-center">
                        <button
                          onClick={() => toggle(ev, ch)}
                          className="flex items-center justify-center mx-auto"
                          aria-label={`Toggle ${ch} for ${ev}`}
                        >
                          {prefs[ev]?.[ch]
                            ? <ToggleRight className="h-5 w-5 text-primary" />
                            : <ToggleLeft className="h-5 w-5 text-muted-foreground/40" />
                          }
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 self-start rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        {saving ? "Saving…" : "Save Preferences"}
      </button>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading...</div>}>
      <ProfilePageInner />
    </Suspense>
  );
}

function ProfilePageInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "profile";
  const [activeTab, setActiveTab] = useState(
    TABS.find((t) => t.key === tabParam)?.key ?? "profile"
  );

  useEffect(() => {
    const t = TABS.find((t) => t.key === tabParam);
    if (t) setActiveTab(t.key);
  }, [tabParam]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-sm font-semibold">My Account</h1>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">Manage your profile, password, and notification preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition border-b-2 -mb-px",
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "profile"       && <ProfileTab />}
      {activeTab === "security"      && <SecurityTab />}
      {activeTab === "notifications" && <NotificationsTab />}
    </div>
  );
}
