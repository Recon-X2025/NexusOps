"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, Suspense, Fragment } from "react";
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
  const { currentUser, mergeTrpcQueryOpts } = useRBAC();
  const utils = trpc.useUtils();
  const meQ = trpc.auth.me.useQuery(undefined, { refetchOnWindowFocus: false });
  const avatarUrl = (meQ.data?.user as { avatarUrl?: string | null } | undefined)?.avatarUrl ?? null;
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

  const uploadAvatar = trpc.auth.uploadAvatar.useMutation({
    onSuccess: () => {
      toast.success("Profile photo updated");
      void utils.auth.me.invalidate();
    },
    onError: (err) => toast.error(err?.message ?? "Failed to upload photo"),
  });

  function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Use a PNG, JPEG, or WebP image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5MB or smaller");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      uploadAvatar.mutate({ mimeType: file.type as "image/png" | "image/jpeg" | "image/webp", contentBase64: base64 });
    };
    reader.readAsDataURL(file);
  }

  function handleSave() {
    const { email: _e, ...rest } = form;
    updateProfile.mutate(rest);
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      {/* Avatar */}
      <div className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg">
        <div className="relative">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={currentUser.name} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-h4 font-bold text-white">
              {currentUser.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
          )}
          <label className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-muted border border-border shadow-sm hover:bg-accent transition cursor-pointer">
            {uploadAvatar.isPending ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : <Camera className="h-3 w-3 text-muted-foreground" />}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleAvatarSelect} disabled={uploadAvatar.isPending} />
          </label>
        </div>
        <div>
          <p className="font-semibold text-body-sm">{currentUser.name}</p>
          <p className="text-caption text-muted-foreground">{currentUser.email}</p>
          <div className="flex gap-1 mt-1 flex-wrap">
            {currentUser.roles.map((r) => (
              <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">{r}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="grid grid-cols-2 gap-3 p-4 bg-card border border-border rounded-lg">
        <h2 className="col-span-2 text-caption font-semibold text-muted-foreground uppercase tracking-wider mb-1">Personal Information</h2>
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
                className="w-full rounded border border-input bg-background pl-8 pr-3 py-1.5 text-body-sm focus:outline-none focus:ring-1 focus:ring-primary"
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
            className="w-full rounded border border-input bg-background px-3 py-1.5 text-body-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={updateProfile.isPending}
        className="flex items-center gap-2 self-start rounded bg-primary px-4 py-2 text-body-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition"
      >
        {updateProfile.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        {updateProfile.isPending ? "Saving…" : "Save Changes"}
      </button>
    </div>
  );
}

/**
 * Self-contained TOTP MFA panel driven by the `auth.mfa.*` procedures.
 * Three visual states: not-enrolled (start button), enrolling (QR + code +
 * backup-codes dialog), enrolled (status + disable).
 */
function MfaSection() {
  const utils = trpc.useUtils();
  const statusQuery = trpc.auth.mfa.status.useQuery(undefined, { refetchOnWindowFocus: false });

  // Enrollment flow state.
  const [enroll, setEnroll] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Disable flow state.
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disableIsBackup, setDisableIsBackup] = useState(false);

  const startEnroll = trpc.auth.mfa.startEnroll.useMutation({
    onSuccess: (data) => {
      setEnroll({ qrDataUrl: data.qrDataUrl, secret: data.secret });
      setConfirmCode("");
    },
    onError: (err) => toast.error(err?.message ?? "Could not start enrollment"),
  });

  const confirmEnroll = trpc.auth.mfa.confirmEnroll.useMutation({
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setEnroll(null);
      setConfirmCode("");
      void utils.auth.mfa.status.invalidate();
      toast.success("Two-factor authentication enabled");
    },
    onError: (err) => toast.error(err?.message ?? "Invalid code"),
  });

  const disable = trpc.auth.mfa.disable.useMutation({
    onSuccess: () => {
      setShowDisable(false);
      setDisableCode("");
      setDisableIsBackup(false);
      void utils.auth.mfa.status.invalidate();
      toast.success("Two-factor authentication disabled");
    },
    onError: (err) => toast.error(err?.message ?? "Invalid code"),
  });

  const enrolled = statusQuery.data?.enrolled ?? false;
  const remaining = statusQuery.data?.backupCodesRemaining ?? 0;

  return (
    <div className="p-4 bg-card border border-border rounded-lg flex flex-col gap-3">
      <h2 className="text-caption font-semibold text-muted-foreground uppercase tracking-wider">Two-Factor Authentication</h2>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-body-sm font-medium">Authenticator App (TOTP)</p>
          <p className="text-caption text-muted-foreground">Use Google Authenticator or a similar app to generate codes.</p>
        </div>
        {enrolled ? (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">Enabled</span>
        ) : (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200">Not enabled</span>
        )}
      </div>

      {/* Enrolled: show remaining backup codes + disable */}
      {enrolled && !showDisable && (
        <div className="flex items-center justify-between">
          <p className="text-caption text-muted-foreground">{remaining} backup code{remaining === 1 ? "" : "s"} remaining</p>
          <button
            onClick={() => { setShowDisable(true); setDisableCode(""); setDisableIsBackup(false); }}
            className="flex items-center gap-2 rounded border border-border px-3 py-1.5 text-caption font-medium hover:bg-accent transition"
          >
            <Shield className="h-3.5 w-3.5" />
            Disable 2FA
          </button>
        </div>
      )}

      {/* Enrolled: disable form (requires a current code) */}
      {enrolled && showDisable && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-caption text-muted-foreground">
            Enter a current {disableIsBackup ? "backup code" : "authenticator code"} to confirm disabling 2FA.
          </p>
          <input
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            placeholder={disableIsBackup ? "xxxxx-xxxxx" : "123456"}
            className="w-full max-w-xs rounded border border-input bg-background px-3 py-1.5 text-body-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() => disable.mutate({ code: disableCode.trim(), isBackupCode: disableIsBackup })}
              disabled={disable.isPending || disableCode.trim().length === 0}
              className="flex items-center gap-2 rounded bg-red-600 px-3 py-1.5 text-caption font-medium text-white hover:bg-red-500 disabled:opacity-60 transition"
            >
              {disable.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm disable
            </button>
            <button
              onClick={() => { setDisableIsBackup((v) => !v); setDisableCode(""); }}
              className="text-caption text-primary hover:underline"
            >
              {disableIsBackup ? "Use authenticator code" : "Use a backup code"}
            </button>
            <button
              onClick={() => { setShowDisable(false); setDisableCode(""); }}
              className="text-caption text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Not enrolled + not mid-enroll: start button */}
      {!enrolled && !enroll && (
        <button
          onClick={() => startEnroll.mutate()}
          disabled={startEnroll.isPending}
          className="flex items-center gap-2 self-start rounded border border-border px-3 py-1.5 text-caption font-medium hover:bg-accent transition disabled:opacity-60"
        >
          {startEnroll.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
          Enable 2FA
        </button>
      )}

      {/* Mid-enroll: QR + secret + confirm code */}
      {!enrolled && enroll && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <p className="text-caption text-muted-foreground">
            1. Scan this QR code with your authenticator app (or enter the secret manually).
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qrDataUrl} alt="TOTP QR code" className="h-40 w-40 rounded bg-white p-2" />
          <code className="text-caption break-all rounded bg-muted px-2 py-1 font-mono">{enroll.secret}</code>
          <p className="text-caption text-muted-foreground">2. Enter the 6-digit code to confirm.</p>
          <div className="flex items-center gap-2">
            <input
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className="w-32 rounded border border-input bg-background px-3 py-1.5 text-center text-body-sm tracking-widest focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={() => confirmEnroll.mutate({ code: confirmCode.trim() })}
              disabled={confirmEnroll.isPending || confirmCode.trim().length === 0}
              className="flex items-center gap-2 rounded bg-primary px-3 py-1.5 text-caption font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition"
            >
              {confirmEnroll.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm
            </button>
            <button
              onClick={() => { setEnroll(null); setConfirmCode(""); }}
              className="text-caption text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Backup codes dialog (shown once after confirm) */}
      {backupCodes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl flex flex-col gap-3">
            <h3 className="text-body font-semibold">Save your backup codes</h3>
            <p className="text-caption text-muted-foreground">
              Each code can be used once if you lose access to your authenticator. Store them somewhere safe — they will not be shown again.
            </p>
            <div className="grid grid-cols-2 gap-2 rounded bg-muted p-3 font-mono text-body-sm">
              {backupCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(backupCodes.join("\n"));
                toast.success("Backup codes copied");
              }}
              className="self-start rounded border border-border px-3 py-1.5 text-caption font-medium hover:bg-accent transition"
            >
              Copy codes
            </button>
            <button
              onClick={() => setBackupCodes(null)}
              className="self-end rounded bg-primary px-4 py-2 text-body-sm font-medium text-white hover:bg-primary/90 transition"
            >
              I&apos;ve saved them
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SecurityTab() {
  const { mergeTrpcQueryOpts } = useRBAC();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ current: "", newPwd: "", confirm: "" });

  const sessionsQuery = trpc.auth.listMySessions.useQuery(undefined, mergeTrpcQueryOpts("auth.listMySessions", undefined));
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
        <h2 className="text-caption font-semibold text-muted-foreground uppercase tracking-wider">Change Password</h2>
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
                className="w-full rounded border border-input bg-background px-3 py-1.5 text-body-sm pr-9 focus:outline-none focus:ring-1 focus:ring-primary"
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
          className="flex items-center gap-2 self-start rounded bg-primary px-4 py-2 text-body-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition mt-1"
        >
          {changePassword.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          {changePassword.isPending ? "Updating…" : "Update Password"}
        </button>
      </div>

      {/* MFA */}
      <MfaSection />

      {/* Sessions */}
      <div className="p-4 bg-card border border-border rounded-lg flex flex-col gap-3">
        <h2 className="text-caption font-semibold text-muted-foreground uppercase tracking-wider">Active Sessions</h2>
        {sessionsQuery.isLoading ? (
          <div className="text-caption text-muted-foreground">Loading sessions…</div>
        ) : (
          (sessionsQuery.data ?? []).map((s: any) => (
            <div key={s.id} className="flex items-center justify-between text-body-sm">
              <div>
                <p className="font-medium text-foreground/90">{s.userAgent ?? "Unknown device"}</p>
                <p className="text-caption text-muted-foreground">{s.ipAddress ?? "Unknown IP"} · {new Date(s.createdAt).toLocaleDateString()}</p>
              </div>
              {s.isCurrent
                ? <span className="text-[10px] text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">Current</span>
                : <button
                    onClick={() => revokeSession.mutate({ sessionId: s.id })}
                    disabled={revokeSession.isPending}
                    className="text-caption text-red-500 hover:text-red-600 transition disabled:opacity-50"
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
  const { mergeTrpcQueryOpts } = useRBAC();
  const CHANNELS = ["email", "in_app"] as const;
  const EVENT_GROUPS = [
    { group: "Tickets & Incidents", events: ["ticket_assigned", "ticket_updated", "sla_breach", "ticket_resolved"] },
    { group: "Approvals", events: ["approval_requested", "approval_actioned"] },
    { group: "Security", events: ["security_incident", "vulnerability_found"] },
    { group: "System", events: ["maintenance_window", "system_alert"] },
  ];

  const { data: existingPrefs } = trpc.notifications.getPreferences.useQuery(undefined, mergeTrpcQueryOpts("notifications.getPreferences", undefined));
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
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
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
                <Fragment key={group}>
                  <tr>
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
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 self-start rounded bg-primary px-4 py-2 text-body-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        {saving ? "Saving…" : "Save Preferences"}
      </button>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="p-4 text-body-sm text-muted-foreground">Loading...</div>}>
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
        <h1 className="text-body-sm font-semibold">My Account</h1>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5">Manage your profile, password, and notification preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-caption font-medium transition border-b-2 -mb-px",
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
