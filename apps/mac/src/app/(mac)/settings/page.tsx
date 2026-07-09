"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Shield, LogOut, User, Server, Clock } from "lucide-react";
import { format } from "date-fns";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1];
    if (!base64) return null;
    return JSON.parse(atob(base64.replace(/-/g, "+").replace(/_/g, "/"))) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>("—");
  const [role, setRole] = useState<string>("—");
  const [issuedAt, setIssuedAt] = useState<string>("—");
  const [expiresAt, setExpiresAt] = useState<string>("—");
  const [apiUrl, setApiUrl] = useState<string>("—");

  useEffect(() => {
    setApiUrl(
      process.env.NEXT_PUBLIC_MAC_API_URL ??
        `${window.location.protocol}//${window.location.hostname}:3001`,
    );
    const token = localStorage.getItem("mac_token");
    if (!token) return;
    const p = decodeJwtPayload(token);
    if (!p) return;
    if (typeof p.email === "string") setEmail(p.email);
    if (typeof p.role === "string") setRole(p.role);
    if (typeof p.iat === "number") setIssuedAt(format(new Date(p.iat * 1000), "dd MMM yyyy HH:mm"));
    if (typeof p.exp === "number") setExpiresAt(format(new Date(p.exp * 1000), "dd MMM yyyy HH:mm"));
  }, []);

  function handleLogout() {
    localStorage.removeItem("mac_token");
    router.replace("/login");
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500">Operator session and console configuration</p>
      </div>

      {/* Operator identity */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <User className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Operator</h2>
        </div>
        <div className="divide-y divide-slate-50">
          <InfoRow label="Email" value={email} />
          <InfoRow
            label="Role"
            value={<span className="font-mono text-xs text-slate-600">{role}</span>}
          />
        </div>
      </div>

      {/* Session */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <Clock className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Session</h2>
        </div>
        <div className="divide-y divide-slate-50">
          <InfoRow label="Issued" value={issuedAt} />
          <InfoRow label="Expires" value={expiresAt} />
        </div>
      </div>

      {/* Console config */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <Server className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Console</h2>
        </div>
        <div className="divide-y divide-slate-50">
          <InfoRow
            label="API endpoint"
            value={<span className="font-mono text-xs text-slate-600">{apiUrl}</span>}
          />
          <InfoRow label="Console" value="Coheron MAC v0.1.0" />
        </div>
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
        <div className="text-xs text-slate-600">
          <p className="font-semibold text-slate-700">Privileged access</p>
          <p className="mt-1">
            Operator credentials and configuration are managed server-side via environment
            variables and are not editable from this console. Every action you take is recorded in
            the tamper-evident audit log.
          </p>
        </div>
      </div>

      {/* Logout */}
      <div className="flex justify-end">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>

      <div className="flex items-center gap-2 pt-1 text-xs text-slate-400">
        <Settings className="h-3.5 w-3.5" />
        Read-only console settings
      </div>
    </div>
  );
}
