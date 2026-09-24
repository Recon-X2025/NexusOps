import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

interface RouterContextType {
  path: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextType | null>(null);

function getHashPath(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/';
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(getHashPath());

  useEffect(() => {
    const onHashChange = () => setPath(getHashPath());
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) {
      window.location.hash = '#/';
    }
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((to: string) => {
    window.location.hash = '#' + to;
    setPath(to);
  }, []);

  return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used within RouterProvider');
  return ctx;
}

interface LinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  title?: string;
}

export function Link({ to, children, className, onClick, title }: LinkProps) {
  const { navigate } = useRouter();
  return (
    <a
      href={'#' + to}
      title={title}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
        onClick?.();
      }}
    >
      {children}
    </a>
  );
}

interface NavLinkProps {
  to: string;
  children: ReactNode;
  className?: string | ((args: { isActive: boolean }) => string);
  onClick?: () => void;
  title?: string;
}

export function NavLink({ to, children, className, onClick, title }: NavLinkProps) {
  const { path, navigate } = useRouter();
  const isActive = path === to;
  const resolvedClass = typeof className === 'function' ? className({ isActive }) : className;
  return (
    <a
      href={'#' + to}
      title={title}
      className={resolvedClass}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
        onClick?.();
      }}
    >
      {children}
    </a>
  );
}

export function matchRoute(pattern: string, path: string): boolean {
  return pattern === path;
}
