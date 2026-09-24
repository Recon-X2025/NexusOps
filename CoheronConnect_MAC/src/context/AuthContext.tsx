import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { apiLogin, setToken, clearToken, ApiError, onSessionExpired, getMe } from '../lib/api';
import { useRouter } from '../lib/router';

interface AuthState {
  email: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  error: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { navigate } = useRouter();

  const isAuthenticated = email !== null;

  useEffect(() => {
    return onSessionExpired(() => {
      clearToken();
      setEmail(null);
      setError('Session expired — please log in again.');
      navigate('/login');
    });
  }, [navigate]);

  const login = useCallback(async (emailAddr: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiLogin(emailAddr, password);
      setToken(res.token);
      setEmail(res.email ?? emailAddr);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred during sign-in.');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setEmail(null);
    setError(null);
  }, []);

  // Check if we have a valid token on mount (e.g. after a page refresh
  // where the token is still in memory but the React state was reset).
  useEffect(() => {
    const token = sessionStorage.getItem('cc-token');
    if (token) {
      setToken(token);
      getMe().then((me) => {
        if (me?.user?.email) {
          setEmail(me.user.email);
        } else {
          sessionStorage.removeItem('cc-token');
          clearToken();
        }
      }).catch(() => {
        sessionStorage.removeItem('cc-token');
        clearToken();
      });
    }
  }, []);

  return (
    <AuthContext.Provider value={{ email, isAuthenticated, login, logout, error, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
