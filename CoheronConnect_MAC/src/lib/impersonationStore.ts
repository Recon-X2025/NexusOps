import type { ImpersonationSessionRecord } from './api';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCHITECTURAL SECURITY PRINCIPLE:
 * This local storage tracker is strictly a CLIENT-SIDE UI CACHE & OPERATOR AUDIT LOG.
 * It is NEVER the security authority.
 *
 * True security authority is strictly enforced on the server:
 * 1. PostgreSQL `sessions` table (`impersonated_by: operatorEmail`).
 * 2. Backend TTL validation on every authenticated tenant request.
 * 3. Emergency revocation via `mac.revokeOrgSessions` which physically deletes
 *    the session records in PostgreSQL.
 *
 * Tampering with `cc_mac_impersonation_sessions` in browser DevTools cannot grant
 * unauthorized access, because all tenant portal requests are validated directly
 * against PostgreSQL sessions by the API gateway.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const STORAGE_KEY = 'cc_mac_impersonation_sessions';
const UPDATE_EVENT = 'cc_impersonation_updated';

function notifyListeners() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }
}

/**
 * Get all impersonation sessions, automatically marking expired sessions
 */
export function getImpersonationSessions(): ImpersonationSessionRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as ImpersonationSessionRecord[];
    if (!Array.isArray(list)) return [];

    const now = new Date().getTime();
    let changed = false;

    const normalized = list.map((session) => {
      const expTime = new Date(session.expiresAt).getTime();
      if (session.status === 'active' && now >= expTime) {
        changed = true;
        return { ...session, status: 'expired' as const };
      }
      return session;
    });

    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    }

    return normalized.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  } catch (err) {
    console.error('Failed to parse impersonation sessions from storage:', err);
    return [];
  }
}

/**
 * Save a newly minted impersonation session
 */
export function saveImpersonationSession(session: ImpersonationSessionRecord): void {
  const current = getImpersonationSessions();
  // Filter out any duplicate with same ID
  const filtered = current.filter((s) => s.id !== session.id);
  const updated = [session, ...filtered];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    notifyListeners();
  } catch (err) {
    console.error('Failed to save impersonation session:', err);
  }
}

/**
 * Terminate a session early
 */
export function terminateImpersonationSession(sessionId: string): void {
  const current = getImpersonationSessions();
  const nowIso = new Date().toISOString();
  const updated = current.map((s) => {
    if (s.id === sessionId || s.token === sessionId) {
      return {
        ...s,
        status: 'terminated' as const,
        terminatedAt: nowIso,
      };
    }
    return s;
  });

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    notifyListeners();
  } catch (err) {
    console.error('Failed to terminate impersonation session in store:', err);
  }
}

/**
 * Subscribe to store changes (updates on window storage or local events)
 */
export function subscribeToImpersonationUpdates(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustom = () => cb();
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };

  window.addEventListener(UPDATE_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(UPDATE_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}

/**
 * Calculate human-readable time remaining for active countdown display
 */
export function formatTimeRemaining(expiresAt: string): {
  text: string;
  isExpired: boolean;
  secondsLeft: number;
} {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) {
    return { text: 'Expired', isExpired: true, secondsLeft: 0 };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return {
    text: `${mm}:${ss} left`,
    isExpired: false,
    secondsLeft: totalSeconds,
  };
}
